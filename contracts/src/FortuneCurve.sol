// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {FortuneAssetRegistry} from "./FortuneAssetRegistry.sol";
import {FortuneToken} from "./FortuneToken.sol";
import {FortuneFeeRouter} from "./FortuneFeeRouter.sol";
import {IGraduationAdapter} from "./interfaces/IGraduationAdapter.sol";
import {IGraduationPreflight} from "./interfaces/IGraduationPreflight.sol";
import {IFortunePriceOracle} from "./interfaces/IFortunePriceOracle.sol";

interface IFortuneCurveTaxProcessor {
    function recordQuoteTax(
        address asset,
        uint256 amount
    ) external;
}

/// @notice Experimental shared curve accepting 1–5 quote assets.
/// @dev Economic formula is intentionally simple for testnet research and MUST be
///      independently reviewed before any production use.
contract FortuneCurve is ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint16 public constant BPS = 10_000;

    // Fortune Launch Shield. The opening tax applies only to buys and decays
    // rapidly to zero. It is routed to liquidity reinforcement, never the creator.
    uint16 public constant SNIPE_TAX_START_BPS = 9_900;
    uint32 public constant SNIPE_TAX_SECONDS = 5;
    uint16 public constant EARLY_WALLET_CAP_BPS = 200; // 2% of supply
    uint32 public constant EARLY_WALLET_CAP_SECONDS = 15;
    uint32 public constant GRADUATION_RESCUE_DELAY = 7 days;

    address public immutable factory;
    IERC20 public immutable launchToken;
    FortuneAssetRegistry public immutable registry;
    FortuneFeeRouter public immutable feeRouter;
    address public immutable shieldVault;
    address public immutable taxProcessor;
    uint16 public immutable curveBuyTaxBps;
    uint16 public immutable curveSellTaxBps;
    uint64 public immutable launchTimestamp;

    uint256 public immutable basePriceUsd1e18;
    uint256 public immutable slopeUsd1e18;
    uint256 public immutable graduationUsd1e18;
    bool public immutable adaptiveGraduation;

    address[] public quoteAssets;
    mapping(address => bool) public acceptedQuote;
    mapping(address => uint16) public fixedWeightBps;
    mapping(address => address) public oracleFor;
    mapping(address => uint32) public maxOracleAgeFor;
    mapping(address => uint8) public decimalsFor;
    mapping(address => uint256) private _accountedReserve;
    mapping(address => uint256) public shieldPurchased;

    uint256 public tokensSold;
    bool public graduationReady;
    bool public graduated;
    bool public rescueActive;
    uint64 public graduationReadyAt;
    uint256 public graduationAnchorPriceUsd1e18;
    uint256 public graduationReserveUsd1e18;
    uint256 public graduationLpTokenAmount;
    uint16[] private _graduationWeightSnapshot;
    uint256 public rescueSupply;
    uint256 public rescueRedeemed;

    enum Phase {
        CurveActive,
        GraduationReady,
        PoolCreated,
        Rescued
    }

    event QuotePricingSnapshot(
        address indexed quoteAsset,
        address indexed oracle,
        uint32 maxOracleAge,
        uint8 decimals
    );
    event LaunchShieldConfigured(
        uint16 startTaxBps,
        uint32 taxDurationSeconds,
        uint16 walletCapBps,
        uint32 walletCapDurationSeconds,
        address indexed shieldVault
    );
    event SnipeTaxCharged(
        address indexed buyer,
        address indexed quoteAsset,
        uint256 grossQuoteIn,
        uint256 taxAmount,
        uint16 taxBps
    );
    event ExcessQuoteSwept(
        address indexed quoteAsset,
        uint256 amount,
        address indexed destination
    );
    event BuyPartialFill(
        address indexed buyer,
        address indexed quoteAsset,
        uint256 requestedQuoteIn,
        uint256 spentQuoteIn,
        uint256 refundedQuoteIn
    );
    event Bought(
        address indexed buyer,
        address indexed quoteAsset,
        uint256 quoteIn,
        uint256 tokensOut,
        uint256 usdValue
    );
    event Sold(
        address indexed seller,
        address indexed quoteAsset,
        uint256 tokensIn,
        uint256 quoteOut,
        uint256 usdValue
    );
    event GraduationReady(uint256 reserveUsd);
    event GraduationAnchor(
        uint256 priceUsd1e18,
        uint256 reserveUsd1e18,
        uint256 tokensSold
    );
    event GraduationSnapshotLocked(
        uint256 reserveUsd1e18,
        uint256 launchTokenAmount,
        uint16[] weightsBps
    );
    event UnsoldInventoryBurned(uint256 amount);
    event Graduated(address indexed adapter);
    event RescueActivated(
        uint256 circulatingRescueSupply,
        uint256 activatedAt
    );
    event RescueRedeemed(
        address indexed holder,
        uint256 tokenAmount
    );

    modifier tradingOpen() {
        require(
            !graduationReady &&
                !graduated &&
                !rescueActive,
            "TRADING_CLOSED"
        );
        _;
    }

    constructor(
        address factory_,
        address launchToken_,
        address registry_,
        address feeRouter_,
        address shieldVault_,
        address[] memory quoteAssets_,
        uint16[] memory weightsBps_,
        uint256 basePriceUsd1e18_,
        uint256 slopeUsd1e18_,
        uint256 graduationUsd1e18_,
        bool adaptiveGraduation_,
        address taxProcessor_,
        uint16 curveBuyTaxBps_,
        uint16 curveSellTaxBps_
    ) {
        require(
            factory_ != address(0) &&
                launchToken_ != address(0) &&
                shieldVault_ != address(0),
            "ZERO_ADDRESS"
        );
        require(quoteAssets_.length >= 1 && quoteAssets_.length <= 5, "BAD_ASSET_COUNT");
        require(quoteAssets_.length == weightsBps_.length, "WEIGHT_LENGTH");
        require(basePriceUsd1e18_ > 0 && graduationUsd1e18_ > 0, "BAD_ECONOMICS");
        require(
            curveBuyTaxBps_ <= 1_000 &&
                curveSellTaxBps_ <= 1_000,
            "TAX_TOO_HIGH"
        );

        if (
            curveBuyTaxBps_ > 0 ||
            curveSellTaxBps_ > 0
        ) {
            require(
                taxProcessor_ != address(0) &&
                    taxProcessor_.code.length > 0,
                "TAX_PROCESSOR_REQUIRED"
            );
            require(
                quoteAssets_.length == 1,
                "TAX_SINGLE_QUOTE_ONLY"
            );
        } else {
            require(
                taxProcessor_ == address(0),
                "UNUSED_TAX_PROCESSOR"
            );
        }

        uint256 weightSum;
        for (uint256 i; i < quoteAssets_.length; ++i) {
            address asset = quoteAssets_[i];
            require(asset != address(0), "ZERO_QUOTE");
            require(!acceptedQuote[asset], "DUPLICATE_QUOTE");
            FortuneAssetRegistry registryContract =
                FortuneAssetRegistry(registry_);

            require(
                registryContract.isQuoteAsset(asset),
                "UNAPPROVED_QUOTE"
            );

            FortuneAssetRegistry.AssetConfig
                memory config =
                    registryContract.assetConfig(
                        asset
                    );

            uint8 snappedDecimals =
                registryContract
                    .registeredDecimals(
                        asset
                    );

            require(
                config.oracle != address(0),
                "ZERO_ORACLE"
            );
            require(
                snappedDecimals <= 36,
                "BAD_DECIMALS"
            );

            acceptedQuote[asset] = true;
            fixedWeightBps[asset] = weightsBps_[i];
            oracleFor[asset] = config.oracle;
            maxOracleAgeFor[asset] =
                config.maxOracleAge;
            decimalsFor[asset] =
                snappedDecimals;

            emit QuotePricingSnapshot(
                asset,
                config.oracle,
                config.maxOracleAge,
                snappedDecimals
            );
            quoteAssets.push(asset);
            weightSum += weightsBps_[i];
        }
        require(weightSum == BPS, "BAD_WEIGHTS");

        factory = factory_;
        launchToken = IERC20(launchToken_);
        registry = FortuneAssetRegistry(registry_);
        feeRouter = FortuneFeeRouter(feeRouter_);
        shieldVault = shieldVault_;
        taxProcessor = taxProcessor_;
        curveBuyTaxBps = curveBuyTaxBps_;
        curveSellTaxBps = curveSellTaxBps_;
        launchTimestamp = uint64(block.timestamp);
        basePriceUsd1e18 = basePriceUsd1e18_;
        slopeUsd1e18 = slopeUsd1e18_;
        graduationUsd1e18 = graduationUsd1e18_;
        adaptiveGraduation = adaptiveGraduation_;

        emit LaunchShieldConfigured(
            SNIPE_TAX_START_BPS,
            SNIPE_TAX_SECONDS,
            EARLY_WALLET_CAP_BPS,
            EARLY_WALLET_CAP_SECONDS,
            shieldVault_
        );
    }

    /// @notice Each curve snapshots pricing infrastructure at launch so later
    ///         registry edits cannot silently change or brick existing economics.
    function _priceUsd(address asset)
        internal
        view
        returns (
            uint256 price,
            uint256 updatedAt
        )
    {
        address oracle =
            oracleFor[asset];
        require(
            oracle != address(0),
            "NO_SNAPSHOTTED_ORACLE"
        );

        (
            price,
            updatedAt
        ) = IFortunePriceOracle(
                oracle
            ).priceUsd(asset);

        require(
            price > 0,
            "BAD_PRICE"
        );
        require(
            updatedAt > 0 &&
                updatedAt <= block.timestamp,
            "BAD_TIMESTAMP"
        );
        require(
            block.timestamp -
                updatedAt <=
                maxOracleAgeFor[asset],
            "STALE_PRICE"
        );

        uint8 currentDecimals =
            IERC20Metadata(asset)
                .decimals();

        require(
            currentDecimals ==
                decimalsFor[asset],
            "ASSET_DECIMALS_CHANGED"
        );
    }

    function _usdValue(
        address asset,
        uint256 amount
    ) internal view returns (uint256) {
        (
            uint256 price,
            uint256 observedAt
        ) = _priceUsd(asset);
        require(
            observedAt > 0,
            "BAD_PRICE_TIMESTAMP"
        );

        return
            Math.mulDiv(
                amount,
                price,
                10 **
                    uint256(
                        decimalsFor[asset]
                    )
            );
    }

    function _tokenAmountForUsd(
        address asset,
        uint256 usd1e18,
        bool roundUp
    ) internal view returns (uint256 amount) {
        (
            uint256 price,
            uint256 observedAt
        ) = _priceUsd(asset);
        require(
            observedAt > 0,
            "BAD_PRICE_TIMESTAMP"
        );

        uint256 scale =
            10 **
                uint256(
                    decimalsFor[asset]
                );

        amount =
            Math.mulDiv(
                usd1e18,
                scale,
                price
            );

        if (
            roundUp &&
            Math.mulDiv(
                amount,
                price,
                scale
            ) < usd1e18
        ) {
            amount += 1;
        }
    }

    function launchElapsedSeconds() public view returns (uint256) {
        return block.timestamp > launchTimestamp
            ? block.timestamp - launchTimestamp
            : 0;
    }

    /// @notice Pons-style fast decay: 99% at launch, then rapidly trends to 0
    ///         and is guaranteed to be zero after 5 seconds.
    function currentSnipeTaxBps() public view returns (uint16) {
        uint256 elapsed = launchElapsedSeconds();
        if (elapsed >= SNIPE_TAX_SECONDS) return 0;

        uint256 shift = elapsed * 14 / SNIPE_TAX_SECONDS;
        if (shift >= 14) return 0;

        return uint16(uint256(SNIPE_TAX_START_BPS) >> shift);
    }

    function launchShieldActive() external view returns (bool) {
        return launchElapsedSeconds() < EARLY_WALLET_CAP_SECONDS;
    }

    function phase() public view returns (Phase) {
        if (rescueActive) return Phase.Rescued;
        if (graduated) return Phase.PoolCreated;
        if (graduationReady) return Phase.GraduationReady;
        return Phase.CurveActive;
    }

    function currentPriceUsd1e18() public view returns (uint256) {
        return
            basePriceUsd1e18 +
            Math.mulDiv(
                slopeUsd1e18,
                tokensSold,
                1e18
            );
    }

    /// @notice Preview the exact onchain opening-tax, fee, partial-fill and refund behavior.
    /// @dev The preview clamps quote input to the remaining graduation target so the
    ///      final buyer cannot overfund the curve or be reverted by a tiny preceding buy.
    function previewBuy(address quoteAsset, uint256 amountIn)
        public
        view
        returns (
            uint256 quoteSpent,
            uint256 quoteRefund,
            uint256 snipeTax,
            uint256 normalFee,
            uint256 netQuote,
            uint256 usdIn,
            uint256 tokensOut
        )
    {
        require(acceptedQuote[quoteAsset], "QUOTE_NOT_ACCEPTED");
        require(amountIn > 0, "ZERO_AMOUNT");
        require(!graduationReady && !graduated && !rescueActive, "TRADING_CLOSED");

        uint256 reserveUsdBefore = netReserveUsd1e18();
        require(
            reserveUsdBefore < graduationUsd1e18,
            "GRADUATION_THRESHOLD_REACHED"
        );

        uint16 shieldBps = currentSnipeTaxBps();
        uint16 protocolFeeBps =
            feeRouter.totalFeeBps();
        uint16 feeBps =
            protocolFeeBps +
            curveBuyTaxBps;

        quoteSpent = amountIn;
        (
            snipeTax,
            normalFee,
            netQuote
        ) = _feesForGross(
            quoteSpent,
            shieldBps,
            protocolFeeBps,
            curveBuyTaxBps
        );
        usdIn = _usdValue(quoteAsset, netQuote);

        uint256 remainingUsd =
            graduationUsd1e18 -
            reserveUsdBefore;

        if (!adaptiveGraduation) {
            uint256 targetAssetUsd =
                fixedTargetReserveUsd(
                    quoteAsset
                );
            uint256 assetUsdBefore =
                _usdValue(
                    quoteAsset,
                    reserve(quoteAsset)
                );

            require(
                assetUsdBefore <
                    targetAssetUsd,
                "FIXED_ASSET_FILLED"
            );

            uint256 assetRemainingUsd =
                targetAssetUsd -
                assetUsdBefore;

            if (
                assetRemainingUsd <
                remainingUsd
            ) {
                remainingUsd =
                    assetRemainingUsd;
            }
        }

        if (usdIn > remainingUsd) {
            uint256 targetNetQuote =
                _tokenAmountForUsd(
                    quoteAsset,
                    remainingUsd,
                    true
                );

            quoteSpent = _grossForNet(
                targetNetQuote,
                shieldBps,
                feeBps
            );
            if (quoteSpent > amountIn) quoteSpent = amountIn;

            (
                snipeTax,
                normalFee,
                netQuote
            ) = _feesForGross(
            quoteSpent,
            shieldBps,
            protocolFeeBps,
            curveBuyTaxBps
        );

            // Rounding can leave one or two base units below the target.
            while (
                quoteSpent < amountIn &&
                netQuote < targetNetQuote
            ) {
                quoteSpent += 1;
                (
                    snipeTax,
                    normalFee,
                    netQuote
                ) = _feesForGross(
                    quoteSpent,
                    shieldBps,
                    protocolFeeBps,
                    curveBuyTaxBps
                );
            }

            usdIn = _usdValue(quoteAsset, netQuote);
        }

        quoteRefund = amountIn - quoteSpent;
        tokensOut = _tokensForUsd(usdIn);

        uint256 inventory = launchToken.balanceOf(address(this));
        require(tokensOut <= inventory, "INSUFFICIENT_CURVE_TOKENS");
    }

    /// @notice Buy launch tokens with any accepted quote asset.
    /// @dev Uses the same global sold counter, so all quote assets move one canonical curve.
    function buy(
        address quoteAsset,
        uint256 amountIn,
        uint256 minTokensOut
    ) external nonReentrant tradingOpen returns (uint256 tokensOut) {
        (
            uint256 quoteSpent,
            uint256 quoteRefund,
            uint256 snipeTax,
            uint256 fee,
            uint256 netAmount,
            uint256 usdIn,
            uint256 previewTokensOut
        ) = previewBuy(quoteAsset, amountIn);

        tokensOut = previewTokensOut;
        require(tokensOut >= minTokensOut && tokensOut > 0, "SLIPPAGE");

        IERC20 quote = IERC20(quoteAsset);
        uint256 balanceBefore = quote.balanceOf(address(this));
        quote.safeTransferFrom(msg.sender, address(this), amountIn);
        uint256 received = quote.balanceOf(address(this)) - balanceBefore;
        require(received == amountIn, "NON_STANDARD_QUOTE_TOKEN");

        if (snipeTax > 0) {
            quote.safeTransfer(shieldVault, snipeTax);
            emit SnipeTaxCharged(
                msg.sender,
                quoteAsset,
                quoteSpent,
                snipeTax,
                currentSnipeTaxBps()
            );
        }

        uint256 afterShield =
            quoteSpent - snipeTax;
        uint256 protocolFee =
            afterShield *
            feeRouter.totalFeeBps() /
            BPS;
        uint256 launchTax =
            afterShield *
            curveBuyTaxBps /
            BPS;

        require(
            protocolFee +
                launchTax ==
                fee,
            "BUY_FEE_ACCOUNTING"
        );

        if (protocolFee > 0) {
            quote.safeTransfer(
                address(feeRouter),
                protocolFee
            );
            feeRouter.route(
                quoteAsset,
                protocolFee
            );
        }

        if (launchTax > 0) {
            quote.safeTransfer(
                taxProcessor,
                launchTax
            );
            IFortuneCurveTaxProcessor(
                taxProcessor
            ).recordQuoteTax(
                quoteAsset,
                launchTax
            );
        }

        if (quoteRefund > 0) {
            quote.safeTransfer(msg.sender, quoteRefund);
            emit BuyPartialFill(
                msg.sender,
                quoteAsset,
                amountIn,
                quoteSpent,
                quoteRefund
            );
        }

        if (launchElapsedSeconds() < EARLY_WALLET_CAP_SECONDS) {
            uint256 walletCap =
                launchToken.totalSupply() * EARLY_WALLET_CAP_BPS / BPS;
            uint256 nextPurchased =
                shieldPurchased[msg.sender] + tokensOut;

            require(
                nextPurchased <= walletCap,
                "LAUNCH_SHIELD_WALLET_CAP"
            );

            shieldPurchased[msg.sender] = nextPurchased;
        }

        _accountedReserve[
            quoteAsset
        ] += netAmount;
        tokensSold += tokensOut;

        launchToken.safeTransfer(msg.sender, tokensOut);
        emit Bought(
            msg.sender,
            quoteAsset,
            quoteSpent,
            tokensOut,
            usdIn
        );

        // netAmount remains in the curve. This assertion makes the accounting
        // relationship explicit for audits without trusting nominal transfer input.
        require(
            quote.balanceOf(address(this)) >= balanceBefore + netAmount,
            "CURVE_ACCOUNTING"
        );

        _checkGraduation();
    }

    function _feesForGross(
        uint256 gross,
        uint16 shieldBps,
        uint16 protocolFeeBps,
        uint16 launchTaxBps
    )
        internal
        pure
        returns (
            uint256 shieldTax,
            uint256 normalFee,
            uint256 net
        )
    {
        shieldTax = gross * shieldBps / BPS;
        uint256 afterShield = gross - shieldTax;

        // Protocol fees and launch tax are independent percentages. Calculate
        // each leg independently so preview accounting exactly matches the
        // transfers in buy/sell, including sub-wei rounding on partial fills.
        uint256 protocolFee =
            afterShield * protocolFeeBps / BPS;
        uint256 launchTax =
            afterShield * launchTaxBps / BPS;

        normalFee =
            protocolFee +
            launchTax;
        net = afterShield - normalFee;
    }

    function _grossForNet(
        uint256 targetNet,
        uint16 shieldBps,
        uint16 feeBps
    ) internal pure returns (uint256) {
        uint256 denominator =
            uint256(BPS - shieldBps) *
            uint256(BPS - feeBps);
        require(denominator > 0, "BAD_FEE_DENOMINATOR");

        uint256 numerator =
            targetNet * uint256(BPS) * uint256(BPS);

        return numerator == 0
            ? 0
            : (numerator - 1) / denominator + 1;
    }

    /// @notice Preview the sell side separately from buys. Launch Shield never
    ///         applies to sells and normal fees are taken from quote output.
    function previewSell(
        address quoteAsset,
        uint256 tokenAmount
    )
        public
        view
        returns (
            uint256 grossQuote,
            uint256 normalFee,
            uint256 quoteOut,
            uint256 usdGross
        )
    {
        require(acceptedQuote[quoteAsset], "QUOTE_NOT_ACCEPTED");
        require(
            tokenAmount > 0 &&
                tokenAmount <= tokensSold,
            "BAD_TOKEN_AMOUNT"
        );
        require(
            !graduationReady &&
                !graduated &&
                !rescueActive,
            "TRADING_CLOSED"
        );

        uint256 nextSold = tokensSold - tokenAmount;
        uint256 currentPrice =
            currentPriceUsd1e18();
        uint256 nextPrice =
            basePriceUsd1e18 +
            Math.mulDiv(
                slopeUsd1e18,
                nextSold,
                1e18
            );

        // Exact integral of the linear curve over the sold token interval:
        // average endpoint price × token amount.
        usdGross =
            Math.mulDiv(
                currentPrice + nextPrice,
                tokenAmount,
                2e18
            );
        grossQuote =
            _tokenAmountForUsd(
                quoteAsset,
                usdGross,
                false
            );

        require(
            reserve(quoteAsset) >= grossQuote,
            "INSUFFICIENT_QUOTE_RESERVE"
        );

        uint256 protocolFee =
            grossQuote *
            feeRouter.totalFeeBps() /
            BPS;
        uint256 launchTax =
            grossQuote *
            curveSellTaxBps /
            BPS;

        normalFee =
            protocolFee +
            launchTax;
        quoteOut = grossQuote - normalFee;
    }

    /// @notice Sell launch tokens into any accepted quote reserve with enough depth.
    function sell(
        address quoteAsset,
        uint256 tokenAmount,
        uint256 minQuoteOut
    ) external nonReentrant tradingOpen returns (uint256 quoteOut) {
        (
            uint256 grossQuote,
            uint256 fee,
            uint256 previewQuoteOut,
            uint256 usdGross
        ) = previewSell(
            quoteAsset,
            tokenAmount
        );

        quoteOut = previewQuoteOut;
        require(
            quoteOut >= minQuoteOut,
            "SLIPPAGE"
        );

        launchToken.safeTransferFrom(
            msg.sender,
            address(this),
            tokenAmount
        );
        tokensSold -= tokenAmount;
        _accountedReserve[
            quoteAsset
        ] -= grossQuote;

        IERC20 quote = IERC20(quoteAsset);

        uint256 protocolFee =
            grossQuote *
            feeRouter.totalFeeBps() /
            BPS;
        uint256 launchTax =
            grossQuote *
            curveSellTaxBps /
            BPS;

        require(
            protocolFee +
                launchTax ==
                fee,
            "SELL_FEE_ACCOUNTING"
        );

        if (protocolFee > 0) {
            quote.safeTransfer(
                address(feeRouter),
                protocolFee
            );
            feeRouter.route(
                quoteAsset,
                protocolFee
            );
        }

        if (launchTax > 0) {
            quote.safeTransfer(
                taxProcessor,
                launchTax
            );
            IFortuneCurveTaxProcessor(
                taxProcessor
            ).recordQuoteTax(
                quoteAsset,
                launchTax
            );
        }

        quote.safeTransfer(
            msg.sender,
            quoteOut
        );

        emit Sold(
            msg.sender,
            quoteAsset,
            tokenAmount,
            quoteOut,
            usdGross
        );
    }

    function _tokensForUsd(uint256 usdIn)
        internal
        view
        returns (uint256 tokensOut)
    {
        uint256 price0 = currentPriceUsd1e18();

        if (slopeUsd1e18 == 0) {
            return
                Math.mulDiv(
                    usdIn,
                    1e18,
                    price0
                );
        }

        // For P(x)=P0+kx and spend C:
        // P1^2 = P0^2 + 2*k*C.
        // Factory preflight bounds terminal price so this square is safe.
        uint256 radicand =
            price0 *
            price0 +
            2 *
            slopeUsd1e18 *
            usdIn;

        uint256 price1 = Math.sqrt(radicand);
        if (price1 <= price0) return 0;

        tokensOut =
            Math.mulDiv(
                price1 - price0,
                1e18,
                slopeUsd1e18
            );
    }

    function quoteAssetCount() external view returns (uint256) {
        return quoteAssets.length;
    }

    /// @notice Protocol-accounted reserve. Unsolicited token transfers do not
    ///         alter curve price, graduation progress or basket weights.
    function reserve(address asset)
        public
        view
        returns (uint256)
    {
        require(
            acceptedQuote[asset],
            "QUOTE_NOT_ACCEPTED"
        );
        return _accountedReserve[asset];
    }

    function rawReserveBalance(address asset)
        public
        view
        returns (uint256)
    {
        require(
            acceptedQuote[asset],
            "QUOTE_NOT_ACCEPTED"
        );
        return
            IERC20(asset).balanceOf(
                address(this)
            );
    }

    function excessQuoteBalance(address asset)
        public
        view
        returns (uint256)
    {
        uint256 raw =
            rawReserveBalance(asset);
        uint256 accounted =
            _accountedReserve[asset];

        return
            raw > accounted
                ? raw - accounted
                : 0;
    }

    /// @notice Permissionless donation cleanup. Excess quote tokens can never
    ///         influence the curve; they are redirected to liquidity reinforcement.
    function sweepExcessQuote(address asset)
        external
        nonReentrant
        returns (uint256 amount)
    {
        amount =
            excessQuoteBalance(asset);
        require(
            amount > 0,
            "NO_EXCESS"
        );

        IERC20(asset).safeTransfer(
            shieldVault,
            amount
        );

        emit ExcessQuoteSwept(
            asset,
            amount,
            shieldVault
        );
    }

    function netReserveUsd1e18()
        public
        view
        returns (uint256 totalUsd)
    {
        for (
            uint256 i;
            i < quoteAssets.length;
            ++i
        ) {
            address asset =
                quoteAssets[i];
            uint256 amount =
                _accountedReserve[asset];

            if (amount > 0) {
                totalUsd +=
                    _usdValue(
                        asset,
                        amount
                    );
            }
        }
    }

    /// @notice Allows a keeper to recognize a threshold crossed by rebasing
    ///         or direct reserve changes even when no trade just executed.
    function checkGraduation() external {
        _checkGraduation();
    }

    /// @notice Exact USD target for one reserve in Fixed Basket mode.
    /// @dev Rounding remainder is assigned to the last configured asset so all
    ///      fixed targets sum exactly to the graduation threshold.
    function fixedTargetReserveUsd(address asset)
        public
        view
        returns (uint256 targetUsd)
    {
        require(
            acceptedQuote[asset],
            "QUOTE_NOT_ACCEPTED"
        );

        uint256 assigned;
        for (
            uint256 i;
            i < quoteAssets.length;
            ++i
        ) {
            address current =
                quoteAssets[i];

            uint256 currentTarget;
            if (
                i ==
                quoteAssets.length - 1
            ) {
                currentTarget =
                    graduationUsd1e18 -
                    assigned;
            } else {
                currentTarget =
                    Math.mulDiv(
                        graduationUsd1e18,
                        fixedWeightBps[
                            current
                        ],
                        BPS
                    );
                assigned += currentTarget;
            }

            if (current == asset) {
                return currentTarget;
            }
        }

        revert("QUOTE_NOT_ACCEPTED");
    }

    function graduationWeights()
        public
        view
        returns (
            uint16[] memory weights
        )
    {
        if (
            _graduationWeightSnapshot
                .length ==
            quoteAssets.length
        ) {
            weights =
                new uint16[](
                    quoteAssets.length
                );

            for (
                uint256 i;
                i < quoteAssets.length;
                ++i
            ) {
                weights[i] =
                    _graduationWeightSnapshot[
                        i
                    ];
            }

            return weights;
        }

        return
            _calculateGraduationWeights();
    }

    function _calculateGraduationWeights()
        internal
        view
        returns (
            uint16[] memory weights
        )
    {
        weights =
            new uint16[](
                quoteAssets.length
            );

        if (!adaptiveGraduation) {
            for (
                uint256 i;
                i < quoteAssets.length;
                ++i
            ) {
                weights[i] =
                    fixedWeightBps[
                        quoteAssets[i]
                    ];
            }
            return weights;
        }

        uint256 totalUsd;
        uint256[] memory values =
            new uint256[](
                quoteAssets.length
            );

        uint256 lastNonzeroIndex;
        bool foundNonzero;

        for (
            uint256 i;
            i < quoteAssets.length;
            ++i
        ) {
            uint256 amount =
                reserve(
                    quoteAssets[i]
                );

            if (amount == 0) {
                values[i] = 0;
                continue;
            }

            values[i] =
                _usdValue(
                    quoteAssets[i],
                    amount
                );

            if (values[i] > 0) {
                totalUsd += values[i];
                lastNonzeroIndex = i;
                foundNonzero = true;
            }
        }

        if (!foundNonzero) {
            for (
                uint256 i;
                i < quoteAssets.length;
                ++i
            ) {
                weights[i] =
                    fixedWeightBps[
                        quoteAssets[i]
                    ];
            }
            return weights;
        }

        uint256 assigned;
        for (
            uint256 i;
            i < quoteAssets.length;
            ++i
        ) {
            if (values[i] == 0) {
                weights[i] = 0;
                continue;
            }

            if (i == lastNonzeroIndex) {
                weights[i] =
                    uint16(
                        BPS -
                            assigned
                    );
            } else {
                uint16 weight =
                    uint16(
                        Math.mulDiv(
                            values[i],
                            BPS,
                            totalUsd
                        )
                    );

                weights[i] =
                    weight;
                assigned += weight;
            }
        }
    }

    /// @notice Snapshot used by keepers/UIs to preflight graduation without moving funds.
    function graduationSnapshot()
        public
        view
        returns (
            uint256 launchTokenAmount,
            IGraduationAdapter.AssetReserve[] memory reserves
        )
    {
        uint16[] memory weights = graduationWeights();
        reserves = new IGraduationAdapter.AssetReserve[](quoteAssets.length);

        for (uint256 i; i < quoteAssets.length; ++i) {
            address asset = quoteAssets[i];
            reserves[i] = IGraduationAdapter.AssetReserve({
                asset: asset,
                amount: reserve(asset),
                weightBps: weights[i]
            });
        }

        launchTokenAmount =
            requiredLaunchTokensForGraduation();
    }

    /// @notice Amount of unsold curve inventory needed to seed graduation
    ///         liquidity at the exact stored curve anchor price.
    function requiredLaunchTokensForGraduation()
        public
        view
        returns (uint256)
    {
        require(
            graduationAnchorPriceUsd1e18 > 0,
            "NO_GRADUATION_ANCHOR"
        );

        uint256 required =
            graduationLpTokenAmount;

        if (required == 0) {
            uint256 reserveUsd =
                netReserveUsd1e18();

            required =
                Math.mulDiv(
                    reserveUsd,
                    1e18,
                    graduationAnchorPriceUsd1e18
                );
        }

        require(
            required > 0,
            "ZERO_LP_TOKEN_AMOUNT"
        );
        require(
            launchToken.balanceOf(
                address(this)
            ) >= required,
            "INSUFFICIENT_LP_INVENTORY"
        );

        return required;
    }

    function preflightGraduation(address adapter, bytes calldata data)
        external
        view
        returns (bool ready, bytes32 reasonCode)
    {
        require(
            graduationReady &&
                !graduated &&
                !rescueActive,
            "NOT_READY"
        );
        require(adapter != address(0), "ZERO_ADAPTER");

        (
            uint256 tokenAmount,
            IGraduationAdapter.AssetReserve[] memory reserves
        ) = graduationSnapshot();

        return IGraduationPreflight(adapter).preflight(
            address(launchToken),
            tokenAmount,
            reserves,
            data
        );
    }

    /// @notice Factory hands all remaining reserves to a separately approved adapter.
    /// @dev All transfers + adapter execution are atomic. If the adapter reverts,
    ///      the entire transaction rolls back and the launch remains retryable.
    function graduate(address adapter, bytes calldata data) external nonReentrant {
        require(msg.sender == factory, "ONLY_FACTORY");
        require(
            graduationReady &&
                !graduated &&
                !rescueActive,
            "NOT_READY"
        );
        require(adapter != address(0), "ZERO_ADAPTER");

        (
            uint256 tokenAmount,
            IGraduationAdapter.AssetReserve[] memory reserves
        ) = graduationSnapshot();

        (bool ready, bytes32 reasonCode) =
            IGraduationPreflight(adapter).preflight(
                address(launchToken),
                tokenAmount,
                reserves,
                data
            );
        require(ready, string(abi.encodePacked("PREFLIGHT_FAILED:", reasonCode)));

        graduated = true;

        uint256 inventory =
            launchToken.balanceOf(address(this));
        uint256 unsoldExcess =
            inventory - tokenAmount;

        if (unsoldExcess > 0) {
            FortuneToken(address(launchToken))
                .burn(unsoldExcess);
            emit UnsoldInventoryBurned(
                unsoldExcess
            );
        }

        for (
            uint256 i;
            i < reserves.length;
            ++i
        ) {
            _accountedReserve[
                reserves[i].asset
            ] = 0;

            IERC20(
                reserves[i].asset
            ).safeTransfer(
                adapter,
                reserves[i].amount
            );
        }

        launchToken.safeTransfer(adapter, tokenAmount);

        IGraduationAdapter(adapter).graduate(
            address(launchToken),
            tokenAmount,
            reserves,
            data
        );

        emit Graduated(adapter);
    }

    /// @notice Permissionless recovery if graduation remains impossible for a full week.
    /// @dev Rescue converts circulating curve tokens into a pro-rata claim on the
    ///      quote reserves still held by the curve. It cannot touch successfully
    ///      graduated liquidity or external automation/fee vaults.
    function activateRescue() external {
        require(graduationReady && !graduated, "NOT_RESCUABLE");
        require(!rescueActive, "RESCUE_ACTIVE");
        require(
            block.timestamp >=
                uint256(graduationReadyAt) +
                    GRADUATION_RESCUE_DELAY,
            "RESCUE_DELAY"
        );
        require(tokensSold > 0, "NO_CIRCULATING_SUPPLY");

        rescueActive = true;
        rescueSupply = tokensSold;

        uint256 unsoldInventory =
            launchToken.balanceOf(address(this));
        if (unsoldInventory > 0) {
            FortuneToken(address(launchToken))
                .burn(unsoldInventory);
            emit UnsoldInventoryBurned(
                unsoldInventory
            );
        }

        emit RescueActivated(
            rescueSupply,
            block.timestamp
        );
    }

    function rescueRedeem(
        uint256 tokenAmount,
        uint256[] calldata minQuoteOut
    ) external nonReentrant returns (uint256[] memory amountsOut) {
        require(rescueActive, "RESCUE_INACTIVE");
        require(tokenAmount > 0, "ZERO_AMOUNT");
        require(
            minQuoteOut.length == quoteAssets.length,
            "MIN_OUT_LENGTH"
        );

        uint256 remainingSupply =
            rescueSupply - rescueRedeemed;
        require(
            tokenAmount <= remainingSupply,
            "EXCEEDS_RESCUE_SUPPLY"
        );

        amountsOut =
            new uint256[](quoteAssets.length);

        for (
            uint256 i;
            i < quoteAssets.length;
            ++i
        ) {
            address asset =
                quoteAssets[i];

            uint256 amount =
                _accountedReserve[asset] *
                tokenAmount /
                remainingSupply;

            require(
                amount >= minQuoteOut[i],
                "RESCUE_SLIPPAGE"
            );

            amountsOut[i] = amount;
        }

        launchToken.safeTransferFrom(
            msg.sender,
            address(this),
            tokenAmount
        );
        rescueRedeemed += tokenAmount;

        for (
            uint256 i;
            i < quoteAssets.length;
            ++i
        ) {
            if (amountsOut[i] > 0) {
                address asset =
                    quoteAssets[i];

                _accountedReserve[
                    asset
                ] -= amountsOut[i];

                IERC20(asset).safeTransfer(
                    msg.sender,
                    amountsOut[i]
                );
            }
        }

        emit RescueRedeemed(
            msg.sender,
            tokenAmount
        );
    }

    function _checkGraduation() internal {
        if (
            graduationReady ||
            graduated
        ) {
            return;
        }

        uint256 totalUsd =
            netReserveUsd1e18();

        if (
            totalUsd >=
            graduationUsd1e18
        ) {
            uint256 anchorPrice =
                currentPriceUsd1e18();

            uint256 lpTokenAmount =
                Math.mulDiv(
                    totalUsd,
                    1e18,
                    anchorPrice
                );

            require(
                lpTokenAmount > 0,
                "ZERO_LP_TOKEN_AMOUNT"
            );
            require(
                launchToken.balanceOf(
                    address(this)
                ) >= lpTokenAmount,
                "INSUFFICIENT_LP_INVENTORY"
            );

            uint16[] memory weights =
                _calculateGraduationWeights();

            delete
                _graduationWeightSnapshot;

            for (
                uint256 i;
                i < weights.length;
                ++i
            ) {
                _graduationWeightSnapshot
                    .push(weights[i]);
            }

            graduationReserveUsd1e18 =
                totalUsd;
            graduationLpTokenAmount =
                lpTokenAmount;
            graduationReady = true;
            graduationReadyAt =
                uint64(block.timestamp);
            graduationAnchorPriceUsd1e18 =
                anchorPrice;

            emit GraduationReady(
                totalUsd
            );
            emit GraduationAnchor(
                anchorPrice,
                totalUsd,
                tokensSold
            );
            emit GraduationSnapshotLocked(
                totalUsd,
                lpTokenAmount,
                weights
            );
        }
    }
}
