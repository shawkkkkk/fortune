// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {FortuneAssetRegistry} from "./FortuneAssetRegistry.sol";
import {FortuneFeeRouter} from "./FortuneFeeRouter.sol";
import {IGraduationAdapter} from "./interfaces/IGraduationAdapter.sol";
import {IGraduationPreflight} from "./interfaces/IGraduationPreflight.sol";

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
    uint64 public immutable launchTimestamp;

    uint256 public immutable basePriceUsd1e18;
    uint256 public immutable slopeUsd1e18;
    uint256 public immutable graduationUsd1e18;
    bool public immutable adaptiveGraduation;

    address[] public quoteAssets;
    mapping(address => bool) public acceptedQuote;
    mapping(address => uint16) public fixedWeightBps;
    mapping(address => uint256) public shieldPurchased;

    uint256 public tokensSold;
    bool public graduationReady;
    bool public graduated;
    bool public rescueActive;
    uint64 public graduationReadyAt;
    uint256 public graduationAnchorPriceUsd1e18;
    uint256 public rescueSupply;
    uint256 public rescueRedeemed;

    enum Phase {
        CurveActive,
        GraduationReady,
        PoolCreated,
        Rescued
    }

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
        bool adaptiveGraduation_
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

        uint256 weightSum;
        for (uint256 i; i < quoteAssets_.length; ++i) {
            address asset = quoteAssets_[i];
            require(asset != address(0), "ZERO_QUOTE");
            require(!acceptedQuote[asset], "DUPLICATE_QUOTE");
            require(FortuneAssetRegistry(registry_).isQuoteAsset(asset), "UNAPPROVED_QUOTE");

            acceptedQuote[asset] = true;
            fixedWeightBps[asset] = weightsBps_[i];
            quoteAssets.push(asset);
            weightSum += weightsBps_[i];
        }
        require(weightSum == BPS, "BAD_WEIGHTS");

        factory = factory_;
        launchToken = IERC20(launchToken_);
        registry = FortuneAssetRegistry(registry_);
        feeRouter = FortuneFeeRouter(feeRouter_);
        shieldVault = shieldVault_;
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
        return basePriceUsd1e18 + (slopeUsd1e18 * tokensSold / 1e18);
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
        uint16 feeBps = feeRouter.totalFeeBps();

        quoteSpent = amountIn;
        (
            snipeTax,
            normalFee,
            netQuote
        ) = _feesForGross(quoteSpent, shieldBps, feeBps);
        usdIn = registry.usdValue(quoteAsset, netQuote);

        uint256 remainingUsd = graduationUsd1e18 - reserveUsdBefore;
        if (usdIn > remainingUsd) {
            uint256 targetNetQuote =
                registry.tokenAmountForUsd(quoteAsset, remainingUsd);

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
            ) = _feesForGross(quoteSpent, shieldBps, feeBps);

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
                    feeBps
                );
            }

            usdIn = registry.usdValue(quoteAsset, netQuote);
        }

        quoteRefund = amountIn - quoteSpent;
        uint256 price = currentPriceUsd1e18();
        tokensOut = usdIn * 1e18 / price;

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

        if (fee > 0) {
            quote.safeTransfer(address(feeRouter), fee);
            feeRouter.route(quoteAsset, fee);
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
        uint16 feeBps
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
        normalFee = afterShield * feeBps / BPS;
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

    /// @notice Sell launch tokens into any accepted quote reserve with enough depth.
    function sell(
        address quoteAsset,
        uint256 tokenAmount,
        uint256 minQuoteOut
    ) external nonReentrant tradingOpen returns (uint256 quoteOut) {
        require(acceptedQuote[quoteAsset], "QUOTE_NOT_ACCEPTED");
        require(tokenAmount > 0 && tokenAmount <= tokensSold, "BAD_TOKEN_AMOUNT");

        uint256 nextSold = tokensSold - tokenAmount;
        uint256 sellPrice = basePriceUsd1e18 + (slopeUsd1e18 * nextSold / 1e18);
        uint256 usdGross = tokenAmount * sellPrice / 1e18;
        uint256 grossQuote = registry.tokenAmountForUsd(quoteAsset, usdGross);

        require(reserve(quoteAsset) >= grossQuote, "INSUFFICIENT_QUOTE_RESERVE");

        uint256 fee = grossQuote * feeRouter.totalFeeBps() / BPS;
        quoteOut = grossQuote - fee;
        require(quoteOut >= minQuoteOut, "SLIPPAGE");

        launchToken.safeTransferFrom(msg.sender, address(this), tokenAmount);
        tokensSold = nextSold;

        IERC20 quote = IERC20(quoteAsset);
        if (fee > 0) {
            quote.safeTransfer(address(feeRouter), fee);
            feeRouter.route(quoteAsset, fee);
        }
        quote.safeTransfer(msg.sender, quoteOut);

        emit Sold(msg.sender, quoteAsset, tokenAmount, quoteOut, usdGross);
    }

    function quoteAssetCount() external view returns (uint256) {
        return quoteAssets.length;
    }

    /// @notice Live reserve balance. Using balanceOf makes the curve resilient to
    ///         rebasing-style quote assets and direct balance changes.
    function reserve(address asset) public view returns (uint256) {
        require(acceptedQuote[asset], "QUOTE_NOT_ACCEPTED");
        return IERC20(asset).balanceOf(address(this));
    }

    function netReserveUsd1e18() public view returns (uint256 totalUsd) {
        for (uint256 i; i < quoteAssets.length; ++i) {
            address asset = quoteAssets[i];
            uint256 amount = IERC20(asset).balanceOf(address(this));
            if (amount > 0) totalUsd += registry.usdValue(asset, amount);
        }
    }

    /// @notice Allows a keeper to recognize a threshold crossed by rebasing
    ///         or direct reserve changes even when no trade just executed.
    function checkGraduation() external {
        _checkGraduation();
    }

    function graduationWeights() public view returns (uint16[] memory weights) {
        weights = new uint16[](quoteAssets.length);

        if (!adaptiveGraduation) {
            for (uint256 i; i < quoteAssets.length; ++i) {
                weights[i] = fixedWeightBps[quoteAssets[i]];
            }
            return weights;
        }

        uint256 totalUsd;
        uint256[] memory values = new uint256[](quoteAssets.length);
        for (uint256 i; i < quoteAssets.length; ++i) {
            values[i] = registry.usdValue(quoteAssets[i], reserve(quoteAssets[i]));
            totalUsd += values[i];
        }

        if (totalUsd == 0) {
            for (uint256 i; i < quoteAssets.length; ++i) {
                weights[i] = fixedWeightBps[quoteAssets[i]];
            }
            return weights;
        }

        uint256 assigned;
        for (uint256 i; i < quoteAssets.length; ++i) {
            if (i == quoteAssets.length - 1) {
                weights[i] = uint16(BPS - assigned);
            } else {
                uint16 weight = uint16(values[i] * BPS / totalUsd);
                weights[i] = weight;
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

        launchTokenAmount = launchToken.balanceOf(address(this));
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

        for (uint256 i; i < reserves.length; ++i) {
            IERC20(reserves[i].asset).safeTransfer(
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

    function _checkGraduation() internal {
        if (graduationReady || graduated) return;

        uint256 totalUsd = netReserveUsd1e18();
        if (totalUsd >= graduationUsd1e18) {
            uint256 anchorPrice = currentPriceUsd1e18();
            graduationReady = true;
            graduationReadyAt = uint64(block.timestamp);
            graduationAnchorPriceUsd1e18 = anchorPrice;

            emit GraduationReady(totalUsd);
            emit GraduationAnchor(
                anchorPrice,
                totalUsd,
                tokensSold
            );
        }
    }
}
