// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

import {FortuneToken} from "./FortuneToken.sol";
import {FortuneCurve} from "./FortuneCurve.sol";
import {FortuneFeeRouter} from "./FortuneFeeRouter.sol";
import {FortuneAssetRegistry} from "./FortuneAssetRegistry.sol";
import {FortuneAutomationRegistry} from "./FortuneAutomationRegistry.sol";
import {FortuneAutomationVault} from "./FortuneAutomationVault.sol";
import {FortuneMetadataRegistry} from "./FortuneMetadataRegistry.sol";
import {FortunePermanentLiquidityLocker} from "./FortunePermanentLiquidityLocker.sol";

contract FortuneFactory is Ownable2Step {
    error LaunchPreflightFailed(bytes32 reasonCode);
    uint8 public constant FORTUNE_ADDRESS_SUFFIX = 0xfe;
    uint256 public constant VANITY_SEARCH_LIMIT = 4096;
    struct LaunchParams {
        string name;
        string symbol;
        uint256 totalSupply;
        address[] quoteAssets;
        uint16[] weightsBps;
        address primaryQuote;
        uint256 basePriceUsd1e18;
        uint256 slopeUsd1e18;
        uint256 graduationUsd1e18;
        bool adaptiveGraduation;
        /// creator, holders, buyback, liquidity, community treasury, protocol
        uint16[6] feeBps;
        address treasury;
        bool metadataEditable;
        string description;
        string imageURI;
        string website;
        string xProfile;
        string telegram;
    }

    struct LaunchInfo {
        address creator;
        address token;
        address curve;
        address feeRouter;
        address holderVault;
        address buybackVault;
        address liquidityVault;
        bytes32 manifestHash;
        bytes32 vanitySalt;
        uint64 createdAt;
    }

    FortuneAssetRegistry public immutable registry;
    FortuneAutomationRegistry public immutable automationRegistry;
    FortuneMetadataRegistry public immutable metadataRegistry;
    address public immutable automationExecutor;
    address public immutable protocolTreasury;

    address public graduationAdapter;
    bool public launchesPaused;

    LaunchInfo[] public launches;
    mapping(address => uint256) public curveIndexPlusOne;
    mapping(address => uint256) public creatorLaunchNonce;

    struct GraduationStatus {
        uint64 attempts;
        uint64 failures;
        uint64 lastAttemptAt;
        bytes32 lastFailureCode;
        bool completed;
    }

    mapping(address => GraduationStatus) public graduationStatus;

    event LaunchCreated(
        uint256 indexed launchId,
        address indexed creator,
        address indexed token,
        address curve,
        bytes32 manifestHash
    );
    event FortuneVanityAddress(
        uint256 indexed launchId,
        address indexed token,
        bytes32 vanitySalt
    );
    event LaunchAutomationVaults(
        uint256 indexed launchId,
        address holderVault,
        address buybackVault,
        address liquidityVault
    );
    event GraduationAdapterSet(address indexed adapter);
    event LiquidityLockerDepositorSet(
        address indexed locker,
        address indexed depositor,
        bool approved
    );
    event LaunchPauseSet(bool paused);
    event GraduationFinalized(address indexed curve, address indexed adapter);
    event GraduationPreflightFailed(
        address indexed curve,
        address indexed adapter,
        uint256 indexed attempt,
        bytes32 reasonCode
    );
    event GraduationExecutionFailed(
        address indexed curve,
        address indexed adapter,
        uint256 indexed attempt,
        bytes32 revertHash
    );

    constructor(
        address initialOwner,
        address registry_,
        address automationRegistry_,
        address automationExecutor_,
        address protocolTreasury_
    ) Ownable(initialOwner) {
        require(
            registry_ != address(0) &&
                automationRegistry_ != address(0) &&
                automationExecutor_ != address(0) &&
                protocolTreasury_ != address(0),
            "ZERO_ADDRESS"
        );

        registry = FortuneAssetRegistry(registry_);
        automationRegistry = FortuneAutomationRegistry(automationRegistry_);
        metadataRegistry = new FortuneMetadataRegistry(address(this));
        automationExecutor = automationExecutor_;
        protocolTreasury = protocolTreasury_;
    }

    function setGraduationAdapter(address adapter) external onlyOwner {
        require(adapter != address(0), "ZERO_ADAPTER");
        graduationAdapter = adapter;
        emit GraduationAdapterSet(adapter);
    }

    function setLiquidityLockerDepositor(
        address locker,
        address depositor,
        bool approved
    ) external onlyOwner {
        require(
            locker != address(0) &&
                depositor != address(0),
            "ZERO_ADDRESS"
        );

        FortunePermanentLiquidityLocker(locker)
            .setApprovedDepositor(
                depositor,
                approved
            );

        emit LiquidityLockerDepositorSet(
            locker,
            depositor,
            approved
        );
    }

    function setLaunchesPaused(bool paused) external onlyOwner {
        launchesPaused = paused;
        emit LaunchPauseSet(paused);
    }

    /// @notice Full non-mutating launch readiness check. Frontends and integrators
    ///         should call this immediately before asking a user to sign.
    function preflightLaunch(LaunchParams calldata p)
        public
        view
        returns (bool ready, bytes32 reasonCode)
    {
        if (launchesPaused) {
            return (false, bytes32("LAUNCHES_PAUSED"));
        }
        if (
            graduationAdapter == address(0) ||
            graduationAdapter.code.length == 0
        ) {
            return (false, bytes32("NO_GRADUATION_ADAPTER"));
        }
        if (
            p.quoteAssets.length < 1 ||
            p.quoteAssets.length > 5
        ) {
            return (false, bytes32("BAD_ASSET_COUNT"));
        }
        if (p.quoteAssets.length != p.weightsBps.length) {
            return (false, bytes32("BAD_WEIGHT_LENGTH"));
        }
        if (p.totalSupply == 0) {
            return (false, bytes32("ZERO_SUPPLY"));
        }
        if (
            p.basePriceUsd1e18 == 0 ||
            p.graduationUsd1e18 == 0
        ) {
            return (false, bytes32("BAD_ECONOMICS"));
        }

        uint256 maxCurveScalar =
            uint256(type(uint120).max);

        if (
            p.basePriceUsd1e18 >
                maxCurveScalar ||
            p.slopeUsd1e18 >
                maxCurveScalar ||
            p.graduationUsd1e18 >
                maxCurveScalar
        ) {
            return (false, bytes32("ECONOMICS_RANGE"));
        }

        uint256 maxPrice =
            p.basePriceUsd1e18 +
            Math.mulDiv(
                p.slopeUsd1e18,
                p.totalSupply,
                1e18
            );

        if (maxPrice > maxCurveScalar) {
            return (false, bytes32("TERMINAL_PRICE_RANGE"));
        }

        bytes memory nameBytes = bytes(p.name);
        bytes memory symbolBytes = bytes(p.symbol);
        if (nameBytes.length == 0 || nameBytes.length > 64) {
            return (false, bytes32("BAD_NAME_LENGTH"));
        }
        if (symbolBytes.length == 0 || symbolBytes.length > 16) {
            return (false, bytes32("BAD_SYMBOL_LENGTH"));
        }
        if (bytes(p.description).length > 4096) {
            return (false, bytes32("DESCRIPTION_TOO_LONG"));
        }
        if (
            bytes(p.imageURI).length > 512 ||
            bytes(p.website).length > 512 ||
            bytes(p.xProfile).length > 512 ||
            bytes(p.telegram).length > 512
        ) {
            return (false, bytes32("METADATA_TOO_LONG"));
        }

        uint256 weightSum;
        bool primaryFound;

        for (uint256 i; i < p.quoteAssets.length; ++i) {
            address asset = p.quoteAssets[i];

            if (asset == address(0)) {
                return (false, bytes32("ZERO_QUOTE"));
            }

            for (uint256 j; j < i; ++j) {
                if (p.quoteAssets[j] == asset) {
                    return (false, bytes32("DUPLICATE_QUOTE"));
                }
            }

            if (!registry.isQuoteAsset(asset)) {
                return (false, bytes32("QUOTE_NOT_APPROVED"));
            }
            if (!registry.isGraduationAsset(asset)) {
                return (false, bytes32("GRADUATION_DISABLED"));
            }

            (
                bool healthy,
                bytes32 assetReason,
                ,
            ) = registry.assetHealth(asset);

            if (!healthy) {
                return (false, assetReason);
            }

            weightSum += p.weightsBps[i];
            if (asset == p.primaryQuote) {
                primaryFound = true;
            }
        }

        if (!primaryFound) {
            return (false, bytes32("PRIMARY_NOT_IN_BASKET"));
        }
        if (weightSum != 10_000) {
            return (false, bytes32("BAD_WEIGHTS"));
        }

        uint256 totalFeeBps;
        for (uint256 i; i < p.feeBps.length; ++i) {
            totalFeeBps += p.feeBps[i];
        }

        if (totalFeeBps == 0 || totalFeeBps > 500) {
            return (false, bytes32("BAD_TOTAL_FEE"));
        }
        if (p.feeBps[4] > 0 && p.treasury == address(0)) {
            return (false, bytes32("TREASURY_REQUIRED"));
        }

        return (true, bytes32("OK"));
    }

    function createLaunch(LaunchParams calldata p)
        external
        returns (LaunchInfo memory info)
    {
        (bool ready, bytes32 reasonCode) = preflightLaunch(p);
        if (!ready) revert LaunchPreflightFailed(reasonCode);

        require(!launchesPaused, "LAUNCHES_PAUSED");
        require(
            p.quoteAssets.length >= 1 && p.quoteAssets.length <= 5,
            "BAD_ASSET_COUNT"
        );
        require(
            p.quoteAssets.length == p.weightsBps.length,
            "BAD_WEIGHT_LENGTH"
        );
        require(p.totalSupply > 0, "ZERO_SUPPLY");

        bool primaryFound;
        uint256 weightSum;

        for (uint256 i; i < p.quoteAssets.length; ++i) {
            require(
                registry.isQuoteAsset(p.quoteAssets[i]),
                "UNAPPROVED_QUOTE"
            );
            weightSum += p.weightsBps[i];
            if (p.quoteAssets[i] == p.primaryQuote) primaryFound = true;
        }

        require(primaryFound, "PRIMARY_NOT_IN_BASKET");
        require(weightSum == 10_000, "BAD_WEIGHTS");

        uint256 launchNonce = creatorLaunchNonce[msg.sender]++;
        bytes32 manifestHash = keccak256(
            abi.encode(
                block.chainid,
                address(this),
                address(registry),
                address(automationRegistry),
                automationExecutor,
                msg.sender,
                launchNonce,
                p.name,
                p.symbol,
                p.totalSupply,
                p.quoteAssets,
                p.weightsBps,
                p.primaryQuote,
                p.basePriceUsd1e18,
                p.slopeUsd1e18,
                p.graduationUsd1e18,
                p.adaptiveGraduation,
                p.feeBps,
                p.treasury,
                p.metadataEditable,
                p.description,
                p.imageURI,
                p.website,
                p.xProfile,
                p.telegram
            )
        );

        bytes32 initCodeHash = keccak256(
            abi.encodePacked(
                type(FortuneToken).creationCode,
                abi.encode(
                    p.name,
                    p.symbol,
                    p.totalSupply,
                    manifestHash
                )
            )
        );

        (bytes32 vanitySalt, address predictedToken) =
            _findFortuneSalt(initCodeHash, manifestHash);

        FortuneToken token = new FortuneToken{salt: vanitySalt}(
            p.name,
            p.symbol,
            p.totalSupply,
            manifestHash
        );

        require(
            address(token) == predictedToken &&
                hasFortuneSuffix(address(token)),
            "FORTUNE_VANITY_MISMATCH"
        );

        metadataRegistry.registerToken(
            address(token),
            msg.sender,
            p.metadataEditable,
            FortuneMetadataRegistry.Metadata({
                displayName: p.name,
                displaySymbol: p.symbol,
                description: p.description,
                imageURI: p.imageURI,
                website: p.website,
                xProfile: p.xProfile,
                telegram: p.telegram
            })
        );

        // Create a holder vault whenever holder rewards are configured OR the
        // creator has a fee share, so creators can later surrender their own
        // share to holders without deploying a new mutable destination.
        address holderVault = _automationVault(
            p.feeBps[1] > 0 || p.feeBps[0] > 0
                ? uint16(1)
                : uint16(0),
            FortuneAutomationRegistry.Purpose.HolderRewards,
            address(token)
        );
        address buybackVault = _automationVault(
            p.feeBps[2],
            FortuneAutomationRegistry.Purpose.BuybackBurn,
            address(token)
        );
        // Launch Shield always has a non-creator destination for temporary
        // anti-snipe tax proceeds, even when normal LP reinforcement is 0 bps.
        address liquidityVault = _automationVault(
            p.feeBps[3] > 0 ? p.feeBps[3] : uint16(1),
            FortuneAutomationRegistry.Purpose.LiquidityReinforcement,
            address(token)
        );

        FortuneFeeRouter router = new FortuneFeeRouter(
            address(this),
            msg.sender,
            holderVault,
            buybackVault,
            liquidityVault,
            p.treasury,
            protocolTreasury,
            p.feeBps
        );

        FortuneCurve curve = new FortuneCurve(
            address(this),
            address(token),
            address(registry),
            address(router),
            liquidityVault,
            p.quoteAssets,
            p.weightsBps,
            p.basePriceUsd1e18,
            p.slopeUsd1e18,
            p.graduationUsd1e18,
            p.adaptiveGraduation
        );

        router.setCurve(address(curve));
        require(
            token.transfer(address(curve), p.totalSupply),
            "TOKEN_FUND_FAILED"
        );

        info = LaunchInfo({
            creator: msg.sender,
            token: address(token),
            curve: address(curve),
            feeRouter: address(router),
            holderVault: holderVault,
            buybackVault: buybackVault,
            liquidityVault: liquidityVault,
            manifestHash: manifestHash,
            vanitySalt: vanitySalt,
            createdAt: uint64(block.timestamp)
        });

        launches.push(info);
        uint256 launchId = launches.length - 1;
        curveIndexPlusOne[address(curve)] = launches.length;

        emit LaunchCreated(
            launchId,
            msg.sender,
            address(token),
            address(curve),
            manifestHash
        );
        emit FortuneVanityAddress(
            launchId,
            address(token),
            vanitySalt
        );
        emit LaunchAutomationVaults(
            launchId,
            holderVault,
            buybackVault,
            liquidityVault
        );
    }

    /// @notice Every Fortune-created launch token is deployed with CREATE2
    ///         so the final byte of its address is 0xfe.
    /// @dev A one-byte suffix takes ~256 trials on average. The bounded search
    ///      keeps launch gas predictable while making failure vanishingly rare.
    function _findFortuneSalt(
        bytes32 initCodeHash,
        bytes32 entropy
    ) internal view returns (bytes32 salt, address predicted) {
        for (uint256 nonce; nonce < VANITY_SEARCH_LIMIT; ++nonce) {
            salt = keccak256(
                abi.encodePacked(
                    msg.sender,
                    entropy,
                    nonce
                )
            );

            predicted = _computeCreate2Address(
                salt,
                initCodeHash
            );

            if (hasFortuneSuffix(predicted)) {
                return (salt, predicted);
            }
        }

        revert("FORTUNE_SUFFIX_NOT_FOUND");
    }

    function _computeCreate2Address(
        bytes32 salt,
        bytes32 initCodeHash
    ) internal view returns (address predicted) {
        predicted = address(
            uint160(
                uint256(
                    keccak256(
                        abi.encodePacked(
                            bytes1(0xff),
                            address(this),
                            salt,
                            initCodeHash
                        )
                    )
                )
            )
        );
    }

    function hasFortuneSuffix(address account)
        public
        pure
        returns (bool)
    {
        return uint8(uint160(account)) == FORTUNE_ADDRESS_SUFFIX;
    }

    function _automationVault(
        uint16 routeBps,
        FortuneAutomationRegistry.Purpose purpose,
        address launchToken
    ) internal returns (address) {
        if (routeBps == 0) return address(0);

        return address(
            new FortuneAutomationVault(
                address(automationRegistry),
                purpose,
                launchToken,
                automationExecutor
            )
        );
    }

    /// @notice Permissionless keeper entrypoint. Adapter choice remains protocol-governed.
    /// @dev Failures are recorded instead of reverting the outer transaction. The
    ///      curve's atomic graduation call rolls back all asset transfers on failure,
    ///      so another keeper may retry safely with corrected adapter data.
    function finalizeGraduation(address curve, bytes calldata data)
        external
        returns (bool success)
    {
        address adapter = graduationAdapter;
        require(adapter != address(0), "NO_ADAPTER");
        require(curveIndexPlusOne[curve] != 0, "UNKNOWN_CURVE");

        GraduationStatus storage status = graduationStatus[curve];
        require(!status.completed, "ALREADY_GRADUATED");

        status.attempts += 1;
        status.lastAttemptAt = uint64(block.timestamp);
        uint256 attempt = status.attempts;

        try FortuneCurve(curve).preflightGraduation(adapter, data)
            returns (bool ready, bytes32 reasonCode)
        {
            if (!ready) {
                status.failures += 1;
                status.lastFailureCode = reasonCode;
                emit GraduationPreflightFailed(
                    curve,
                    adapter,
                    attempt,
                    reasonCode
                );
                return false;
            }
        } catch (bytes memory preflightError) {
            bytes32 reasonHash = keccak256(preflightError);
            status.failures += 1;
            status.lastFailureCode = reasonHash;
            emit GraduationPreflightFailed(
                curve,
                adapter,
                attempt,
                reasonHash
            );
            return false;
        }

        try FortuneCurve(curve).graduate(adapter, data) {
            status.completed = true;
            status.lastFailureCode = bytes32(0);
            emit GraduationFinalized(curve, adapter);
            return true;
        } catch (bytes memory executionError) {
            bytes32 revertHash = keccak256(executionError);
            status.failures += 1;
            status.lastFailureCode = revertHash;
            emit GraduationExecutionFailed(
                curve,
                adapter,
                attempt,
                revertHash
            );
            return false;
        }
    }

    function liquidityVaultForCurve(address curve)
        external
        view
        returns (address)
    {
        uint256 indexPlusOne =
            curveIndexPlusOne[curve];
        require(indexPlusOne != 0, "UNKNOWN_CURVE");

        return
            launches[indexPlusOne - 1]
                .liquidityVault;
    }

    function launchCount() external view returns (uint256) {
        return launches.length;
    }
}
