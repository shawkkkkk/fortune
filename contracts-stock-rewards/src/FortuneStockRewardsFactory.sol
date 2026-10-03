// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {FortuneAssetRegistry} from "fortune/FortuneAssetRegistry.sol";
import {FortuneCurve} from "fortune/FortuneCurve.sol";
import {FortuneFeeRouter} from "fortune/FortuneFeeRouter.sol";
import {FortunePancakeV3GraduationAdapter} from "fortune/FortunePancakeV3GraduationAdapter.sol";
import {FortunePermanentLiquidityLocker} from "fortune/FortunePermanentLiquidityLocker.sol";
import {IFortuneCurveDeployer} from "fortune/interfaces/IFortuneCurveDeployer.sol";
import {IFortuneFeeRouterDeployer} from "fortune/interfaces/IFortuneFeeRouterDeployer.sol";
import {IPancakeV3FactoryLike} from "fortune/interfaces/IPancakeV3FactoryLike.sol";
import {FortuneStockRewardsToken} from "./FortuneStockRewardsToken.sol";
import {FortuneStockRewardsTokenDeployer} from "./FortuneStockRewardsTokenDeployer.sol";

/// @notice Fortune Stock Rewards launches: a token paired with one to five
///         stock tokens, whose holders earn every one of those stocks.
///         UNAUDITED TESTNET BETA; refuses to deploy on BSC mainnet.
/// @dev Reuses the Standard stack unchanged: each launch gets a FortuneCurve
///      that accepts any of its stocks at oracle prices from the asset
///      registry, a FortuneFeeRouter, and graduates through the
///      FortunePancakeV3GraduationAdapter into one permanently locked
///      PancakeSwap V3 pool per stock. What is new is the token, which is the
///      router's holder vault and the locked positions' fee recipient, and
///      streams every stock it receives to its holders (see
///      FortuneStockRewardsToken).
///
///      Every launch is a fixed basket: each stock has a fixed share of the
///      graduation target, and once a stock's share is full buyers pay with
///      the others. So every stock ends up with its own pool, and holders
///      earn all of them. (The curve's adaptive mode is not offered: there, a
///      few cents of one stock left in the reserve rounds that stock's
///      graduation weight to zero, which the adapter refuses, so anyone could
///      block graduation cheaply.)
///
///      Fees on the curve, in the stock each trade uses: the creator's share
///      (0–1%), the holders' share (0.25–2.5%) and the protocol's 0.5%. The
///      creator can hand their share to holders for good through the router.
///      After graduation every PancakeSwap fee goes to the token: the stock
///      side to holders and the launch-token side burned. Launch Shield taxes
///      on opening buys go to the protocol fee recipient.
///
///      The owner can pause new launches and choose the protocol fee recipient
///      for future launches. It has no control over launches that exist.
contract FortuneStockRewardsFactory is Ownable2Step {
    uint256 public constant TOTAL_SUPPLY = 1_000_000_000e18;
    /// Tokens the curve has sold when it reaches its target, if stock prices hold.
    uint256 public constant CURVE_SALE = 550_000_000e18;
    /// Curve price at the target as a multiple of the opening price.
    uint256 public constant PRICE_MULTIPLE = 10;
    uint256 public constant MIN_GRADUATION_USD = 10e18;
    uint256 public constant MAX_GRADUATION_USD = 1_000_000e18;
    uint16 public constant BPS = 10_000;
    uint16 public constant PROTOCOL_FEE_BPS = 50;
    uint16 public constant MAX_CREATOR_FEE_BPS = 100;
    uint16 public constant MIN_HOLDER_FEE_BPS = 25;
    uint16 public constant MAX_HOLDER_FEE_BPS = 250;
    /// Unsold curve inventory must cover graduation liquidity with this margin, as in FortuneFactory.
    uint16 public constant MIN_GRADUATION_SUPPLY_BUFFER_BPS = 1_000;
    uint256 public constant MAX_STOCKS = 5;
    uint16 public constant MIN_WEIGHT_BPS = 1_000;
    /// The adapter refuses to price a pool whose two amounts differ by more
    /// than 2^64; launches must clear that with this margin for price moves.
    uint256 public constant POOL_PRICE_MARGIN = 4;
    /// PancakeSwap V3 fee tiers a launch may graduate into: 0.25% or 1%.
    uint24 public constant POOL_FEE_STANDARD = 2_500;
    uint24 public constant POOL_FEE_HIGH = 10_000;

    struct LaunchParams {
        string name;
        string symbol;
        /// One to five registry stocks. Buyers pay with any of them; holders earn all of them.
        address[] stocks;
        /// Each stock's share of the graduation target and of graduation
        /// liquidity: at least MIN_WEIGHT_BPS each, summing to 10,000.
        uint16[] weightsBps;
        uint256 graduationUsd1e18;
        uint16 creatorFeeBps;
        uint16 holderFeeBps;
        /// POOL_FEE_STANDARD or POOL_FEE_HIGH.
        uint24 poolFee;
        string description;
        string imageURI;
        string website;
        string xProfile;
        string telegram;
    }

    struct Launch {
        address creator;
        address token;
        address curve;
        address feeRouter;
        uint256 graduationUsd1e18;
        uint16 creatorFeeBps;
        uint16 holderFeeBps;
        uint24 poolFee;
        uint64 createdAt;
    }

    struct Metadata {
        string description;
        string imageURI;
        string website;
        string xProfile;
        string telegram;
    }

    struct GraduationStatus {
        uint64 attempts;
        uint64 failures;
        uint64 lastAttemptAt;
        bytes32 lastFailureCode;
        bool completed;
    }

    FortuneAssetRegistry public immutable registry;
    IFortuneCurveDeployer public immutable curveDeployer;
    IFortuneFeeRouterDeployer public immutable feeRouterDeployer;
    FortuneStockRewardsTokenDeployer public immutable tokenDeployer;
    address public immutable pancakeV3Factory;
    /// Lets anyone exclude this token's V2 pairs from rewards; zero for none.
    address public immutable pancakeV2Factory;

    address public graduationAdapter;
    address public liquidityLocker;
    address public protocolFeeRecipient;
    bool public launchesPaused;

    Launch[] internal _launches;
    mapping(address curve => uint256) public curveIndexPlusOne;
    mapping(address token => address) public curveForToken;
    mapping(address curve => GraduationStatus) public graduationStatus;
    mapping(address token => uint256[]) internal _positionIds;
    mapping(address creator => uint256[]) internal _creatorLaunchIds;
    mapping(address stock => uint256[]) internal _stockLaunchIds;
    mapping(address token => Metadata) internal _metadata;

    event Initialized(address indexed graduationAdapter, address indexed liquidityLocker);
    event LaunchCreated(
        uint256 indexed launchId,
        address indexed creator,
        address indexed token,
        address curve,
        address feeRouter,
        address[] stocks,
        uint256 graduationUsd1e18,
        uint16 creatorFeeBps,
        uint16 holderFeeBps,
        uint24 poolFee
    );
    event ProtocolFeeRecipientSet(address indexed recipient);
    event LaunchPauseSet(bool paused);
    event GraduationFinalized(address indexed curve, address indexed token, uint256[] positionIds);
    event GraduationPreflightFailed(address indexed curve, uint256 indexed attempt, bytes32 reasonCode);
    event GraduationExecutionFailed(address indexed curve, uint256 indexed attempt, bytes32 revertHash);

    error LaunchPreflightFailed(bytes32 reasonCode);
    error UnknownCurve();
    error UnknownToken();
    error AlreadyGraduated();
    error BadGraduationPlan();

    constructor(
        address initialOwner,
        address registry_,
        address curveDeployer_,
        address feeRouterDeployer_,
        address tokenDeployer_,
        address pancakeV3Factory_,
        address pancakeV2Factory_,
        address protocolFeeRecipient_
    ) Ownable(initialOwner) {
        // The adapter only graduates single-stock WBNB launches on chain 56.
        require(block.chainid != 56, "TESTNET_ONLY");
        require(
            registry_.code.length > 0 && curveDeployer_.code.length > 0 && feeRouterDeployer_.code.length > 0
                && tokenDeployer_.code.length > 0 && pancakeV3Factory_.code.length > 0,
            "MISSING_CODE"
        );
        require(pancakeV2Factory_ == address(0) || pancakeV2Factory_.code.length > 0, "BAD_V2_FACTORY");
        registry = FortuneAssetRegistry(registry_);
        curveDeployer = IFortuneCurveDeployer(curveDeployer_);
        feeRouterDeployer = IFortuneFeeRouterDeployer(feeRouterDeployer_);
        tokenDeployer = FortuneStockRewardsTokenDeployer(tokenDeployer_);
        pancakeV3Factory = pancakeV3Factory_;
        pancakeV2Factory = pancakeV2Factory_;
        _setProtocolFeeRecipient(protocolFeeRecipient_);
    }

    // ---------------------------------------------------------------- owner

    /// @notice Binds the graduation adapter and liquidity locker, both created
    ///         for this factory after it. Once only.
    function initialize(address adapter, address locker) external onlyOwner {
        require(graduationAdapter == address(0), "ALREADY_INITIALIZED");
        require(adapter.code.length > 0 && locker.code.length > 0, "MISSING_CODE");
        FortunePancakeV3GraduationAdapter a = FortunePancakeV3GraduationAdapter(adapter);
        FortunePermanentLiquidityLocker l = FortunePermanentLiquidityLocker(locker);
        require(
            address(a.fortuneFactory()) == address(this) && address(a.registry()) == address(registry)
                && address(a.pancakeFactory()) == pancakeV3Factory && address(a.liquidityLocker()) == locker,
            "ADAPTER_MISMATCH"
        );
        require(
            l.factory() == address(this) && address(l.positionManager()) == address(a.positionManager()),
            "LOCKER_MISMATCH"
        );
        graduationAdapter = adapter;
        liquidityLocker = locker;
        l.setApprovedDepositor(adapter, true);
        emit Initialized(adapter, locker);
    }

    function setLaunchesPaused(bool paused) external onlyOwner {
        launchesPaused = paused;
        emit LaunchPauseSet(paused);
    }

    /// @notice Applies to launches created afterwards; existing routers and
    ///         curves keep the recipient they were created with.
    function setProtocolFeeRecipient(address recipient) external onlyOwner {
        _setProtocolFeeRecipient(recipient);
    }

    function _setProtocolFeeRecipient(address recipient) internal {
        require(recipient != address(0), "ZERO_RECIPIENT");
        protocolFeeRecipient = recipient;
        emit ProtocolFeeRecipientSet(recipient);
    }

    // ---------------------------------------------------------------- launch

    /// @notice Free preflight. Returns the first reason a launch would revert.
    function preflight(LaunchParams calldata p) public view returns (bool ready, bytes32 reasonCode) {
        if (launchesPaused) return (false, "LAUNCHES_PAUSED");
        if (graduationAdapter == address(0)) return (false, "NOT_INITIALIZED");
        uint256 nameLength = bytes(p.name).length;
        uint256 symbolLength = bytes(p.symbol).length;
        if (nameLength == 0 || nameLength > 64) return (false, "BAD_NAME_LENGTH");
        if (symbolLength == 0 || symbolLength > 16) return (false, "BAD_SYMBOL_LENGTH");
        if (bytes(p.description).length > 1024) return (false, "DESCRIPTION_TOO_LONG");
        if (
            bytes(p.imageURI).length > 256 || bytes(p.website).length > 256 || bytes(p.xProfile).length > 256
                || bytes(p.telegram).length > 256
        ) return (false, "METADATA_TOO_LONG");

        if (p.graduationUsd1e18 < MIN_GRADUATION_USD || p.graduationUsd1e18 > MAX_GRADUATION_USD) {
            return (false, "TARGET_RANGE");
        }
        (uint256 base, uint256 slope, bool economicsOk) = curveEconomics(p.graduationUsd1e18);
        if (!economicsOk) return (false, "BAD_ECONOMICS");
        uint256 graduationPrice = base + Math.mulDiv(slope, CURVE_SALE, 1e18);

        uint256 count = p.stocks.length;
        if (count == 0 || count > MAX_STOCKS) return (false, "BAD_STOCK_COUNT");
        if (p.weightsBps.length != count) return (false, "BAD_WEIGHT_LENGTH");
        uint256 weightSum;
        for (uint256 i; i < count; ++i) {
            address stock = p.stocks[i];
            if (stock == address(0)) return (false, "ZERO_STOCK");
            for (uint256 j; j < i; ++j) {
                if (p.stocks[j] == stock) return (false, "DUPLICATE_STOCK");
            }
            if (!registry.isQuoteAsset(stock)) return (false, "STOCK_NOT_APPROVED");
            if (!registry.isRewardAsset(stock)) return (false, "REWARDS_DISABLED");
            if (!registry.isGraduationAsset(stock)) return (false, "GRADUATION_DISABLED");
            (bool healthy, bytes32 assetReason, uint256 price,) = registry.assetHealth(stock);
            if (!healthy) return (false, assetReason);
            if (!poolPriceFits(price, registry.registeredDecimals(stock), graduationPrice)) {
                return (false, "POOL_PRICE_RANGE");
            }
            if (p.weightsBps[i] < MIN_WEIGHT_BPS) return (false, "WEIGHT_TOO_LOW");
            weightSum += p.weightsBps[i];
        }
        if (weightSum != BPS) return (false, "BAD_WEIGHTS");

        if (p.creatorFeeBps > MAX_CREATOR_FEE_BPS) return (false, "CREATOR_FEE_TOO_HIGH");
        if (p.holderFeeBps < MIN_HOLDER_FEE_BPS || p.holderFeeBps > MAX_HOLDER_FEE_BPS) {
            return (false, "HOLDER_FEE_RANGE");
        }
        if (p.poolFee != POOL_FEE_STANDARD && p.poolFee != POOL_FEE_HIGH) return (false, "BAD_POOL_FEE");
        return (true, "OK");
    }

    /// @notice Whether a stock at `stockPriceUsd1e18` with `decimals` can be
    ///         paired at a launch-token price of `tokenPriceUsd1e18`: the
    ///         graduation adapter only prices pools whose launch-token and
    ///         stock amounts (in base units) are within 2^64 of each other.
    ///         Low-decimal or high-priced stocks need a higher target.
    function poolPriceFits(uint256 stockPriceUsd1e18, uint8 decimals, uint256 tokenPriceUsd1e18)
        public
        pure
        returns (bool)
    {
        if (stockPriceUsd1e18 == 0 || tokenPriceUsd1e18 == 0 || decimals > 36) return false;
        uint256 stockScale = 10 ** uint256(decimals);
        // Launch-token wei per stock base unit, and the reverse.
        uint256 tokensPerUnit = Math.mulDiv(stockPriceUsd1e18, 1e18 * POOL_PRICE_MARGIN, tokenPriceUsd1e18 * stockScale);
        uint256 unitsPerToken = Math.mulDiv(tokenPriceUsd1e18 * stockScale, POOL_PRICE_MARGIN, stockPriceUsd1e18 * 1e18);
        return tokensPerUnit <= type(uint64).max && unitsPerToken <= type(uint64).max;
    }

    /// @notice Opening price and slope for a graduation target, in USD (1e18)
    ///         per whole token, and whether the curve leaves enough unsold
    ///         tokens to seed graduation liquidity (FortuneFactory's check).
    /// @dev The curve sells CURVE_SALE tokens to reach the target and ends at
    ///      PRICE_MULTIPLE times its opening price, if stock prices hold.
    function curveEconomics(uint256 graduationUsd1e18)
        public
        pure
        returns (uint256 basePriceUsd1e18, uint256 slopeUsd1e18, bool ok)
    {
        basePriceUsd1e18 = Math.mulDiv(2 * graduationUsd1e18, 1e18, CURVE_SALE * (PRICE_MULTIPLE + 1));
        slopeUsd1e18 = Math.mulDiv((PRICE_MULTIPLE - 1) * basePriceUsd1e18, 1e18, CURVE_SALE);
        ok = _graduationFits(basePriceUsd1e18, slopeUsd1e18, graduationUsd1e18);
    }

    function _graduationFits(uint256 base, uint256 slope, uint256 target) internal pure returns (bool) {
        uint256 maxCurveScalar = type(uint120).max;
        if (base == 0 || slope == 0 || target == 0) return false;
        if (base > maxCurveScalar || slope > maxCurveScalar || target > maxCurveScalar) return false;
        if (base + Math.mulDiv(slope, TOTAL_SUPPLY, 1e18) > maxCurveScalar) return false;
        uint256 terminalPrice = Math.sqrt(base * base + 2 * slope * target);
        if (terminalPrice <= base) return false;
        uint256 sold = Math.mulDiv(terminalPrice - base, 1e18, slope);
        uint256 anchor = base + Math.mulDiv(slope, sold, 1e18);
        if (sold == 0 || anchor == 0) return false;
        uint256 liquidityTokens = Math.mulDiv(target, 1e18, anchor);
        return Math.mulDiv(sold + liquidityTokens, BPS + MIN_GRADUATION_SUPPLY_BUFFER_BPS, BPS) <= TOTAL_SUPPLY;
    }

    /// @notice Creates the token, fee router and curve, and hands the curve the
    ///         whole supply. There is no creator first buy: the Launch Shield
    ///         takes 99% of a buy in the launch's first second.
    function createLaunch(LaunchParams calldata p) external returns (address token, address curve) {
        (bool ready, bytes32 reason) = preflight(p);
        if (!ready) revert LaunchPreflightFailed(reason);
        (uint256 base, uint256 slope,) = curveEconomics(p.graduationUsd1e18);
        address recipient = protocolFeeRecipient;

        address[] memory excluded = new address[](1);
        excluded[0] = graduationAdapter;
        token = tokenDeployer.deploy(
            p.name, p.symbol, TOTAL_SUPPLY, p.stocks, pancakeV3Factory, pancakeV2Factory, excluded
        );

        // creator, holders, buyback, liquidity, community treasury, protocol
        uint16[6] memory feeBps = [p.creatorFeeBps, p.holderFeeBps, uint16(0), uint16(0), uint16(0), PROTOCOL_FEE_BPS];
        address router = feeRouterDeployer.deploy(
            address(this), msg.sender, token, address(0), address(0), address(0), recipient, feeBps
        );

        curve = curveDeployer.deploy(
            IFortuneCurveDeployer.CurveParams({
                factory: address(this),
                launchToken: token,
                registry: address(registry),
                feeRouter: router,
                shieldVault: recipient,
                quoteAssets: p.stocks,
                weightsBps: p.weightsBps,
                basePriceUsd1e18: base,
                slopeUsd1e18: slope,
                graduationUsd1e18: p.graduationUsd1e18,
                adaptiveGraduation: false,
                taxProcessor: address(0),
                curveBuyTaxBps: 0,
                curveSellTaxBps: 0
            })
        );

        FortuneFeeRouter(router).setCurve(curve);
        FortuneStockRewardsToken(token).excludeFromRewards(curve);
        require(IERC20(token).transfer(curve, TOTAL_SUPPLY), "FUND_FAILED");

        uint256 launchId = _launches.length;
        _launches.push(
            Launch({
                creator: msg.sender,
                token: token,
                curve: curve,
                feeRouter: router,
                graduationUsd1e18: p.graduationUsd1e18,
                creatorFeeBps: p.creatorFeeBps,
                holderFeeBps: p.holderFeeBps,
                poolFee: p.poolFee,
                createdAt: uint64(block.timestamp)
            })
        );
        curveIndexPlusOne[curve] = launchId + 1;
        curveForToken[token] = curve;
        _creatorLaunchIds[msg.sender].push(launchId);
        for (uint256 i; i < p.stocks.length; ++i) {
            _stockLaunchIds[p.stocks[i]].push(launchId);
        }
        _metadata[token] = Metadata({
            description: p.description,
            imageURI: p.imageURI,
            website: p.website,
            xProfile: p.xProfile,
            telegram: p.telegram
        });

        emit LaunchCreated(
            launchId,
            msg.sender,
            token,
            curve,
            router,
            p.stocks,
            p.graduationUsd1e18,
            p.creatorFeeBps,
            p.holderFeeBps,
            p.poolFee
        );
    }

    // ------------------------------------------------------------ graduation

    /// @notice Permissionless: moves a curve that reached its target into one
    ///         locked PancakeSwap V3 pool per stock it holds. `data` is
    ///         `abi.encode(FortunePancakeV3GraduationAdapter.GraduationPlan)`,
    ///         whose fee tiers must all be the launch's pool fee. Failures are
    ///         recorded rather than reverted, as in FortuneFactory, and the
    ///         launch stays retryable.
    function graduate(address curve, bytes calldata data) external returns (bool success) {
        uint256 indexPlusOne = curveIndexPlusOne[curve];
        if (indexPlusOne == 0) revert UnknownCurve();
        Launch storage launch = _launches[indexPlusOne - 1];
        GraduationStatus storage status = graduationStatus[curve];
        if (status.completed) revert AlreadyGraduated();

        FortunePancakeV3GraduationAdapter.GraduationPlan memory plan =
            abi.decode(data, (FortunePancakeV3GraduationAdapter.GraduationPlan));
        uint256 count = FortuneCurve(curve).quoteAssetCount();
        if (plan.fees.length != count) revert BadGraduationPlan();
        for (uint256 i; i < count; ++i) {
            if (plan.fees[i] != launch.poolFee) revert BadGraduationPlan();
        }

        address adapter = graduationAdapter;
        status.attempts += 1;
        status.lastAttemptAt = uint64(block.timestamp);
        uint256 attempt = status.attempts;

        try FortuneCurve(curve).preflightGraduation(adapter, data) returns (bool ready, bytes32 reasonCode) {
            if (!ready) {
                status.failures += 1;
                status.lastFailureCode = reasonCode;
                emit GraduationPreflightFailed(curve, attempt, reasonCode);
                return false;
            }
        } catch (bytes memory preflightError) {
            bytes32 reasonHash = keccak256(preflightError);
            status.failures += 1;
            status.lastFailureCode = reasonHash;
            emit GraduationPreflightFailed(curve, attempt, reasonHash);
            return false;
        }

        FortunePermanentLiquidityLocker locker = FortunePermanentLiquidityLocker(liquidityLocker);
        uint256 lockedBefore = locker.lockedPositionCount();
        try FortuneCurve(curve).graduate(adapter, data) {
            status.completed = true;
            status.lastFailureCode = bytes32(0);
        } catch (bytes memory executionError) {
            bytes32 revertHash = keccak256(executionError);
            status.failures += 1;
            status.lastFailureCode = revertHash;
            emit GraduationExecutionFailed(curve, attempt, revertHash);
            return false;
        }

        // Only this factory's adapter deposits into this locker, so every
        // position locked during this call belongs to this launch.
        address token = launch.token;
        uint256 lockedAfter = locker.lockedPositionCount();
        uint256[] storage ids = _positionIds[token];
        for (uint256 j = lockedBefore; j < lockedAfter; ++j) {
            ids.push(locker.lockedTokenIds(j));
        }
        // The new pools hold launch tokens but can never claim, so their share
        // goes to holders instead.
        for (uint256 i; i < count; ++i) {
            address pool = IPancakeV3FactoryLike(pancakeV3Factory).getPool(
                token, FortuneCurve(curve).quoteAssets(i), launch.poolFee
            );
            if (pool != address(0)) FortuneStockRewardsToken(token).excludeFromRewards(pool);
        }
        // Starts streaming the stock dust the adapter sent the token.
        FortuneStockRewardsToken(token).sync();
        emit GraduationFinalized(curve, token, ids);
        return true;
    }

    /// @notice Permissionless: collects the PancakeSwap fees of a graduated
    ///         launch's locked positions into its token, which streams the
    ///         stock side to holders and burns the launch-token side.
    /// @return collected Positions whose fees were collected.
    function collectPoolFees(address token) external returns (uint256 collected) {
        if (curveForToken[token] == address(0)) revert UnknownToken();
        uint256[] storage ids = _positionIds[token];
        FortunePermanentLiquidityLocker locker = FortunePermanentLiquidityLocker(liquidityLocker);
        for (uint256 i; i < ids.length; ++i) {
            try locker.collectFees(ids[i]) {
                collected += 1;
            } catch {}
        }
        FortuneStockRewardsToken(token).sync();
    }

    // ---------------------------------------------------------------- views

    /// @notice Fee recipient of the launch's locked positions and recipient of
    ///         graduation dust: the launch token itself.
    function liquidityVaultForCurve(address curve) external view returns (address) {
        uint256 indexPlusOne = curveIndexPlusOne[curve];
        if (indexPlusOne == 0) revert UnknownCurve();
        return _launches[indexPlusOne - 1].token;
    }

    function launchCount() external view returns (uint256) {
        return _launches.length;
    }

    function launchAt(uint256 launchId) external view returns (Launch memory) {
        return _launches[launchId];
    }

    function launchForToken(address token) external view returns (Launch memory) {
        address curve = curveForToken[token];
        if (curve == address(0)) revert UnknownToken();
        return _launches[curveIndexPlusOne[curve] - 1];
    }

    function metadataOf(address token) external view returns (Metadata memory) {
        return _metadata[token];
    }

    /// @notice PancakeSwap position NFTs locked for `token` at graduation.
    function positionIds(address token) external view returns (uint256[] memory) {
        return _positionIds[token];
    }

    function creatorLaunchCount(address creator) external view returns (uint256) {
        return _creatorLaunchIds[creator].length;
    }

    function stockLaunchCount(address stock) external view returns (uint256) {
        return _stockLaunchIds[stock].length;
    }

    /// @notice Newest first.
    function launchIdsForCreator(address creator, uint256 offset, uint256 limit)
        external
        view
        returns (uint256[] memory)
    {
        return _newestFirst(_creatorLaunchIds[creator], offset, limit);
    }

    /// @notice Newest first.
    function launchIdsForStock(address stock, uint256 offset, uint256 limit) external view returns (uint256[] memory) {
        return _newestFirst(_stockLaunchIds[stock], offset, limit);
    }

    function _newestFirst(uint256[] storage ids, uint256 offset, uint256 limit)
        internal
        view
        returns (uint256[] memory page)
    {
        uint256 total = ids.length;
        if (offset >= total || limit == 0) return new uint256[](0);
        uint256 count = total - offset < limit ? total - offset : limit;
        page = new uint256[](count);
        for (uint256 i; i < count; ++i) {
            page[i] = ids[total - 1 - offset - i];
        }
    }
}
