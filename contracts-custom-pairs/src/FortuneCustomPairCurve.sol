// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {FortuneCustomPairToken} from "./FortuneCustomPairToken.sol";
import {IPancakeV2PairLike} from "./interfaces/IPancakeV2.sol";

interface IFortuneCustomPairFactoryView {
    function protocolFeeRecipient() external view returns (address);
}

/// @notice Bonding curve for one Fortune launch paired with any BEP-20,
///         including tokens that take a tax on transfer.
/// @dev UNAUDITED BETA. Every amount the curve receives or pays is measured by
///      balance deltas, so transfer taxes never reach the curve's accounting.
///      Prices are in pair-token units; no oracle is involved.
///
///      Constant-product curve with a virtual pair reserve a0 = target / 3 and
///      a virtual launch-token reserve equal to the whole supply S:
///        sold(R)  = S * R / (a0 + R)
///        price(R) = (a0 + R)^2 / (S * a0)  pair units per launch-token unit
///      The price rises 16x from the first buy to graduation, 75% of supply is
///      sold by then, and the unsold remainder is always enough to seed the
///      PancakeSwap V2 pool at the final curve price (the rest is burned).
contract FortuneCustomPairCurve is ReentrancyGuard {
    using SafeERC20 for IERC20;

    struct Config {
        address factory;
        address creator;
        string name;
        string symbol;
        uint256 supply;
        address pairToken;
        uint8 pairDecimals;
        address pancakeFactory;
        uint256 graduationTarget;
        uint16 protocolFeeBps;
        uint16 creatorFeeBps;
    }

    struct State {
        Phase phase;
        uint256 reserve;
        uint256 shieldReserve;
        uint256 protocolFeesOwed;
        uint256 creatorFeesOwed;
        uint256 circulating;
        uint256 inventory;
        uint256 pairBalance;
        uint256 spotPriceX18;
        uint256 progressBps;
        uint16 shieldTaxBps;
        bool walletCapActive;
        uint64 graduationReadyAt;
        uint64 tradeCount;
    }

    enum Phase {
        CurveActive,
        GraduationReady,
        Graduated,
        Rescued
    }

    uint16 public constant BPS = 10_000;

    // Fortune Launch Shield, identical to the Standard curve: a buy-only
    // opening tax that decays to zero within five seconds, plus an early
    // per-wallet cap. Shield tax stays in this curve and becomes pool liquidity.
    uint16 public constant SNIPE_TAX_START_BPS = 9_900;
    uint32 public constant SNIPE_TAX_SECONDS = 5;
    uint16 public constant EARLY_WALLET_CAP_BPS = 200;
    uint32 public constant EARLY_WALLET_CAP_SECONDS = 15;

    uint32 public constant GRADUATION_RESCUE_DELAY = 7 days;
    uint256 public constant VIRTUAL_RESERVE_DIVISOR = 3;
    address public constant DEAD = 0x000000000000000000000000000000000000dEaD;
    // PancakeSwap V2 locks this much LP at address(0) on a pool's first mint.
    uint256 public constant MINIMUM_LIQUIDITY = 1_000;

    address public immutable factory;
    address public immutable creator;
    IERC20 public immutable pairToken;
    uint8 public immutable pairDecimals;
    FortuneCustomPairToken public immutable launchToken;
    address public immutable pool;
    uint256 public immutable launchSupply;
    uint256 public immutable graduationTarget;
    uint256 public immutable virtualReserve;
    uint16 public immutable protocolFeeBps;
    uint16 public immutable creatorFeeBps;
    uint64 public immutable launchTimestamp;

    // launchSupply * virtualReserve, the curve's constant product.
    uint256 private immutable _k;

    /// Net pair tokens backing the curve. Only this moves the price.
    uint256 public reserve;
    /// Launch Shield tax, held for graduation liquidity. Never paid to the creator.
    uint256 public shieldReserve;
    uint256 public protocolFeesOwed;
    uint256 public creatorFeesOwed;
    /// Launch tokens bought from the curve and not sold back.
    uint256 public circulating;
    uint64 public tradeCount;
    address public creatorFeeRecipient;
    mapping(address => uint256) public shieldPurchased;

    bool public graduationReady;
    bool public graduated;
    bool public rescueActive;
    bool private _initialBuyDone;
    uint64 public graduationReadyAt;

    uint256 public graduationPairDelivered;
    uint256 public graduationLaunchTokens;
    uint256 public graduationLiquidity;

    uint256 public rescueCirculating;
    uint256 public rescueHolderClaims;
    uint256 public rescueProtocolClaims;
    uint256 public rescueCreatorClaims;

    event LaunchShieldConfigured(
        uint16 startTaxBps,
        uint32 taxDurationSeconds,
        uint16 walletCapBps,
        uint32 walletCapDurationSeconds
    );
    event Bought(
        address indexed buyer,
        uint256 pairReceived,
        uint256 pairUsed,
        uint256 pairRefunded,
        uint256 shieldTax,
        uint256 tradingFee,
        uint256 tokensOut,
        uint256 reserveAfter
    );
    event Sold(
        address indexed seller,
        uint256 tokensIn,
        uint256 pairGross,
        uint256 tradingFee,
        uint256 pairSent,
        uint256 pairDelivered,
        uint256 reserveAfter
    );
    event GraduationReady(uint256 reserve, uint256 spotPriceX18);
    event Graduated(
        address indexed pool,
        uint256 pairSent,
        uint256 pairDelivered,
        uint256 launchTokensToPool,
        uint256 liquidityBurned,
        uint256 unsoldBurned
    );
    event ShortfallAbsorbed(uint256 fromShield, uint256 fromProtocolFees, uint256 fromCreatorFees, uint256 uncovered);
    event RescueActivated(
        bytes32 reason,
        uint256 circulating,
        uint256 holderClaims,
        uint256 protocolClaims,
        uint256 creatorClaims
    );
    event RescueRedeemed(address indexed holder, uint256 tokenAmount, uint256 pairSent, uint256 pairDelivered);
    event FeesClaimed(address indexed recipient, bool indexed creatorShare, uint256 pairSent, uint256 pairDelivered);
    event CreatorFeeRecipientUpdated(address indexed previousRecipient, address indexed newRecipient);
    event ExcessSwept(address indexed pool, uint256 amount);

    error TradingClosed();
    error OnlyFactory();
    error Slippage();

    constructor(Config memory c) {
        require(
            c.factory != address(0) &&
                c.creator != address(0) &&
                c.pairToken != address(0) &&
                c.pancakeFactory != address(0),
            "ZERO_ADDRESS"
        );
        require(c.pairToken.code.length > 0, "PAIR_NO_CODE");
        require(c.supply > 0 && c.graduationTarget >= VIRTUAL_RESERVE_DIVISOR, "BAD_ECONOMICS");
        require(uint256(c.protocolFeeBps) + c.creatorFeeBps <= 500, "FEE_TOO_HIGH");

        factory = c.factory;
        creator = c.creator;
        creatorFeeRecipient = c.creator;
        pairToken = IERC20(c.pairToken);
        pairDecimals = c.pairDecimals;
        launchSupply = c.supply;
        graduationTarget = c.graduationTarget;
        virtualReserve = c.graduationTarget / VIRTUAL_RESERVE_DIVISOR;
        _k = c.supply * (c.graduationTarget / VIRTUAL_RESERVE_DIVISOR);
        protocolFeeBps = c.protocolFeeBps;
        creatorFeeBps = c.creatorFeeBps;
        launchTimestamp = uint64(block.timestamp);

        FortuneCustomPairToken token =
            new FortuneCustomPairToken(c.name, c.symbol, c.supply, c.pairToken, c.pancakeFactory);
        launchToken = token;
        pool = token.pool();

        emit LaunchShieldConfigured(
            SNIPE_TAX_START_BPS,
            SNIPE_TAX_SECONDS,
            EARLY_WALLET_CAP_BPS,
            EARLY_WALLET_CAP_SECONDS
        );
    }

    // ---------------------------------------------------------------- views

    function phase() public view returns (Phase) {
        if (rescueActive) return Phase.Rescued;
        if (graduated) return Phase.Graduated;
        if (graduationReady) return Phase.GraduationReady;
        return Phase.CurveActive;
    }

    function launchElapsedSeconds() public view returns (uint256) {
        return block.timestamp > launchTimestamp ? block.timestamp - launchTimestamp : 0;
    }

    /// @notice Same fast decay as the Standard curve: 99% at launch, zero after five seconds.
    function currentSnipeTaxBps() public view returns (uint16) {
        uint256 elapsed = launchElapsedSeconds();
        if (elapsed >= SNIPE_TAX_SECONDS) return 0;
        uint256 shift = elapsed * 14 / SNIPE_TAX_SECONDS;
        if (shift >= 14) return 0;
        return uint16(uint256(SNIPE_TAX_START_BPS) >> shift);
    }

    function launchShieldActive() public view returns (bool) {
        return launchElapsedSeconds() < EARLY_WALLET_CAP_SECONDS;
    }

    /// @notice Marginal price in pair-token base units per whole launch token, scaled by 1e18.
    function spotPriceX18() public view returns (uint256) {
        uint256 d = virtualReserve + reserve;
        return Math.mulDiv(d, d * 1e36, _k);
    }

    function graduationProgressBps() public view returns (uint256) {
        if (graduated || graduationReady) return BPS;
        return Math.min(uint256(BPS), reserve * BPS / graduationTarget);
    }

    function feeBps() public view returns (uint16) {
        return protocolFeeBps + creatorFeeBps;
    }

    function state() external view returns (State memory s) {
        s.phase = phase();
        s.reserve = reserve;
        s.shieldReserve = shieldReserve;
        s.protocolFeesOwed = protocolFeesOwed;
        s.creatorFeesOwed = creatorFeesOwed;
        s.circulating = circulating;
        s.inventory = launchToken.balanceOf(address(this));
        s.pairBalance = pairToken.balanceOf(address(this));
        s.spotPriceX18 = spotPriceX18();
        s.progressBps = graduationProgressBps();
        s.shieldTaxBps = currentSnipeTaxBps();
        s.walletCapActive = launchShieldActive();
        s.graduationReadyAt = graduationReadyAt;
        s.tradeCount = tradeCount;
    }

    /// @notice Preview a buy for the pair-token amount the curve would actually
    ///         receive (after any transfer tax the pair token takes on the way in).
    function previewBuy(uint256 pairReceived)
        public
        view
        returns (
            uint256 pairUsed,
            uint256 pairRefund,
            uint256 shieldTax,
            uint256 tradingFee,
            uint256 netToCurve,
            uint256 tokensOut
        )
    {
        if (graduationReady || graduated || rescueActive) revert TradingClosed();
        require(pairReceived > 0, "ZERO_AMOUNT");
        uint16 shieldBps = currentSnipeTaxBps();
        uint256 protocolFee;
        uint256 creatorFee;
        pairUsed = pairReceived;
        (shieldTax, protocolFee, creatorFee, netToCurve) = _split(pairUsed, shieldBps);

        // The final buy is clamped to the graduation target and the rest refunded.
        uint256 remaining = graduationTarget - reserve;
        if (netToCurve > remaining) {
            uint256 needed = _grossForNet(remaining, shieldBps);
            if (needed < pairUsed) {
                pairUsed = needed;
                (shieldTax, protocolFee, creatorFee, netToCurve) = _split(pairUsed, shieldBps);
            }
        }
        pairRefund = pairReceived - pairUsed;
        tradingFee = protocolFee + creatorFee;
        tokensOut = _tokensForNet(netToCurve);
    }

    /// @notice Preview a sell before any transfer tax the pair token takes on the way out.
    function previewSell(uint256 tokenAmount)
        public
        view
        returns (uint256 pairGross, uint256 tradingFee, uint256 pairSent)
    {
        if (graduationReady || graduated || rescueActive) revert TradingClosed();
        require(tokenAmount > 0 && tokenAmount <= circulating, "BAD_TOKEN_AMOUNT");
        pairGross = _pairForTokens(tokenAmount);
        tradingFee = pairGross * protocolFeeBps / BPS + pairGross * creatorFeeBps / BPS;
        pairSent = pairGross - tradingFee;
    }

    /// @notice Pair tokens a rescue redemption of `tokenAmount` would send now.
    function previewRescueRedeem(uint256 tokenAmount) external view returns (uint256) {
        if (!rescueActive || tokenAmount == 0 || tokenAmount > rescueCirculating) return 0;
        return _rescuePayout(_rescueClaimFor(tokenAmount));
    }

    // -------------------------------------------------------------- trading

    /// @notice Buy launch tokens by sending up to `amountIn` pair tokens.
    /// @dev Transfer taxes are allowed: only what actually arrives is used.
    function buy(uint256 amountIn, uint256 minTokensOut) external nonReentrant returns (uint256 tokensOut) {
        _requireTrading();
        _requireReserveIntact();
        uint256 balanceBefore = pairToken.balanceOf(address(this));
        pairToken.safeTransferFrom(msg.sender, address(this), amountIn);
        uint256 balanceAfter = pairToken.balanceOf(address(this));
        require(balanceAfter > balanceBefore, "NOTHING_RECEIVED");
        tokensOut = _buy(msg.sender, balanceAfter - balanceBefore, minTokensOut);
    }

    /// @notice The creator's first buy inside the launch transaction. The factory
    ///         moves the pair tokens straight from the creator to this curve, so a
    ///         taxed pair token is only taxed once.
    function initialBuy(address buyer, uint256 minTokensOut) external nonReentrant returns (uint256 tokensOut) {
        if (msg.sender != factory) revert OnlyFactory();
        require(!_initialBuyDone && tradeCount == 0, "ALREADY_TRADED");
        _initialBuyDone = true;
        _requireTrading();
        uint256 received = pairToken.balanceOf(address(this)) - _liabilities();
        require(received > 0, "NOTHING_RECEIVED");
        tokensOut = _buy(buyer, received, minTokensOut);
    }

    /// @notice Sell launch tokens back to the curve. `minPairOut` is checked
    ///         against what actually reaches the seller after any transfer tax.
    function sell(uint256 tokenAmount, uint256 minPairOut) external nonReentrant returns (uint256 pairDelivered) {
        _requireTrading();
        require(tokenAmount > 0 && tokenAmount <= circulating, "BAD_TOKEN_AMOUNT");
        _requireReserveIntact();

        uint256 gross = _pairForTokens(tokenAmount);
        require(gross <= reserve, "INSUFFICIENT_RESERVE");
        uint256 protocolFee = gross * protocolFeeBps / BPS;
        uint256 creatorFee = gross * creatorFeeBps / BPS;
        uint256 pairSent = gross - protocolFee - creatorFee;
        require(pairSent > 0, "ZERO_OUT");

        reserve -= gross;
        circulating -= tokenAmount;
        protocolFeesOwed += protocolFee;
        creatorFeesOwed += creatorFee;
        tradeCount += 1;

        IERC20(address(launchToken)).safeTransferFrom(msg.sender, address(this), tokenAmount);
        pairDelivered = _sendMeasured(msg.sender, pairSent);
        if (pairDelivered < minPairOut) revert Slippage();
        _requireReserveIntact();

        emit Sold(msg.sender, tokenAmount, gross, protocolFee + creatorFee, pairSent, pairDelivered, reserve);
    }

    // ----------------------------------------------------------- graduation

    /// @notice Permissionless and atomic. Moves every pair token the curve does
    ///         not owe as fees into the launch's PancakeSwap V2 pool, adds launch
    ///         tokens at the final curve price, and burns the LP tokens.
    /// @dev If it reverts (for example the pair token is paused), anyone can
    ///      retry. After seven days holders can use rescue instead.
    function graduate() external nonReentrant returns (uint256 liquidity) {
        require(graduationReady && !graduated && !rescueActive, "NOT_READY");
        _requireReserveIntact();
        graduated = true;

        uint256 d = virtualReserve + reserve;
        uint256 pairSent = pairToken.balanceOf(address(this)) - protocolFeesOwed - creatorFeesOwed;
        reserve = 0;
        shieldReserve = 0;

        require(IPancakeV2PairLike(pool).totalSupply() == 0, "POOL_ALREADY_MINTED");
        launchToken.openPool();
        uint256 poolBefore = pairToken.balanceOf(pool);
        pairToken.safeTransfer(pool, pairSent);
        uint256 poolAfter = pairToken.balanceOf(pool);
        require(poolAfter > poolBefore, "NOTHING_DELIVERED");
        uint256 delivered = poolAfter - poolBefore;

        // Launch tokens at the curve's final marginal price for what arrived.
        uint256 inventory = launchToken.balanceOf(address(this));
        uint256 launchTokens = Math.min(Math.mulDiv(delivered, _k, d * d), inventory);
        require(launchTokens > 0, "ZERO_LAUNCH_LIQUIDITY");
        IERC20(address(launchToken)).safeTransfer(pool, launchTokens);
        liquidity = IPancakeV2PairLike(pool).mint(DEAD);
        // Ours must be the pool's only mint. A pair token that reenters the pool
        // from a transfer hook to mint LP for itself makes graduation revert.
        require(IPancakeV2PairLike(pool).totalSupply() == liquidity + MINIMUM_LIQUIDITY, "POOL_MINT_INTERLEAVED");

        uint256 unsold = launchToken.balanceOf(address(this));
        if (unsold > 0) launchToken.burn(unsold);
        _absorbShortfall();

        graduationPairDelivered = delivered;
        graduationLaunchTokens = launchTokens;
        graduationLiquidity = liquidity;
        emit Graduated(pool, pairSent, delivered, launchTokens, liquidity, unsold);
    }

    /// @notice After graduation, sends pair tokens that arrived later (donations,
    ///         positive rebases) into the pool as extra liquidity.
    function sweepExcessToPool() external nonReentrant returns (uint256 amount) {
        require(graduated, "NOT_GRADUATED");
        _absorbShortfall();
        uint256 balance = pairToken.balanceOf(address(this));
        uint256 owed = protocolFeesOwed + creatorFeesOwed;
        require(balance > owed, "NO_EXCESS");
        amount = balance - owed;
        pairToken.safeTransfer(pool, amount);
        IPancakeV2PairLike(pool).sync();
        _absorbShortfall();
        emit ExcessSwept(pool, amount);
    }

    // --------------------------------------------------------------- rescue

    /// @notice Permissionless. Available when graduation has been ready but
    ///         impossible for seven days, or when the pair token's balance here
    ///         has fallen below the curve reserve (negative rebase, seizure,
    ///         taxes charged on top of transfers). Holders then redeem pro rata.
    function activateRescue() external nonReentrant {
        require(!graduated && !rescueActive, "NOT_RESCUABLE");
        _absorbShortfall();
        bool stuck = graduationReady && block.timestamp >= uint256(graduationReadyAt) + GRADUATION_RESCUE_DELAY;
        bool impaired = pairToken.balanceOf(address(this)) < reserve;
        require(stuck || impaired, "NOT_RESCUABLE");

        rescueActive = true;
        rescueCirculating = circulating;
        uint256 holderClaims = reserve + shieldReserve;
        uint256 protocolClaims = protocolFeesOwed;
        if (circulating == 0) {
            protocolClaims += holderClaims;
            holderClaims = 0;
        }
        rescueHolderClaims = holderClaims;
        rescueProtocolClaims = protocolClaims;
        rescueCreatorClaims = creatorFeesOwed;
        reserve = 0;
        shieldReserve = 0;
        protocolFeesOwed = 0;
        creatorFeesOwed = 0;

        uint256 inventory = launchToken.balanceOf(address(this));
        if (inventory > 0) launchToken.burn(inventory);

        emit RescueActivated(
            stuck ? bytes32("GRADUATION_STUCK") : bytes32("PAIR_SHORTFALL"),
            rescueCirculating,
            holderClaims,
            protocolClaims,
            rescueCreatorClaims
        );
    }

    /// @notice Burn launch tokens for a pro-rata share of every pair token the curve holds.
    function rescueRedeem(uint256 tokenAmount, uint256 minPairOut) external nonReentrant returns (uint256 pairDelivered) {
        require(rescueActive, "RESCUE_INACTIVE");
        require(tokenAmount > 0 && tokenAmount <= rescueCirculating, "BAD_TOKEN_AMOUNT");
        uint256 claim = _rescueClaimFor(tokenAmount);
        uint256 payout = _rescuePayout(claim);
        rescueHolderClaims -= claim;
        rescueCirculating -= tokenAmount;

        IERC20(address(launchToken)).safeTransferFrom(msg.sender, address(this), tokenAmount);
        launchToken.burn(tokenAmount);
        if (payout > 0) pairDelivered = _sendMeasured(msg.sender, payout);
        if (pairDelivered < minPairOut) revert Slippage();
        emit RescueRedeemed(msg.sender, tokenAmount, payout, pairDelivered);
    }

    // ----------------------------------------------------------------- fees

    /// @notice Fees are pulled, never pushed, so a blacklisted or broken
    ///         recipient can never block trading.
    function claimCreatorFees() external nonReentrant returns (uint256 pairDelivered) {
        address recipient = creatorFeeRecipient;
        require(msg.sender == recipient, "ONLY_FEE_RECIPIENT");
        uint256 amount;
        if (rescueActive) {
            amount = _rescuePayout(rescueCreatorClaims);
            rescueCreatorClaims = 0;
        } else {
            _absorbShortfall();
            amount = creatorFeesOwed;
            creatorFeesOwed = 0;
        }
        require(amount > 0, "NOTHING_TO_CLAIM");
        pairDelivered = _sendMeasured(recipient, amount);
        if (!rescueActive) _requireReserveIntact();
        emit FeesClaimed(recipient, true, amount, pairDelivered);
    }

    function claimProtocolFees() external nonReentrant returns (uint256 pairDelivered) {
        address recipient = IFortuneCustomPairFactoryView(factory).protocolFeeRecipient();
        require(recipient != address(0), "NO_PROTOCOL_RECIPIENT");
        uint256 amount;
        if (rescueActive) {
            amount = _rescuePayout(rescueProtocolClaims);
            rescueProtocolClaims = 0;
        } else {
            _absorbShortfall();
            amount = protocolFeesOwed;
            protocolFeesOwed = 0;
        }
        require(amount > 0, "NOTHING_TO_CLAIM");
        pairDelivered = _sendMeasured(recipient, amount);
        if (!rescueActive) _requireReserveIntact();
        emit FeesClaimed(recipient, false, amount, pairDelivered);
    }

    function setCreatorFeeRecipient(address newRecipient) external {
        require(msg.sender == creatorFeeRecipient, "ONLY_FEE_RECIPIENT");
        require(newRecipient != address(0), "ZERO_ADDRESS");
        emit CreatorFeeRecipientUpdated(creatorFeeRecipient, newRecipient);
        creatorFeeRecipient = newRecipient;
    }

    // ------------------------------------------------------------- internal

    function _requireTrading() internal view {
        if (graduationReady || graduated || rescueActive) revert TradingClosed();
    }

    function _buy(address buyer, uint256 received, uint256 minTokensOut) internal returns (uint256 tokensOut) {
        (
            uint256 used,
            uint256 refund,
            uint256 shieldTax,
            uint256 tradingFee,
            uint256 net,
            uint256 out
        ) = previewBuy(received);
        tokensOut = out;
        if (tokensOut == 0 || tokensOut < minTokensOut) revert Slippage();

        if (launchShieldActive()) {
            uint256 next = shieldPurchased[buyer] + tokensOut;
            require(next <= launchSupply * EARLY_WALLET_CAP_BPS / BPS, "LAUNCH_SHIELD_WALLET_CAP");
            shieldPurchased[buyer] = next;
        }

        uint256 afterShield = used - shieldTax;
        uint256 protocolFee = afterShield * protocolFeeBps / BPS;
        reserve += net;
        shieldReserve += shieldTax;
        protocolFeesOwed += protocolFee;
        creatorFeesOwed += tradingFee - protocolFee;
        circulating += tokensOut;
        tradeCount += 1;

        IERC20(address(launchToken)).safeTransfer(buyer, tokensOut);
        if (refund > 0) {
            pairToken.safeTransfer(buyer, refund);
            _requireReserveIntact();
        }
        emit Bought(buyer, received, used, refund, shieldTax, tradingFee, tokensOut, reserve);

        if (reserve >= graduationTarget) {
            graduationReady = true;
            graduationReadyAt = uint64(block.timestamp);
            emit GraduationReady(reserve, spotPriceX18());
        }
    }

    function _split(uint256 gross, uint16 shieldBps)
        internal
        view
        returns (uint256 shieldTax, uint256 protocolFee, uint256 creatorFee, uint256 net)
    {
        shieldTax = gross * shieldBps / BPS;
        uint256 afterShield = gross - shieldTax;
        protocolFee = afterShield * protocolFeeBps / BPS;
        creatorFee = afterShield * creatorFeeBps / BPS;
        net = afterShield - protocolFee - creatorFee;
    }

    /// @dev Smallest gross whose net is at least `targetNet`. Rounding in
    ///      `_split` only ever rounds the taxes down, so this is exact enough.
    function _grossForNet(uint256 targetNet, uint16 shieldBps) internal view returns (uint256) {
        if (targetNet == 0) return 0;
        uint256 denominator = uint256(BPS - shieldBps) * uint256(BPS - feeBps());
        return Math.mulDiv(targetNet, uint256(BPS) * BPS, denominator, Math.Rounding.Ceil);
    }

    /// @dev sold(R + net) - sold(R), rounded down.
    function _tokensForNet(uint256 net) internal view returns (uint256) {
        if (net == 0) return 0;
        uint256 d = virtualReserve + reserve;
        return Math.mulDiv(_k, net, d * (d + net));
    }

    /// @dev Pair tokens released by moving the curve back `tokens`: t * D^2 / (K + t * D), rounded down.
    function _pairForTokens(uint256 tokens) internal view returns (uint256) {
        uint256 d = virtualReserve + reserve;
        return Math.mulDiv(tokens * d, d, _k + tokens * d);
    }

    function _liabilities() internal view returns (uint256) {
        return reserve + shieldReserve + protocolFeesOwed + creatorFeesOwed;
    }

    /// @dev If the pair token balance here is below what the curve owes, the
    ///      Launch Shield reserve and unclaimed fees absorb the loss first, so
    ///      the reserve backing holders is the last thing touched.
    function _absorbShortfall() internal {
        uint256 balance = pairToken.balanceOf(address(this));
        uint256 owed = _liabilities();
        if (balance >= owed) return;
        uint256 missing = owed - balance;
        uint256 fromShield = Math.min(missing, shieldReserve);
        shieldReserve -= fromShield;
        missing -= fromShield;
        uint256 fromProtocol = Math.min(missing, protocolFeesOwed);
        protocolFeesOwed -= fromProtocol;
        missing -= fromProtocol;
        uint256 fromCreator = Math.min(missing, creatorFeesOwed);
        creatorFeesOwed -= fromCreator;
        missing -= fromCreator;
        emit ShortfallAbsorbed(fromShield, fromProtocol, fromCreator, missing);
    }

    function _requireReserveIntact() internal {
        _absorbShortfall();
        require(pairToken.balanceOf(address(this)) >= reserve, "PAIR_RESERVE_SHORTFALL");
    }

    function _sendMeasured(address to, uint256 amount) internal returns (uint256 delivered) {
        uint256 before = pairToken.balanceOf(to);
        pairToken.safeTransfer(to, amount);
        uint256 afterBalance = pairToken.balanceOf(to);
        delivered = afterBalance > before ? afterBalance - before : 0;
    }

    function _rescueClaimFor(uint256 tokenAmount) internal view returns (uint256) {
        if (tokenAmount == rescueCirculating) return rescueHolderClaims;
        return Math.mulDiv(rescueHolderClaims, tokenAmount, rescueCirculating);
    }

    /// @dev Live pro-rata: each claim is paid from the balance held right now,
    ///      so later rebases or taxes are shared by everyone still waiting.
    function _rescuePayout(uint256 claim) internal view returns (uint256) {
        uint256 total = rescueHolderClaims + rescueProtocolClaims + rescueCreatorClaims;
        if (claim == 0 || total == 0) return 0;
        return Math.mulDiv(pairToken.balanceOf(address(this)), claim, total);
    }
}
