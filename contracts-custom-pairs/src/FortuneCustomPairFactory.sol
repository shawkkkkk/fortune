// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {FortuneCustomPairCurve} from "./FortuneCustomPairCurve.sol";
import {FortuneCustomPairCurveDeployer} from "./FortuneCustomPairCurveDeployer.sol";
import {FortuneLaunchRules} from "./FortuneLaunchRules.sol";
import {IFortuneSocialFeeVault} from "./interfaces/IFortuneSocialFeeVault.sol";

/// @notice Permissionless Fortune launches paired with any BEP-20, including
///         transfer-tax tokens and tokenized stocks. UNAUDITED BETA.
/// @dev There is no pair-token registry or oracle. Each launch gets its own
///      curve, launch token and PancakeSwap V2 pool, so a badly behaved pair
///      token can only affect launches that chose it. The owner can pause new
///      launches, set the protocol fee for future launches and choose the
///      social fee vault future launches use; it has no control over curves
///      that already exist. Launches may choose optional launch rules, fixed
///      in the launch transaction by the rules contract this factory deploys.
contract FortuneCustomPairFactory is Ownable2Step {
    using SafeERC20 for IERC20;

    uint16 public constant MAX_PROTOCOL_FEE_BPS = 100;
    uint16 public constant MAX_CREATOR_FEE_BPS = 100;
    uint256 public constant MIN_SUPPLY = 1_000_000e18;
    uint256 public constant MAX_SUPPLY = 1_000_000_000_000e18;
    uint256 public constant MIN_GRADUATION_TARGET = 1_000;
    // Leaves V2's uint112 reserves room for a 99% Launch Shield on the final buy.
    uint256 public constant MAX_GRADUATION_TARGET = 2 ** 100;
    uint8 public constant MAX_PAIR_DECIMALS = 36;

    struct LaunchParams {
        string name;
        string symbol;
        uint256 supply;
        address pairToken;
        uint256 graduationTarget;
        uint16 creatorFeeBps;
        string description;
        string imageURI;
        string website;
        string xProfile;
        string telegram;
        /// Empty: creator fees go to the creator. Otherwise they go to the
        /// social fee vault, split between these wallets and social accounts.
        IFortuneSocialFeeVault.FeeShare[] feeShares;
    }

    struct Launch {
        address creator;
        address token;
        address curve;
        address pairToken;
        address pool;
        uint64 createdAt;
    }

    struct Metadata {
        string description;
        string imageURI;
        string website;
        string xProfile;
        string telegram;
    }

    address public immutable pancakeFactory;
    FortuneCustomPairCurveDeployer public immutable curveDeployer;
    /// Shared, ownerless rules contract for launches created with rules.
    /// Zero when this factory does not offer launch rules.
    FortuneLaunchRules public immutable launchRules;

    uint16 public protocolFeeBps;
    address public protocolFeeRecipient;
    bool public launchesPaused;
    address public socialFeeVault;

    Launch[] private _launches;
    mapping(address => uint256) public curveIndexPlusOne;
    mapping(address => address) public curveForToken;
    mapping(address => uint256[]) private _pairLaunchIds;
    mapping(address => uint256[]) private _creatorLaunchIds;
    mapping(address => Metadata) private _metadata;

    event LaunchCreated(
        uint256 indexed launchId,
        address indexed creator,
        address indexed pairToken,
        address token,
        address curve,
        address pool,
        uint256 supply,
        uint256 graduationTarget,
        uint16 protocolFeeBps,
        uint16 creatorFeeBps
    );
    event ProtocolFeeSet(uint16 feeBps, address indexed recipient);
    event LaunchPauseSet(bool paused);
    event SocialFeeVaultSet(address indexed vault);

    error LaunchPreflightFailed(bytes32 reasonCode);

    /// @param launchRules_ Deployed just before this factory, bound to this
    ///        factory's address (see DeployCustomPairsTestnet); zero disables
    ///        launch rules. It is not created here to keep this contract's
    ///        initcode under the EIP-3860 limit.
    constructor(
        address initialOwner,
        address pancakeFactory_,
        uint16 protocolFeeBps_,
        address protocolFeeRecipient_,
        FortuneLaunchRules launchRules_
    ) Ownable(initialOwner) {
        require(pancakeFactory_ != address(0) && pancakeFactory_.code.length > 0, "BAD_PANCAKE_FACTORY");
        require(address(launchRules_) == address(0) || launchRules_.factory() == address(this), "BAD_LAUNCH_RULES");
        pancakeFactory = pancakeFactory_;
        // Keeps the curve's bytecode out of this contract's runtime size.
        curveDeployer = new FortuneCustomPairCurveDeployer();
        launchRules = launchRules_;
        _setProtocolFee(protocolFeeBps_, protocolFeeRecipient_);
    }

    // ---------------------------------------------------------------- owner

    function setLaunchesPaused(bool paused) external onlyOwner {
        launchesPaused = paused;
        emit LaunchPauseSet(paused);
    }

    /// @notice Vault used by launches created afterwards that split their
    ///         creator fee. Zero disables split launches. Existing curves keep
    ///         the vault they were created with.
    function setSocialFeeVault(address vault) external onlyOwner {
        require(vault == address(0) || vault.code.length > 0, "BAD_VAULT");
        socialFeeVault = vault;
        emit SocialFeeVaultSet(vault);
    }

    /// @notice Applies to launches created afterwards. Existing curves keep
    ///         their fee; accrued protocol fees go to the current recipient.
    function setProtocolFee(uint16 feeBps, address recipient) external onlyOwner {
        _setProtocolFee(feeBps, recipient);
    }

    function _setProtocolFee(uint16 feeBps, address recipient) internal {
        require(feeBps <= MAX_PROTOCOL_FEE_BPS, "FEE_TOO_HIGH");
        require(recipient != address(0), "ZERO_RECIPIENT");
        protocolFeeBps = feeBps;
        protocolFeeRecipient = recipient;
        emit ProtocolFeeSet(feeBps, recipient);
    }

    // ---------------------------------------------------------------- launch

    /// @notice Free preflight. Returns the first reason a launch would revert.
    function preflight(LaunchParams calldata p) public view returns (bool ready, bytes32 reasonCode) {
        if (launchesPaused) return (false, "LAUNCHES_PAUSED");
        uint256 nameLength = bytes(p.name).length;
        uint256 symbolLength = bytes(p.symbol).length;
        if (nameLength == 0 || nameLength > 64) return (false, "BAD_NAME_LENGTH");
        if (symbolLength == 0 || symbolLength > 16) return (false, "BAD_SYMBOL_LENGTH");
        if (bytes(p.description).length > 1024) return (false, "DESCRIPTION_TOO_LONG");
        if (
            bytes(p.imageURI).length > 256 ||
            bytes(p.website).length > 256 ||
            bytes(p.xProfile).length > 256 ||
            bytes(p.telegram).length > 256
        ) return (false, "METADATA_TOO_LONG");
        if (p.supply < MIN_SUPPLY || p.supply > MAX_SUPPLY) return (false, "SUPPLY_RANGE");
        if (p.graduationTarget < MIN_GRADUATION_TARGET || p.graduationTarget > MAX_GRADUATION_TARGET) {
            return (false, "TARGET_RANGE");
        }
        if (p.creatorFeeBps > MAX_CREATOR_FEE_BPS) return (false, "CREATOR_FEE_TOO_HIGH");
        if (p.feeShares.length > 0) {
            address vault = socialFeeVault;
            if (vault == address(0)) return (false, "SOCIAL_FEES_DISABLED");
            if (p.creatorFeeBps == 0) return (false, "SHARES_NEED_CREATOR_FEE");
            (bool sharesOk, bytes32 sharesReason) = IFortuneSocialFeeVault(vault).checkShares(p.feeShares);
            if (!sharesOk) return (false, sharesReason);
        }
        (bool ok, bytes32 reason,) = checkPairToken(p.pairToken);
        if (!ok) return (false, reason);
        return (true, "OK");
    }

    /// @notice The only onchain requirements for a pair token: it is a
    ///         contract that answers the basic ERC-20 reads. Everything else
    ///         (taxes, pausing, blacklists, rebasing) is measured and disclosed
    ///         by the website, not gated here.
    function checkPairToken(address pairToken) public view returns (bool ok, bytes32 reasonCode, uint8 decimals) {
        if (pairToken == address(0) || pairToken.code.length == 0) return (false, "PAIR_NO_CODE", 0);
        if (curveIndexPlusOne[pairToken] != 0) return (false, "PAIR_IS_CURVE", 0);
        (bool decimalsOk, bytes memory decimalsData) = pairToken.staticcall(abi.encodeWithSignature("decimals()"));
        if (!decimalsOk || decimalsData.length < 32) return (false, "PAIR_DECIMALS", 0);
        uint256 rawDecimals = abi.decode(decimalsData, (uint256));
        if (rawDecimals > MAX_PAIR_DECIMALS) return (false, "PAIR_DECIMALS", 0);
        (bool supplyOk, bytes memory supplyData) = pairToken.staticcall(abi.encodeWithSignature("totalSupply()"));
        if (!supplyOk || supplyData.length < 32) return (false, "PAIR_NOT_ERC20", 0);
        (bool balanceOk, bytes memory balanceData) =
            pairToken.staticcall(abi.encodeWithSignature("balanceOf(address)", address(this)));
        if (!balanceOk || balanceData.length < 32) return (false, "PAIR_NOT_ERC20", 0);
        return (true, "OK", uint8(rawDecimals));
    }

    /// @notice Preflight for a launch with rules: the launch checks, then the
    ///         rules. `rules` is `abi.encode(FortuneLaunchRules.Rules)`.
    function preflightWithRules(LaunchParams calldata p, bytes calldata rules)
        public
        view
        returns (bool ready, bytes32 reasonCode)
    {
        (ready, reasonCode) = preflight(p);
        if (!ready) return (ready, reasonCode);
        if (address(launchRules) == address(0)) return (false, "RULES_DISABLED");
        try launchRules.checkEncodedRules(rules) returns (bool ok, bytes32 reason) {
            return (ok, reason);
        } catch {
            return (false, "RULES_ENCODING");
        }
    }

    function createLaunch(LaunchParams calldata p) external returns (address token, address curve) {
        (token, curve) = _create(p, false);
    }

    /// @notice A launch whose token enforces `rules` (`abi.encode` of a
    ///         FortuneLaunchRules.Rules) on every transfer until graduation,
    ///         fixed in this transaction for good. With `amountIn` above zero,
    ///         the creator's first buy follows, and the rules already apply to it.
    function createLaunchWithRules(LaunchParams calldata p, bytes calldata rules, uint256 amountIn, uint256 minTokensOut)
        external
        returns (address token, address curve, uint256 tokensOut)
    {
        (token, curve) = _createWithRules(p, rules);
        if (amountIn > 0) {
            IERC20(p.pairToken).safeTransferFrom(msg.sender, curve, amountIn);
            tokensOut = FortuneCustomPairCurve(curve).initialBuy(msg.sender, minTokensOut);
        }
    }

    function _createWithRules(LaunchParams calldata p, bytes calldata rules)
        internal
        returns (address token, address curve)
    {
        (bool ok, bytes32 reason) = preflightWithRules(p, rules);
        if (!ok) revert LaunchPreflightFailed(reason);
        (token, curve) = _create(p, true);
        launchRules.register(token, curve, msg.sender, p.supply, rules);
    }

    /// @notice Creates the launch and makes the creator's first buy in the same
    ///         transaction. Pair tokens move straight from the creator to the new
    ///         curve (the creator approves this factory), so a transfer tax is
    ///         only paid once. The Launch Shield applies to this buy as well.
    function createLaunchAndBuy(LaunchParams calldata p, uint256 amountIn, uint256 minTokensOut)
        external
        returns (address token, address curve, uint256 tokensOut)
    {
        require(amountIn > 0, "ZERO_INITIAL_BUY");
        (token, curve) = _create(p, false);
        IERC20(p.pairToken).safeTransferFrom(msg.sender, curve, amountIn);
        tokensOut = FortuneCustomPairCurve(curve).initialBuy(msg.sender, minTokensOut);
    }

    function _create(LaunchParams calldata p, bool withRules) internal returns (address token, address curveAddress) {
        (bool ready, bytes32 reason) = preflight(p);
        if (!ready) revert LaunchPreflightFailed(reason);
        (,, uint8 decimals) = checkPairToken(p.pairToken);
        bool split = p.feeShares.length > 0;
        address vault = socialFeeVault;

        FortuneCustomPairCurve curve = curveDeployer.deploy(
            FortuneCustomPairCurve.Config({
                factory: address(this),
                creator: msg.sender,
                name: p.name,
                symbol: p.symbol,
                supply: p.supply,
                pairToken: p.pairToken,
                pairDecimals: decimals,
                pancakeFactory: pancakeFactory,
                graduationTarget: p.graduationTarget,
                protocolFeeBps: protocolFeeBps,
                creatorFeeBps: p.creatorFeeBps,
                feeRecipient: split ? vault : msg.sender,
                rules: withRules ? address(launchRules) : address(0)
            })
        );
        curveAddress = address(curve);
        token = address(curve.launchToken());
        address pool = curve.pool();

        uint256 launchId = _launches.length;
        _launches.push(
            Launch({
                creator: msg.sender,
                token: token,
                curve: curveAddress,
                pairToken: p.pairToken,
                pool: pool,
                createdAt: uint64(block.timestamp)
            })
        );
        curveIndexPlusOne[curveAddress] = launchId + 1;
        curveForToken[token] = curveAddress;
        _pairLaunchIds[p.pairToken].push(launchId);
        _creatorLaunchIds[msg.sender].push(launchId);
        _metadata[token] = Metadata({
            description: p.description,
            imageURI: p.imageURI,
            website: p.website,
            xProfile: p.xProfile,
            telegram: p.telegram
        });
        if (split) IFortuneSocialFeeVault(vault).registerCurve(curveAddress, p.pairToken, p.feeShares);

        emit LaunchCreated(
            launchId,
            msg.sender,
            p.pairToken,
            token,
            curveAddress,
            pool,
            p.supply,
            p.graduationTarget,
            protocolFeeBps,
            p.creatorFeeBps
        );
    }

    // ----------------------------------------------------------------- views

    function launchCount() external view returns (uint256) {
        return _launches.length;
    }

    function launchAt(uint256 launchId) external view returns (Launch memory) {
        return _launches[launchId];
    }

    function metadataOf(address token) external view returns (Metadata memory) {
        return _metadata[token];
    }

    function pairLaunchCount(address pairToken) external view returns (uint256) {
        return _pairLaunchIds[pairToken].length;
    }

    function creatorLaunchCount(address creator) external view returns (uint256) {
        return _creatorLaunchIds[creator].length;
    }

    /// @notice Newest first.
    function launchIdsForPair(address pairToken, uint256 offset, uint256 limit) external view returns (uint256[] memory) {
        return _newestFirst(_pairLaunchIds[pairToken], offset, limit);
    }

    /// @notice Newest first.
    function launchIdsForCreator(address creator, uint256 offset, uint256 limit)
        external
        view
        returns (uint256[] memory)
    {
        return _newestFirst(_creatorLaunchIds[creator], offset, limit);
    }

    function _newestFirst(uint256[] storage ids, uint256 offset, uint256 limit) internal view returns (uint256[] memory page) {
        uint256 total = ids.length;
        if (offset >= total || limit == 0) return new uint256[](0);
        uint256 count = total - offset < limit ? total - offset : limit;
        page = new uint256[](count);
        for (uint256 i; i < count; ++i) page[i] = ids[total - 1 - offset - i];
    }
}
