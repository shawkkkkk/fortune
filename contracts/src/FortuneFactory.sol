// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {FortuneToken} from "./FortuneToken.sol";
import {FortuneCurve} from "./FortuneCurve.sol";
import {FortuneFeeRouter} from "./FortuneFeeRouter.sol";
import {FortuneAssetRegistry} from "./FortuneAssetRegistry.sol";
import {FortuneAutomationRegistry} from "./FortuneAutomationRegistry.sol";
import {FortuneMetadataRegistry} from "./FortuneMetadataRegistry.sol";
import {IFortuneTokenDeployer} from "./interfaces/IFortuneTokenDeployer.sol";
import {IFortuneVaultDeployer} from "./interfaces/IFortuneVaultDeployer.sol";
import {IFortuneFeeRouterDeployer} from "./interfaces/IFortuneFeeRouterDeployer.sol";
import {IFortuneCurveDeployer} from "./interfaces/IFortuneCurveDeployer.sol";
import {FortunePermanentLiquidityLocker} from "./FortunePermanentLiquidityLocker.sol";

contract FortuneFactory is Ownable2Step {
    using SafeERC20 for IERC20;
    error LaunchPreflightFailed(bytes32 reasonCode);
    error ZeroAddress();
    error MissingDeployerCode();
    error ZeroAdapter();
    error ZeroCreator();
    error ZeroInitialPurchase();
    error NonStandardQuote();
    error InitialBuyMismatch();
    error BadPreparedVanity();
    error FortuneVanityMismatch();
    error TokenFundFailed();
    error FortuneSuffixNotFound();
    error UnknownCurve();
    error NoAdapter();
    error AlreadyGraduated();
    uint16 public constant BPS = 10_000;
    uint8 public constant FORTUNE_ADDRESS_SUFFIX = 0xfe;
    uint256 public constant VANITY_SEARCH_LIMIT = 4096;
    uint16 public constant MIN_GRADUATION_SUPPLY_BUFFER_BPS = 1_000; // 10%
    address public constant BSC_MAINNET_V1_QUOTE =
        0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c; // WBNB
    uint256 public constant MAINNET_V1_MAX_GRADUATION_USD1E18 =
        10_000e18;
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
        string github;
        string youtube;
        string debox;
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
    IFortuneTokenDeployer public immutable tokenDeployer;
    IFortuneVaultDeployer public immutable vaultDeployer;
    IFortuneFeeRouterDeployer public immutable feeRouterDeployer;
    IFortuneCurveDeployer public immutable curveDeployer;
    address public immutable automationExecutor;
    address public immutable protocolTreasury;

    address public graduationAdapter;
    bool public launchesPaused;

    LaunchInfo[] public launches;
    mapping(address => uint256) public curveIndexPlusOne;
    mapping(address => uint256) public creatorLaunchNonce;
    mapping(address => address) public graduationAdapterForCurve;

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
        address metadataRegistry_,
        address tokenDeployer_,
        address vaultDeployer_,
        address feeRouterDeployer_,
        address curveDeployer_,
        address automationExecutor_,
        address protocolTreasury_
    ) Ownable(initialOwner) {
        if (
            registry_ == address(0) ||
            automationRegistry_ == address(0) ||
            metadataRegistry_ == address(0) ||
            tokenDeployer_ == address(0) ||
            vaultDeployer_ == address(0) ||
            feeRouterDeployer_ == address(0) ||
            curveDeployer_ == address(0) ||
            automationExecutor_ == address(0) ||
            protocolTreasury_ == address(0)
        ) revert ZeroAddress();

        if (
            registry_.code.length == 0 ||
            automationRegistry_.code.length == 0 ||
            metadataRegistry_.code.length == 0 ||
            tokenDeployer_.code.length == 0 ||
            vaultDeployer_.code.length == 0 ||
            feeRouterDeployer_.code.length == 0 ||
            curveDeployer_.code.length == 0
        ) revert MissingDeployerCode();

        registry = FortuneAssetRegistry(registry_);
        automationRegistry = FortuneAutomationRegistry(automationRegistry_);
        metadataRegistry = FortuneMetadataRegistry(metadataRegistry_);
        tokenDeployer = IFortuneTokenDeployer(tokenDeployer_);
        vaultDeployer = IFortuneVaultDeployer(vaultDeployer_);
        feeRouterDeployer = IFortuneFeeRouterDeployer(feeRouterDeployer_);
        curveDeployer = IFortuneCurveDeployer(curveDeployer_);
        automationExecutor = automationExecutor_;
        protocolTreasury = protocolTreasury_;
    }

    function setGraduationAdapter(address adapter) external onlyOwner {
        if (adapter == address(0)) revert ZeroAdapter();
        graduationAdapter = adapter;
        emit GraduationAdapterSet(adapter);
    }

    function setLiquidityLockerDepositor(
        address locker,
        address depositor,
        bool approved
    ) external onlyOwner {
        if (locker == address(0) || depositor == address(0)) {
            revert ZeroAddress();
        }

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
            metadataRegistry.factory() !=
                address(this)
        ) {
            return (false, bytes32("METADATA_NOT_BOUND"));
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
        // Mainnet v1 is an intentionally single-reserve canary. This is
        // enforced by the deployed protocol, not only by registry policy or UI.
        // Enabling multi-reserve launches on BSC mainnet requires a separately
        // reviewed factory release.
        if (block.chainid == 56) {
            if (p.quoteAssets.length != 1) {
                return (
                    false,
                    bytes32("MAINNET_SINGLE_QUOTE")
                );
            }
            if (
                p.quoteAssets[0] !=
                    BSC_MAINNET_V1_QUOTE ||
                p.primaryQuote !=
                    BSC_MAINNET_V1_QUOTE
            ) {
                return (
                    false,
                    bytes32("MAINNET_WBNB_ONLY")
                );
            }
            if (
                p.graduationUsd1e18 >
                    MAINNET_V1_MAX_GRADUATION_USD1E18
            ) {
                return (
                    false,
                    bytes32("MAINNET_GRADUATION_CAP")
                );
            }
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

        uint256 soldAtGraduation;
        uint256 anchorAtGraduation;

        if (p.slopeUsd1e18 == 0) {
            soldAtGraduation =
                Math.mulDiv(
                    p.graduationUsd1e18,
                    1e18,
                    p.basePriceUsd1e18
                );
            anchorAtGraduation =
                p.basePriceUsd1e18;
        } else {
            uint256 radicand =
                p.basePriceUsd1e18 *
                    p.basePriceUsd1e18 +
                2 *
                    p.slopeUsd1e18 *
                    p.graduationUsd1e18;

            uint256 terminalPrice =
                Math.sqrt(radicand);

            if (
                terminalPrice <=
                p.basePriceUsd1e18
            ) {
                return (false, bytes32("CURVE_TOO_SMALL"));
            }

            soldAtGraduation =
                Math.mulDiv(
                    terminalPrice -
                        p.basePriceUsd1e18,
                    1e18,
                    p.slopeUsd1e18
                );

            anchorAtGraduation =
                p.basePriceUsd1e18 +
                Math.mulDiv(
                    p.slopeUsd1e18,
                    soldAtGraduation,
                    1e18
                );
        }

        if (
            soldAtGraduation == 0 ||
            anchorAtGraduation == 0
        ) {
            return (false, bytes32("ZERO_GRADUATION_OUTPUT"));
        }

        uint256 lpTokensAtGraduation =
            Math.mulDiv(
                p.graduationUsd1e18,
                1e18,
                anchorAtGraduation
            );

        uint256 minimumSupply =
            Math.mulDiv(
                soldAtGraduation +
                    lpTokensAtGraduation,
                BPS +
                    MIN_GRADUATION_SUPPLY_BUFFER_BPS,
                BPS
            );

        if (p.totalSupply < minimumSupply) {
            return (false, bytes32("SUPPLY_TOO_SMALL"));
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
            bytes(p.telegram).length > 512 ||
            bytes(p.github).length > 512 ||
            bytes(p.youtube).length > 512 ||
            bytes(p.debox).length > 512
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

            if (p.weightsBps[i] == 0) {
                return (false, bytes32("ZERO_WEIGHT"));
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
        if (block.chainid == 56 && totalFeeBps > 100) {
            return (false, bytes32("MAINNET_FEE_CAP"));
        }
        if (p.feeBps[4] > 0 && p.treasury == address(0)) {
            return (false, bytes32("TREASURY_REQUIRED"));
        }

        return (true, bytes32("OK"));
    }

    /// @notice View-only vanity search. Run this through eth_call before the
    ///         deployment transaction so the expensive salt search never consumes
    ///         launch gas.
    function previewPreparedVanity(
        address creator,
        LaunchParams calldata p
    )
        external
        view
        returns (
            bytes32 vanitySalt,
            address predictedToken,
            bytes32 manifestHash,
            uint256 launchNonce
        )
    {
        if (creator == address(0)) revert ZeroCreator();

        launchNonce =
            creatorLaunchNonce[creator];
        manifestHash =
            _manifestHash(
                creator,
                launchNonce,
                p
            );

        (vanitySalt, predictedToken) =
            _findFortuneSalt(
                creator,
                p,
                manifestHash
            );
    }

    /// @notice Research/backward-compatible launch path. Production clients
    ///         should use createLaunchPrepared so vanity search happens offchain.
    function createLaunch(LaunchParams calldata p)
        external
        returns (LaunchInfo memory info)
    {
        return
            _createLaunch(
                p,
                bytes32(0),
                false
            );
    }

    /// @notice Gas-predictable launch path using a vanity salt computed by
    ///         previewPreparedVanity in a free eth_call.
    function createLaunchPrepared(
        LaunchParams calldata p,
        bytes32 vanitySalt
    )
        external
        returns (LaunchInfo memory info)
    {
        return
            _createLaunch(
                p,
                vanitySalt,
                true
            );
    }

    /// @notice Atomically creates a launch and executes the creator's first curve
    ///         purchase. The quote allowance is granted beforehand, but no third
    ///         party can trade between deployment and this buy because both actions
    ///         execute inside the same transaction.
    function createLaunchPreparedAndBuy(
        LaunchParams calldata p,
        bytes32 vanitySalt,
        uint256 amountIn,
        uint256 minTokensOut
    )
        external
        returns (
            LaunchInfo memory info,
            uint256 tokensOut
        )
    {
        if (amountIn == 0) revert ZeroInitialPurchase();

        info =
            _createLaunch(
                p,
                vanitySalt,
                true
            );

        IERC20 quote =
            IERC20(p.primaryQuote);
        IERC20 launchToken =
            IERC20(info.token);

        uint256 quoteBefore =
            quote.balanceOf(
                address(this)
            );

        quote.safeTransferFrom(
            msg.sender,
            address(this),
            amountIn
        );

        if (
            quote.balanceOf(address(this)) !=
            quoteBefore + amountIn
        ) revert NonStandardQuote();

        quote.forceApprove(
            info.curve,
            amountIn
        );

        uint256 tokenBefore =
            launchToken.balanceOf(
                address(this)
            );

        tokensOut =
            FortuneCurve(
                info.curve
            ).buy(
                p.primaryQuote,
                amountIn,
                minTokensOut
            );

        quote.forceApprove(
            info.curve,
            0
        );

        uint256 received =
            launchToken.balanceOf(
                address(this)
            ) -
            tokenBefore;

        if (received != tokensOut || received == 0) {
            revert InitialBuyMismatch();
        }

        launchToken.safeTransfer(
            msg.sender,
            received
        );

        uint256 quoteAfter =
            quote.balanceOf(
                address(this)
            );

        if (
            quoteAfter >
            quoteBefore
        ) {
            quote.safeTransfer(
                msg.sender,
                quoteAfter -
                    quoteBefore
            );
        }
    }

    function _createLaunch(
        LaunchParams calldata p,
        bytes32 suppliedSalt,
        bool prepared
    )
        internal
        returns (LaunchInfo memory info)
    {
        (bool ready, bytes32 reasonCode) =
            preflightLaunch(p);

        if (!ready) {
            revert LaunchPreflightFailed(
                reasonCode
            );
        }

        uint256 launchNonce =
            creatorLaunchNonce[msg.sender];

        bytes32 manifestHash =
            _manifestHash(
                msg.sender,
                launchNonce,
                p
            );

        bytes32 vanitySalt;
        address predictedToken;

        if (prepared) {
            vanitySalt = suppliedSalt;
            predictedToken =
                tokenDeployer.predict(
                    address(this),
                    p.name,
                    p.symbol,
                    p.totalSupply,
                    manifestHash,
                    vanitySalt
                );

            if (!hasFortuneSuffix(predictedToken)) {
                revert BadPreparedVanity();
            }
        } else {
            (
                vanitySalt,
                predictedToken
            ) = _findFortuneSalt(
                msg.sender,
                p,
                manifestHash
            );
        }

        creatorLaunchNonce[msg.sender] =
            launchNonce + 1;

        address tokenAddress =
            tokenDeployer.deploy(
                address(this),
                p.name,
                p.symbol,
                p.totalSupply,
                manifestHash,
                vanitySalt
            );

        FortuneToken token =
            FortuneToken(tokenAddress);

        if (
            tokenAddress != predictedToken ||
            !hasFortuneSuffix(tokenAddress)
        ) revert FortuneVanityMismatch();

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
                telegram: p.telegram,
                github: p.github,
                youtube: p.youtube,
                debox: p.debox
            })
        );

        address holderVault =
            _automationVault(
                p.feeBps[1] > 0 ||
                        p.feeBps[0] > 0
                    ? uint16(1)
                    : uint16(0),
                FortuneAutomationRegistry
                    .Purpose
                    .HolderRewards,
                address(token)
            );

        address buybackVault =
            _automationVault(
                p.feeBps[2],
                FortuneAutomationRegistry
                    .Purpose
                    .BuybackBurn,
                address(token)
            );

        address liquidityVault =
            _automationVault(
                p.feeBps[3] > 0
                    ? p.feeBps[3]
                    : uint16(1),
                FortuneAutomationRegistry
                    .Purpose
                    .LiquidityReinforcement,
                address(token)
            );

        address routerAddress =
            feeRouterDeployer.deploy(
                address(this),
                msg.sender,
                holderVault,
                buybackVault,
                liquidityVault,
                p.treasury,
                protocolTreasury,
                p.feeBps
            );

        FortuneFeeRouter router =
            FortuneFeeRouter(
                routerAddress
            );

        address curveAddress =
            curveDeployer.deploy(
                IFortuneCurveDeployer
                    .CurveParams({
                        factory: address(this),
                        launchToken: tokenAddress,
                        registry: address(registry),
                        feeRouter: routerAddress,
                        shieldVault: liquidityVault,
                        quoteAssets: p.quoteAssets,
                        weightsBps: p.weightsBps,
                        basePriceUsd1e18: p.basePriceUsd1e18,
                        slopeUsd1e18: p.slopeUsd1e18,
                        graduationUsd1e18: p.graduationUsd1e18,
                        adaptiveGraduation: p.adaptiveGraduation,
                        taxProcessor: address(0),
                        curveBuyTaxBps: 0,
                        curveSellTaxBps: 0
                    })
            );

        FortuneCurve curve =
            FortuneCurve(curveAddress);

        router.setCurve(curveAddress);

        if (!token.transfer(address(curve), p.totalSupply)) {
            revert TokenFundFailed();
        }

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
        uint256 launchId =
            launches.length - 1;
        curveIndexPlusOne[
            address(curve)
        ] = launches.length;
        graduationAdapterForCurve[
            address(curve)
        ] = graduationAdapter;

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

    function _manifestHash(
        address creator,
        uint256 launchNonce,
        LaunchParams calldata p
    ) internal view returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    block.chainid,
                    address(this),
                    address(registry),
                    address(
                        automationRegistry
                    ),
                    address(metadataRegistry),
                    address(tokenDeployer),
                    address(vaultDeployer),
                    address(feeRouterDeployer),
                    address(curveDeployer),
                    automationExecutor,
                    graduationAdapter,
                    creator,
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
                    p.telegram,
                    p.github,
                    p.youtube,
                    p.debox
                )
            );
    }

    /// @notice Every Fortune-created launch token is deployed with CREATE2
    ///         so the final byte of its address is 0xfe.
    /// @dev Search happens through the small TokenDeployer rather than embedding
    ///      token creation bytecode in FortuneFactory.
    function _findFortuneSalt(
        address creator,
        LaunchParams calldata p,
        bytes32 entropy
    ) internal view returns (bytes32 salt, address predicted) {
        for (
            uint256 nonce;
            nonce < VANITY_SEARCH_LIMIT;
            ++nonce
        ) {
            salt = keccak256(
                abi.encodePacked(
                    creator,
                    entropy,
                    nonce
                )
            );

            predicted =
                tokenDeployer.predict(
                    address(this),
                    p.name,
                    p.symbol,
                    p.totalSupply,
                    entropy,
                    salt
                );

            if (
                hasFortuneSuffix(
                    predicted
                )
            ) {
                return (
                    salt,
                    predicted
                );
            }
        }

        revert FortuneSuffixNotFound();
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

        return
            vaultDeployer.deploy(
                address(
                    automationRegistry
                ),
                uint8(purpose),
                launchToken,
                automationExecutor
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
        if (curveIndexPlusOne[curve] == 0) {
            revert UnknownCurve();
        }

        address adapter =
            graduationAdapterForCurve[
                curve
            ];

        if (adapter == address(0)) revert NoAdapter();

        GraduationStatus storage status = graduationStatus[curve];
        if (status.completed) revert AlreadyGraduated();

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
        if (indexPlusOne == 0) revert UnknownCurve();

        return
            launches[indexPlusOne - 1]
                .liquidityVault;
    }

    function launchCount() external view returns (uint256) {
        return launches.length;
    }
}
