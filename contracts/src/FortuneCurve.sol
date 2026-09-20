// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {FortuneAssetRegistry} from "./FortuneAssetRegistry.sol";
import {FortuneFeeRouter} from "./FortuneFeeRouter.sol";
import {IGraduationAdapter} from "./interfaces/IGraduationAdapter.sol";

/// @notice Experimental shared curve accepting 1–5 quote assets.
/// @dev Economic formula is intentionally simple for testnet research and MUST be
///      independently reviewed before any production use.
contract FortuneCurve is ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint16 public constant BPS = 10_000;

    address public immutable factory;
    IERC20 public immutable launchToken;
    FortuneAssetRegistry public immutable registry;
    FortuneFeeRouter public immutable feeRouter;

    uint256 public immutable basePriceUsd1e18;
    uint256 public immutable slopeUsd1e18;
    uint256 public immutable graduationUsd1e18;
    bool public immutable adaptiveGraduation;

    address[] public quoteAssets;
    mapping(address => bool) public acceptedQuote;
    mapping(address => uint16) public fixedWeightBps;

    uint256 public tokensSold;
    bool public graduationReady;
    bool public graduated;

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
    event Graduated(address indexed adapter);

    modifier tradingOpen() {
        require(!graduationReady && !graduated, "TRADING_CLOSED");
        _;
    }

    constructor(
        address factory_,
        address launchToken_,
        address registry_,
        address feeRouter_,
        address[] memory quoteAssets_,
        uint16[] memory weightsBps_,
        uint256 basePriceUsd1e18_,
        uint256 slopeUsd1e18_,
        uint256 graduationUsd1e18_,
        bool adaptiveGraduation_
    ) {
        require(factory_ != address(0) && launchToken_ != address(0), "ZERO_ADDRESS");
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
        basePriceUsd1e18 = basePriceUsd1e18_;
        slopeUsd1e18 = slopeUsd1e18_;
        graduationUsd1e18 = graduationUsd1e18_;
        adaptiveGraduation = adaptiveGraduation_;
    }

    function currentPriceUsd1e18() public view returns (uint256) {
        return basePriceUsd1e18 + (slopeUsd1e18 * tokensSold / 1e18);
    }

    /// @notice Buy launch tokens with any accepted quote asset.
    /// @dev Uses the same global sold counter, so all quote assets move one canonical curve.
    function buy(
        address quoteAsset,
        uint256 amountIn,
        uint256 minTokensOut
    ) external nonReentrant tradingOpen returns (uint256 tokensOut) {
        require(acceptedQuote[quoteAsset], "QUOTE_NOT_ACCEPTED");
        require(amountIn > 0, "ZERO_AMOUNT");

        IERC20 quote = IERC20(quoteAsset);
        uint256 balanceBefore = quote.balanceOf(address(this));
        quote.safeTransferFrom(msg.sender, address(this), amountIn);
        uint256 received = quote.balanceOf(address(this)) - balanceBefore;
        // Fortune v1 deliberately rejects fee-on-transfer / non-standard
        // accounting rather than silently giving the buyer a bad quote.
        require(received == amountIn, "NON_STANDARD_QUOTE_TOKEN");

        uint256 fee = received * feeRouter.totalFeeBps() / BPS;
        uint256 netAmount = received - fee;

        if (fee > 0) {
            quote.safeTransfer(address(feeRouter), fee);
            feeRouter.route(quoteAsset, fee);
        }

        uint256 usdIn = registry.usdValue(quoteAsset, netAmount);
        uint256 price = currentPriceUsd1e18();
        tokensOut = usdIn * 1e18 / price;

        require(tokensOut >= minTokensOut && tokensOut > 0, "SLIPPAGE");
        require(launchToken.balanceOf(address(this)) >= tokensOut, "INSUFFICIENT_CURVE_TOKENS");

        tokensSold += tokensOut;

        launchToken.safeTransfer(msg.sender, tokensOut);
        emit Bought(msg.sender, quoteAsset, amountIn, tokensOut, usdIn);

        _checkGraduation();
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

    /// @notice Factory hands all remaining reserves to a separately approved adapter.
    function graduate(address adapter, bytes calldata data) external nonReentrant {
        require(msg.sender == factory, "ONLY_FACTORY");
        require(graduationReady && !graduated, "NOT_READY");
        require(adapter != address(0), "ZERO_ADAPTER");

        graduated = true;
        uint16[] memory weights = graduationWeights();
        IGraduationAdapter.AssetReserve[] memory reserves =
            new IGraduationAdapter.AssetReserve[](quoteAssets.length);

        for (uint256 i; i < quoteAssets.length; ++i) {
            address asset = quoteAssets[i];
            uint256 amount = reserve(asset);
            IERC20(asset).safeTransfer(adapter, amount);
            reserves[i] = IGraduationAdapter.AssetReserve({
                asset: asset,
                amount: amount,
                weightBps: weights[i]
            });
        }

        uint256 tokenAmount = launchToken.balanceOf(address(this));
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
        uint256 totalUsd = netReserveUsd1e18();
        if (totalUsd >= graduationUsd1e18) {
            graduationReady = true;
            emit GraduationReady(totalUsd);
        }
    }
}
