// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

import {FortuneAssetRegistry} from "./FortuneAssetRegistry.sol";
import {FortuneAutomationRegistry} from "./FortuneAutomationRegistry.sol";
import {FortuneCurve} from "./FortuneCurve.sol";
import {FortuneFeeRouter} from "./FortuneFeeRouter.sol";
import {FortuneTaxToken} from "./FortuneTaxToken.sol";
import {FortuneTaxProcessor} from "./FortuneTaxProcessor.sol";
import {FortuneDividendVault} from "./FortuneDividendVault.sol";
import {FortunePoolRegistry} from "./FortunePoolRegistry.sol";
import {IFortuneTokenDeployer} from "./interfaces/IFortuneTokenDeployer.sol";
import {IFortuneVaultDeployer} from "./interfaces/IFortuneVaultDeployer.sol";
import {IFortuneFeeRouterDeployer} from "./interfaces/IFortuneFeeRouterDeployer.sol";
import {IFortuneCurveDeployer} from "./interfaces/IFortuneCurveDeployer.sol";

interface IFortuneFungibleLockerApproval {
    function setApprovedDepositor(
        address depositor,
        bool approved
    ) external;
}

/// @notice Dedicated, size-isolated factory for Fortune tax-token launches.
/// @dev Standard Fortune tokens keep their zero-transfer-tax ERC-20 semantics and
///      V3 graduation. Tax launches use one registry-approved quote asset, an
///      immutable tax policy, checkpointed holder dividends, bounded anti-farmer
///      protection and a separately frozen V2 graduation adapter.
contract FortuneTaxFactory is Ownable2Step {
    error LaunchPreflightFailed(bytes32 reasonCode);

    uint16 public constant BPS = 10_000;
    uint8 public constant FORTUNE_ADDRESS_SUFFIX = 0xfe;
    uint256 public constant VANITY_SEARCH_LIMIT = 4096;
    uint16 public constant MIN_GRADUATION_SUPPLY_BUFFER_BPS = 1_000;
    uint16 public constant MAX_TAX_BPS = 1_000;
    uint32 public constant MAX_ANTI_FARMER_DURATION = 365 days;

    struct TaxLaunchParams {
        string name;
        string symbol;
        uint256 totalSupply;
        address quoteAsset;
        uint256 basePriceUsd1e18;
        uint256 slopeUsd1e18;
        uint256 graduationUsd1e18;
        // Base Fortune curve fee:
        // creator, holders, buyback, liquidity, community treasury, protocol.
        uint16[6] feeBps;
        address treasury;
        // Immutable buy/sell tax, each capped at 10%.
        uint16 buyTaxBps;
        uint16 sellTaxBps;
        uint32 antiFarmerDuration;
        uint256 minimumDividendBalance;
        // Tax allocation:
        // creator, direct burn, dividends, buyback+burn,
        // liquidity reinforcement, community treasury, protocol.
        uint16[7] taxAllocationBps;
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
        address dividendVault;
        address taxProcessor;
        address liquidityVault;
        bytes32 manifestHash;
        bytes32 vanitySalt;
        uint64 createdAt;
    }

    struct GraduationStatus {
        uint64 attempts;
        uint64 failures;
        uint64 lastAttemptAt;
        bytes32 lastFailureCode;
        bool completed;
    }

    FortuneAssetRegistry public immutable registry;
    FortuneAutomationRegistry public immutable automationRegistry;
    FortunePoolRegistry public immutable poolRegistry;
    IFortuneTokenDeployer public immutable tokenDeployer;
    IFortuneVaultDeployer public immutable vaultDeployer;
    IFortuneFeeRouterDeployer public immutable feeRouterDeployer;
    IFortuneCurveDeployer public immutable curveDeployer;
    address public immutable automationExecutor;
    address public immutable protocolTreasury;

    address public graduationAdapter;
    bool public launchesPaused = true;

    LaunchInfo[] public launches;
    mapping(address => uint256) public curveIndexPlusOne;
    mapping(address => uint256) public creatorLaunchNonce;
    mapping(address => address) public graduationAdapterForCurve;
    mapping(address => GraduationStatus) public graduationStatus;

    event TaxGraduationAdapterSet(address indexed adapter);
    event LaunchPauseSet(bool paused);
    event LiquidityLockerDepositorSet(
        address indexed locker,
        address indexed depositor,
        bool approved
    );
    event TaxLaunchCreated(
        uint256 indexed launchId,
        address indexed creator,
        address indexed token,
        address curve,
        address quoteAsset,
        address taxProcessor,
        address dividendVault,
        bytes32 manifestHash
    );
    event TaxLaunchPolicy(
        uint256 indexed launchId,
        uint16 buyTaxBps,
        uint16 sellTaxBps,
        uint32 antiFarmerDuration,
        uint256 minimumDividendBalance,
        uint16[7] taxAllocationBps
    );
    event TaxLaunchMetadata(
        uint256 indexed launchId,
        string description,
        string imageURI,
        string website,
        string xProfile,
        string telegram,
        string github,
        string youtube,
        string debox
    );
    event FortuneVanityAddress(
        uint256 indexed launchId,
        address indexed token,
        bytes32 vanitySalt
    );
    event GraduationFinalized(
        address indexed curve,
        address indexed adapter
    );
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
        address poolRegistry_,
        address tokenDeployer_,
        address vaultDeployer_,
        address feeRouterDeployer_,
        address curveDeployer_,
        address automationExecutor_,
        address protocolTreasury_
    ) Ownable(initialOwner) {
        require(
            initialOwner != address(0) &&
                registry_ != address(0) &&
                automationRegistry_ != address(0) &&
                poolRegistry_ != address(0) &&
                tokenDeployer_ != address(0) &&
                vaultDeployer_ != address(0) &&
                feeRouterDeployer_ != address(0) &&
                curveDeployer_ != address(0) &&
                automationExecutor_ != address(0) &&
                protocolTreasury_ != address(0),
            "ZERO_ADDRESS"
        );
        require(
            registry_.code.length > 0 &&
                automationRegistry_.code.length > 0 &&
                poolRegistry_.code.length > 0 &&
                tokenDeployer_.code.length > 0 &&
                vaultDeployer_.code.length > 0 &&
                feeRouterDeployer_.code.length > 0 &&
                curveDeployer_.code.length > 0,
            "MISSING_CODE"
        );

        registry = FortuneAssetRegistry(registry_);
        automationRegistry =
            FortuneAutomationRegistry(automationRegistry_);
        poolRegistry = FortunePoolRegistry(poolRegistry_);
        tokenDeployer = IFortuneTokenDeployer(tokenDeployer_);
        vaultDeployer = IFortuneVaultDeployer(vaultDeployer_);
        feeRouterDeployer =
            IFortuneFeeRouterDeployer(feeRouterDeployer_);
        curveDeployer = IFortuneCurveDeployer(curveDeployer_);
        automationExecutor = automationExecutor_;
        protocolTreasury = protocolTreasury_;
    }

    function setGraduationAdapter(address adapter)
        external
        onlyOwner
    {
        require(
            adapter != address(0) &&
                adapter.code.length > 0,
            "BAD_ADAPTER"
        );
        graduationAdapter = adapter;
        emit TaxGraduationAdapterSet(adapter);
    }

    function setLaunchesPaused(bool paused)
        external
        onlyOwner
    {
        launchesPaused = paused;
        emit LaunchPauseSet(paused);
    }

    function setLiquidityLockerDepositor(
        address locker,
        address depositor,
        bool approved
    ) external onlyOwner {
        require(
            locker != address(0) &&
                depositor != address(0) &&
                locker.code.length > 0,
            "BAD_LOCKER"
        );

        IFortuneFungibleLockerApproval(locker)
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

    function preflightLaunch(
        TaxLaunchParams calldata p
    )
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

        bytes memory nameBytes = bytes(p.name);
        bytes memory symbolBytes = bytes(p.symbol);

        if (
            nameBytes.length == 0 ||
            nameBytes.length > 64
        ) {
            return (false, bytes32("BAD_NAME_LENGTH"));
        }
        if (
            symbolBytes.length == 0 ||
            symbolBytes.length > 16
        ) {
            return (false, bytes32("BAD_SYMBOL_LENGTH"));
        }
        if (p.totalSupply == 0) {
            return (false, bytes32("ZERO_SUPPLY"));
        }
        if (
            p.quoteAsset == address(0) ||
            !registry.isQuoteAsset(p.quoteAsset) ||
            !registry.isGraduationAsset(p.quoteAsset)
        ) {
            return (false, bytes32("QUOTE_NOT_APPROVED"));
        }

        (
            bool healthy,
            bytes32 assetReason,
            ,
        ) = registry.assetHealth(p.quoteAsset);

        if (!healthy) {
            return (false, assetReason);
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
            p.basePriceUsd1e18 > maxCurveScalar ||
            p.slopeUsd1e18 > maxCurveScalar ||
            p.graduationUsd1e18 > maxCurveScalar
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
                terminalPrice <= p.basePriceUsd1e18
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

        uint256 baseFeeTotal;
        for (uint256 i; i < p.feeBps.length; ++i) {
            baseFeeTotal += p.feeBps[i];
        }
        if (
            baseFeeTotal == 0 ||
            baseFeeTotal > 500
        ) {
            return (false, bytes32("BAD_TOTAL_FEE"));
        }

        if (
            p.buyTaxBps > MAX_TAX_BPS ||
            p.sellTaxBps > MAX_TAX_BPS ||
            (p.buyTaxBps == 0 && p.sellTaxBps == 0)
        ) {
            return (false, bytes32("BAD_TAX"));
        }

        if (
            p.antiFarmerDuration >
                MAX_ANTI_FARMER_DURATION
        ) {
            return (false, bytes32("ANTI_FARMER_TOO_LONG"));
        }

        if (
            p.minimumDividendBalance >
                p.totalSupply
        ) {
            return (false, bytes32("DIVIDEND_THRESHOLD_TOO_HIGH"));
        }

        uint256 allocationTotal;
        for (
            uint256 i;
            i < p.taxAllocationBps.length;
            ++i
        ) {
            allocationTotal +=
                p.taxAllocationBps[i];
        }
        if (allocationTotal != BPS) {
            return (false, bytes32("BAD_TAX_ALLOCATION"));
        }

        if (
            (p.feeBps[4] > 0 ||
                p.taxAllocationBps[5] > 0) &&
            p.treasury == address(0)
        ) {
            return (false, bytes32("TREASURY_REQUIRED"));
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

        return (true, bytes32("OK"));
    }

    function previewPreparedVanity(
        address creator,
        TaxLaunchParams calldata p
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
        require(creator != address(0), "ZERO_CREATOR");

        launchNonce =
            creatorLaunchNonce[creator];
        manifestHash =
            _manifestHash(
                creator,
                launchNonce,
                p
            );

        (
            vanitySalt,
            predictedToken
        ) = _findFortuneSalt(
            creator,
            p,
            manifestHash
        );
    }

    function createLaunchPrepared(
        TaxLaunchParams calldata p,
        bytes32 vanitySalt
    )
        external
        returns (LaunchInfo memory info)
    {
        (bool ready, bytes32 reasonCode) =
            preflightLaunch(p);

        if (!ready) {
            revert LaunchPreflightFailed(reasonCode);
        }

        uint256 launchNonce =
            creatorLaunchNonce[msg.sender];
        bytes32 manifestHash =
            _manifestHash(
                msg.sender,
                launchNonce,
                p
            );

        IFortuneTokenDeployer.TaxTokenParams
            memory taxTokenParams =
                _tokenParams(
                    p,
                    manifestHash,
                    vanitySalt
                );

        address predictedToken =
            tokenDeployer.predictTax(
                taxTokenParams
            );

        require(
            hasFortuneSuffix(predictedToken),
            "BAD_PREPARED_VANITY"
        );

        creatorLaunchNonce[msg.sender] =
            launchNonce + 1;

        address tokenAddress =
            tokenDeployer.deployTax(
                taxTokenParams
            );

        require(
            tokenAddress == predictedToken &&
                hasFortuneSuffix(tokenAddress),
            "FORTUNE_VANITY_MISMATCH"
        );

        FortuneTaxToken token =
            FortuneTaxToken(tokenAddress);

        address holderVault =
            _automationVault(
                p.feeBps[1] > 0 ||
                        p.feeBps[0] > 0
                    ? uint16(1)
                    : uint16(0),
                FortuneAutomationRegistry
                    .Purpose
                    .HolderRewards,
                tokenAddress
            );

        address buybackVault =
            _automationVault(
                p.feeBps[2],
                FortuneAutomationRegistry
                    .Purpose
                    .BuybackBurn,
                tokenAddress
            );

        address liquidityVault =
            _automationVault(
                p.feeBps[3] > 0
                    ? p.feeBps[3]
                    : uint16(1),
                FortuneAutomationRegistry
                    .Purpose
                    .LiquidityReinforcement,
                tokenAddress
            );

        address feeRouterAddress =
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

        address dividendVaultAddress =
            feeRouterDeployer
                .deployDividendVault(
                    address(this),
                    tokenAddress,
                    p.quoteAsset
                );

        address taxProcessorAddress =
            feeRouterDeployer
                .deployTaxProcessor(
                    address(this),
                    tokenAddress,
                    p.quoteAsset,
                    dividendVaultAddress,
                    msg.sender,
                    liquidityVault,
                    p.treasury,
                    protocolTreasury,
                    automationExecutor,
                    p.taxAllocationBps
                );

        address[] memory quoteAssets =
            new address[](1);
        quoteAssets[0] = p.quoteAsset;

        uint16[] memory weights =
            new uint16[](1);
        weights[0] = BPS;

        address curveAddress =
            curveDeployer.deploy(
                IFortuneCurveDeployer
                    .CurveParams({
                        factory: address(this),
                        launchToken: tokenAddress,
                        registry: address(registry),
                        feeRouter: feeRouterAddress,
                        shieldVault: liquidityVault,
                        quoteAssets: quoteAssets,
                        weightsBps: weights,
                        basePriceUsd1e18: p.basePriceUsd1e18,
                        slopeUsd1e18: p.slopeUsd1e18,
                        graduationUsd1e18: p.graduationUsd1e18,
                        adaptiveGraduation: false,
                        taxProcessor: taxProcessorAddress,
                        curveBuyTaxBps: p.buyTaxBps,
                        curveSellTaxBps: p.sellTaxBps
                    })
            );

        FortuneFeeRouter(
            feeRouterAddress
        ).setCurve(
            curveAddress
        );

        FortuneTaxProcessor(
            taxProcessorAddress
        ).bindCurve(
            curveAddress
        );

        FortuneDividendVault(
            dividendVaultAddress
        ).bindProcessor(
            taxProcessorAddress
        );

        token.bindInfrastructure(
            taxProcessorAddress,
            dividendVaultAddress,
            curveAddress
        );

        require(
            token.transfer(
                curveAddress,
                p.totalSupply
            ),
            "TOKEN_FUND_FAILED"
        );

        info = LaunchInfo({
            creator: msg.sender,
            token: tokenAddress,
            curve: curveAddress,
            feeRouter: feeRouterAddress,
            dividendVault: dividendVaultAddress,
            taxProcessor: taxProcessorAddress,
            liquidityVault: liquidityVault,
            manifestHash: manifestHash,
            vanitySalt: vanitySalt,
            createdAt: uint64(block.timestamp)
        });

        launches.push(info);
        uint256 launchId =
            launches.length - 1;

        curveIndexPlusOne[curveAddress] =
            launches.length;
        graduationAdapterForCurve[
            curveAddress
        ] = graduationAdapter;

        emit TaxLaunchCreated(
            launchId,
            msg.sender,
            tokenAddress,
            curveAddress,
            p.quoteAsset,
            taxProcessorAddress,
            dividendVaultAddress,
            manifestHash
        );

        emit TaxLaunchPolicy(
            launchId,
            p.buyTaxBps,
            p.sellTaxBps,
            p.antiFarmerDuration,
            p.minimumDividendBalance,
            p.taxAllocationBps
        );

        emit TaxLaunchMetadata(
            launchId,
            p.description,
            p.imageURI,
            p.website,
            p.xProfile,
            p.telegram,
            p.github,
            p.youtube,
            p.debox
        );

        emit FortuneVanityAddress(
            launchId,
            tokenAddress,
            vanitySalt
        );
    }

    function _tokenParams(
        TaxLaunchParams calldata p,
        bytes32 manifestHash,
        bytes32 salt
    )
        internal
        view
        returns (
            IFortuneTokenDeployer
                .TaxTokenParams memory params
        )
    {
        params =
            IFortuneTokenDeployer
                .TaxTokenParams({
                    fortuneFactory: address(this),
                    poolConfigurator: graduationAdapter,
                    poolRegistry: address(poolRegistry),
                    quoteAsset: p.quoteAsset,
                    name: p.name,
                    symbol: p.symbol,
                    supply: p.totalSupply,
                    manifest: manifestHash,
                    buyTaxBps: p.buyTaxBps,
                    sellTaxBps: p.sellTaxBps,
                    antiFarmerDuration: p.antiFarmerDuration,
                    minimumDividendBalance: p.minimumDividendBalance,
                    salt: salt
                });
    }

    function _findFortuneSalt(
        address creator,
        TaxLaunchParams calldata p,
        bytes32 manifestHash
    )
        internal
        view
        returns (
            bytes32 salt,
            address predicted
        )
    {
        IFortuneTokenDeployer
            .TaxTokenParams memory params =
                _tokenParams(
                    p,
                    manifestHash,
                    bytes32(0)
                );

        for (
            uint256 nonce;
            nonce < VANITY_SEARCH_LIMIT;
            ++nonce
        ) {
            salt =
                keccak256(
                    abi.encodePacked(
                        creator,
                        manifestHash,
                        nonce
                    )
                );

            params.salt = salt;

            predicted =
                tokenDeployer
                    .predictTax(
                        params
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

        revert("FORTUNE_SUFFIX_NOT_FOUND");
    }

    function _manifestHash(
        address creator,
        uint256 launchNonce,
        TaxLaunchParams calldata p
    ) internal view returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    block.chainid,
                    address(this),
                    address(registry),
                    address(automationRegistry),
                    address(poolRegistry),
                    address(tokenDeployer),
                    address(vaultDeployer),
                    address(feeRouterDeployer),
                    address(curveDeployer),
                    automationExecutor,
                    graduationAdapter,
                    protocolTreasury,
                    creator,
                    launchNonce,
                    p
                )
            );
    }

    function hasFortuneSuffix(address account)
        public
        pure
        returns (bool)
    {
        return
            uint8(uint160(account)) ==
            FORTUNE_ADDRESS_SUFFIX;
    }

    function _automationVault(
        uint16 routeBps,
        FortuneAutomationRegistry.Purpose purpose,
        address launchToken
    ) internal returns (address) {
        if (routeBps == 0) {
            return address(0);
        }

        return
            vaultDeployer.deploy(
                address(automationRegistry),
                uint8(purpose),
                launchToken,
                automationExecutor
            );
    }

    function finalizeGraduation(
        address curve,
        bytes calldata data
    )
        external
        returns (bool success)
    {
        require(
            curveIndexPlusOne[curve] != 0,
            "UNKNOWN_CURVE"
        );

        address adapter =
            graduationAdapterForCurve[curve];

        require(
            adapter != address(0),
            "NO_ADAPTER"
        );

        GraduationStatus storage status =
            graduationStatus[curve];

        require(
            !status.completed,
            "ALREADY_GRADUATED"
        );

        status.attempts += 1;
        status.lastAttemptAt =
            uint64(block.timestamp);
        uint256 attempt =
            status.attempts;

        try FortuneCurve(curve)
            .preflightGraduation(
                adapter,
                data
            )
            returns (
                bool ready,
                bytes32 reasonCode
            )
        {
            if (!ready) {
                status.failures += 1;
                status.lastFailureCode =
                    reasonCode;

                emit GraduationPreflightFailed(
                    curve,
                    adapter,
                    attempt,
                    reasonCode
                );

                return false;
            }
        } catch (
            bytes memory preflightError
        ) {
            bytes32 reasonHash =
                keccak256(preflightError);
            status.failures += 1;
            status.lastFailureCode =
                reasonHash;

            emit GraduationPreflightFailed(
                curve,
                adapter,
                attempt,
                reasonHash
            );

            return false;
        }

        try FortuneCurve(curve)
            .graduate(
                adapter,
                data
            )
        {
            status.completed = true;
            status.lastFailureCode =
                bytes32(0);

            emit GraduationFinalized(
                curve,
                adapter
            );

            return true;
        } catch (
            bytes memory executionError
        ) {
            bytes32 revertHash =
                keccak256(
                    executionError
                );
            status.failures += 1;
            status.lastFailureCode =
                revertHash;

            emit GraduationExecutionFailed(
                curve,
                adapter,
                attempt,
                revertHash
            );

            return false;
        }
    }

    function liquidityVaultForCurve(
        address curve
    )
        external
        view
        returns (address)
    {
        uint256 indexPlusOne =
            curveIndexPlusOne[curve];

        require(
            indexPlusOne != 0,
            "UNKNOWN_CURVE"
        );

        return
            launches[
                indexPlusOne - 1
            ].liquidityVault;
    }

    function launchCount()
        external
        view
        returns (uint256)
    {
        return launches.length;
    }
}
