// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FortuneMarketCalendar} from "./FortuneMarketCalendar.sol";

interface IFortuneLaunchRulesCurve {
    function graduated() external view returns (bool);
    function rescueActive() external view returns (bool);
    function graduationProgressBps() external view returns (uint256);
}

interface IFortuneLaunchRulesToken {
    function balanceOf(address account) external view returns (uint256);
}

/// @notice Optional launch rules for Fortune custom-pair launches: caps, sell
///         cooldowns, vesting, curve-only transfers and time-boxed allowlist or
///         holder-gated access, plus trade rules modelled on HookedPad's hooks:
///         stock-market hours, graduated and sliding caps, a rising or
///         chapter-based max per wallet, a sniper gas-price cap and an
///         anti-bundle limit. The launch token calls `onTransfer` after every
///         balance change, so every path obeys: curve buys, curve sells and
///         wallet transfers. UNAUDITED BETA.
/// @dev One shared contract, with no owner, no upgrade path and no setter.
///      The factory registers a launch's rules once, inside the launch
///      transaction; after that nobody can change them, not the creator and
///      not Fortune.
///
///      Rules stop when the curve graduates (the token stops calling) or
///      opens rescue (checked here), so they can never block graduation, a
///      rescue redemption, or trading on PancakeSwap. Nothing here can stop a
///      holder from selling back to the curve for good: sell caps, cooldowns
///      and market hours only pace sales, launch-clock vesting ends within 30
///      days of launch, and holder vesting ends within 30 days of a wallet's
///      last vesting buy.
///
///      Exempt wallets (up to ten, listed by the creator and public from the
///      launch) may exceed the wallet and buy caps, move tokens under
///      curve-only transfers, buy during an access window, and skip the gas
///      cap and the anti-bundle limit. They are never exempt from sell caps,
///      sell cooldowns, vesting or market hours.
contract FortuneLaunchRules {
    uint16 public constant BPS = 10_000;
    uint16 public constant MIN_MAX_WALLET_BPS = 50;
    uint16 public constant MIN_MAX_BUY_BPS = 10;
    uint16 public constant MIN_MAX_SELL_BPS = 5;
    uint16 public constant MAX_CAP_BPS = 1_000;
    uint32 public constant MAX_SELL_COOLDOWN = 1 days;
    uint32 public constant MAX_VESTING_WINDOW = 1 days;
    uint32 public constant MAX_VESTING_END = 30 days;
    uint32 public constant MAX_ACCESS_WINDOW = 1 hours;
    uint256 public constant MAX_EXEMPT = 10;
    uint256 public constant MAX_ALLOWLIST = 200;
    uint256 public constant GATE_GAS = 50_000;

    /// Market-hours flags: the rule itself, sells kept open around the clock, holidays ignored.
    uint8 public constant MARKET_HOURS = 1;
    uint8 public constant MARKET_SELLS_OPEN = 2;
    uint8 public constant MARKET_IGNORE_HOLIDAYS = 4;
    uint16 public constant MIN_SELL_TIER_SMALL_BPS = 5;
    uint16 public constant MAX_SELL_TIER_SMALL_BPS = 500;
    uint16 public constant MIN_SELL_TIER_FLOOR_BPS = 1;
    uint16 public constant MAX_SELL_TIER_FLOOR_BPS = 100;
    uint16 public constant MIN_SELL_TIER_BAG_BPS = 50;
    uint16 public constant MAX_SELL_TIER_BAG_BPS = 1_000;
    uint256 public constant MAX_LEVELS = 5;
    uint16 public constant MAX_RISING_BPS = 500;
    uint32 public constant MIN_RISING_PERIOD = 1 minutes;
    uint32 public constant MAX_RISING_PERIOD = 1 days;
    uint16 public constant MIN_CHAPTER_START_BPS = 10;
    uint16 public constant MAX_CHAPTER_START_BPS = 500;
    uint16 public constant MIN_CHAPTER_VOLUME_BPS = 10;
    uint16 public constant MAX_CHAPTER_VOLUME_BPS = 1_000;
    uint64 public constant MIN_GAS_CAP = 100_000_000; // 0.1 gwei
    uint64 public constant MAX_GAS_CAP = 100_000_000_000; // 100 gwei
    uint32 public constant MIN_GAS_CAP_WINDOW = 1 minutes;
    uint32 public constant MAX_GAS_CAP_WINDOW = 1 days;
    uint8 public constant MAX_BUYS_PER_BLOCK = 20;
    uint16 public constant MAX_BUNDLE_MIN_BPS = 100;
    uint32 public constant MIN_WALLET_VEST_WINDOW = 1 minutes;
    uint32 public constant MAX_WALLET_VEST_WINDOW = 7 days;
    uint32 public constant MAX_WALLET_VEST_CLIFF = 7 days;
    uint32 public constant MIN_WALLET_VEST_PERIOD = 1 hours;
    uint32 public constant MAX_WALLET_VEST_PERIOD = 7 days;
    uint16 public constant MIN_WALLET_VEST_UNLOCK_BPS = 10;

    /// @notice Sliding caps: from `fromProgressBps` of graduation progress, these caps apply.
    struct CapLevel {
        uint16 fromProgressBps;
        /// Most one curve buy may take from this level (10 to 1,000 bps; zero: no cap).
        uint16 maxBuyBps;
        /// Most one curve sell may return from this level (5 to 1,000 bps; zero: no cap).
        uint16 maxSellBps;
    }

    /// @notice What a creator chooses at launch. Zero turns a rule off.
    struct Rules {
        /// Most any wallet may hold, in basis points of supply (50 to 1,000).
        uint16 maxWalletBps;
        /// Most one curve buy may take (10 to 1,000 bps).
        uint16 maxBuyBps;
        /// Most one curve sell may return (5 to 1,000 bps).
        uint16 maxSellBps;
        /// Seconds a wallet waits between curve sells (up to one day).
        uint32 sellCooldown;
        /// Tokens move only between wallets and the curve until graduation.
        bool curveOnly;
        /// Buys in the first `vestingWindow` seconds vest (up to one day). The window may not
        /// outlast the unlock (`vestingCliff + vestingDuration`), so every buy that vests is locked.
        uint32 vestingWindow;
        /// Nothing vested unlocks before launch + cliff ...
        uint32 vestingCliff;
        /// ... then it unlocks linearly over this many seconds. Cliff plus
        /// duration is at most 30 days.
        uint32 vestingDuration;
        /// Only these addresses (and exempt wallets and the creator) may buy
        /// during the first `allowlistSeconds` (up to one hour, 200 addresses).
        uint32 allowlistSeconds;
        address[] allowlist;
        /// Only holders of at least `gateMinBalance` of `gateToken` may buy
        /// during the first `gateSeconds` (up to one hour).
        address gateToken;
        uint256 gateMinBalance;
        uint32 gateSeconds;
        address[] exempt;
        /// Curve buys and sells only during the NYSE regular session. MARKET_HOURS turns it on;
        /// add MARKET_SELLS_OPEN to keep sells open around the clock and MARKET_IGNORE_HOLIDAYS
        /// to trade every Monday to Friday.
        uint8 marketHours;
        /// Graduated sell caps: a wallet holding at most `sellTierSmallBps` of supply may sell that
        /// much at a time; bigger bags get a smaller cap, falling evenly to `sellTierFloorBps` for
        /// bags of `sellTierBagBps` or more.
        uint16 sellTierSmallBps;
        uint16 sellTierFloorBps;
        uint16 sellTierBagBps;
        /// Sliding caps: the buy and sell caps at launch (zero: no cap) ...
        uint16 slideMaxBuyBps;
        uint16 slideMaxSellBps;
        /// ... and up to five levels of graduation progress where they change.
        CapLevel[] levels;
        /// Rising max per wallet: starts at `risingStartBps` of supply (1 to 500) and rises by
        /// `risingStepBps` (1 to 500), or doubles, every `risingPeriod` seconds (one minute to one day).
        uint16 risingStartBps;
        uint16 risingStepBps;
        bool risingDoubles;
        uint32 risingPeriod;
        /// Chapters: max per wallet starts at `chapterStartBps` of supply (10 to 500) and doubles
        /// each time another `chapterVolumeBps` of supply (10 to 1,000) trades on the curve.
        uint16 chapterStartBps;
        uint16 chapterVolumeBps;
        /// Sniper gas cap: for `gasCapSeconds` after launch (one minute to one day), a buy paying
        /// more than `maxGasPrice` wei per gas (0.1 to 100 gwei) is refused.
        uint64 maxGasPrice;
        uint32 gasCapSeconds;
        /// Anti-bundle: at most `maxBuysPerBlock` buys (1 to 20) of at least `bundleMinBps` of
        /// supply (1 to 100) in one block. Smaller buys are neither counted nor refused.
        uint8 maxBuysPerBlock;
        uint16 bundleMinBps;
        /// Holder vesting: every buy locks on its wallet's own clock. Nothing unlocks for
        /// `walletVestCliff` seconds (up to seven days), then `walletVestUnlockBps` of the bag
        /// (10 to 10,000) unlocks every `walletVestPeriod` (one hour to seven days), all within
        /// 30 days. A later buy restarts the clock for everything still locked. With
        /// `walletVestWindow` zero every buy vests; otherwise only buys in that many seconds after
        /// launch (one minute to seven days).
        uint32 walletVestWindow;
        uint32 walletVestCliff;
        uint16 walletVestUnlockBps;
        uint32 walletVestPeriod;
    }

    struct Launch {
        address curve;
        address creator;
        uint64 launchTimestamp;
        uint256 supply;
        uint16 maxWalletBps;
        uint16 maxBuyBps;
        uint16 maxSellBps;
        uint32 sellCooldown;
        bool curveOnly;
        uint32 vestingWindow;
        uint32 vestingCliff;
        uint32 vestingDuration;
        uint32 allowlistSeconds;
        uint32 allowlistCount;
        address gateToken;
        uint256 gateMinBalance;
        uint32 gateSeconds;
        address[] exemptList;
    }

    /// @notice A launch's trade rules, packed into two slots (fields as in Rules).
    struct TradeRules {
        uint8 marketHours;
        uint16 sellTierSmallBps;
        uint16 sellTierFloorBps;
        uint16 sellTierBagBps;
        uint16 slideMaxBuyBps;
        uint16 slideMaxSellBps;
        uint8 levelCount;
        uint16 risingStartBps;
        uint16 risingStepBps;
        bool risingDoubles;
        uint32 risingPeriod;
        uint16 chapterStartBps;
        uint16 chapterVolumeBps;
        uint8 maxBuysPerBlock;
        uint16 bundleMinBps;
        uint64 maxGasPrice;
        uint32 gasCapSeconds;
        uint32 walletVestWindow;
        uint32 walletVestCliff;
        uint16 walletVestUnlockBps;
        uint32 walletVestPeriod;
    }

    /// @notice What the trade rules track per launch.
    struct Flow {
        /// Launch tokens traded on the curve so far, buys plus sells (chapters).
        uint128 volume;
        /// The block of the latest counted buy, and how many counted buys it holds (anti-bundle).
        uint64 bundleBlock;
        uint8 bundleBuys;
        /// The sliding-caps level the latest trade left the curve at: the next trade's caps.
        uint8 level;
    }

    /// @notice Holder vesting: tokens locked when the wallet's clock last started, and when.
    struct WalletClock {
        uint192 locked;
        uint64 start;
    }

    address public immutable factory;

    mapping(address token => Launch) private _launches;
    mapping(address token => TradeRules) private _trade;
    mapping(address token => CapLevel[]) private _levels;
    mapping(address token => mapping(address account => bool)) public isExempt;
    mapping(address token => mapping(address account => bool)) public isAllowlisted;
    /// Launch tokens a wallet bought from the curve inside the vesting window.
    mapping(address token => mapping(address account => uint256)) public vestedOf;
    mapping(address token => mapping(address account => uint64)) public lastSellAt;
    mapping(address token => Flow) public flowOf;
    mapping(address token => mapping(address account => WalletClock)) public walletClockOf;

    event RulesRegistered(
        address indexed token,
        address indexed curve,
        uint16 maxWalletBps,
        uint16 maxBuyBps,
        uint16 maxSellBps,
        uint32 sellCooldown,
        bool curveOnly,
        uint32 vestingWindow,
        uint32 vestingCliff,
        uint32 vestingDuration
    );
    event AccessRulesRegistered(
        address indexed token,
        uint32 allowlistSeconds,
        address[] allowlist,
        address gateToken,
        uint256 gateMinBalance,
        uint32 gateSeconds,
        address[] exempt
    );
    event TradeRulesRegistered(address indexed token, TradeRules rules, CapLevel[] levels);

    error OnlyFactory();
    error AlreadyRegistered();
    error InvalidRules(bytes32 reason);
    error RulesMaxWallet(uint256 cap);
    error RulesMaxBuy(uint256 cap);
    error RulesMaxSell(uint256 cap);
    error RulesSellCooldown(uint256 readyAt);
    error RulesVestingLocked(uint256 locked);
    error RulesCurveOnly();
    error RulesAllowlistOnly(uint256 opensAt);
    error RulesHolderGate(uint256 opensAt);
    error RulesMarketClosed();
    error RulesGasPrice(uint256 maxGasPrice);
    error RulesBundle(uint256 maxBuysPerBlock);

    constructor(address factory_) {
        require(factory_ != address(0), "ZERO_FACTORY");
        factory = factory_;
    }

    // ------------------------------------------------------------ validation

    /// @notice Returns the first reason `r` would be refused, like the factory preflight.
    function checkRules(Rules memory r) public view returns (bool ok, bytes32 reason) {
        bool any;
        if (r.maxWalletBps != 0) {
            if (r.maxWalletBps < MIN_MAX_WALLET_BPS || r.maxWalletBps > MAX_CAP_BPS) return (false, "RULES_MAX_WALLET");
            any = true;
        }
        if (r.maxBuyBps != 0) {
            if (r.maxBuyBps < MIN_MAX_BUY_BPS || r.maxBuyBps > MAX_CAP_BPS) return (false, "RULES_MAX_BUY");
            any = true;
        }
        if (r.maxSellBps != 0) {
            if (r.maxSellBps < MIN_MAX_SELL_BPS || r.maxSellBps > MAX_CAP_BPS) return (false, "RULES_MAX_SELL");
            any = true;
        }
        if (r.sellCooldown != 0) {
            if (r.sellCooldown > MAX_SELL_COOLDOWN) return (false, "RULES_COOLDOWN");
            any = true;
        }
        if (r.curveOnly) any = true;
        if (r.vestingWindow != 0) {
            uint256 end = uint256(r.vestingCliff) + r.vestingDuration;
            // A window that outlasts the unlock would record buys as vested that are already free.
            if (r.vestingWindow > MAX_VESTING_WINDOW || end == 0 || end > MAX_VESTING_END || r.vestingWindow > end) {
                return (false, "RULES_VESTING");
            }
            any = true;
        } else if (r.vestingCliff != 0 || r.vestingDuration != 0) {
            return (false, "RULES_VESTING");
        }
        if (r.allowlistSeconds != 0) {
            if (r.allowlistSeconds > MAX_ACCESS_WINDOW || r.allowlist.length == 0 || r.allowlist.length > MAX_ALLOWLIST) {
                return (false, "RULES_ALLOWLIST");
            }
            for (uint256 i; i < r.allowlist.length; ++i) {
                if (r.allowlist[i] == address(0)) return (false, "RULES_ALLOWLIST");
            }
            any = true;
        } else if (r.allowlist.length != 0) {
            return (false, "RULES_ALLOWLIST");
        }
        if (r.gateSeconds != 0) {
            if (r.gateSeconds > MAX_ACCESS_WINDOW || r.gateMinBalance == 0 || r.gateToken.code.length == 0) {
                return (false, "RULES_GATE");
            }
            (bool callOk,) = _gateBalance(r.gateToken, address(this));
            if (!callOk) return (false, "RULES_GATE");
            any = true;
        } else if (r.gateToken != address(0) || r.gateMinBalance != 0) {
            return (false, "RULES_GATE");
        }
        if (r.exempt.length > MAX_EXEMPT) return (false, "RULES_EXEMPT");
        for (uint256 i; i < r.exempt.length; ++i) {
            if (r.exempt[i] == address(0)) return (false, "RULES_EXEMPT");
            for (uint256 j; j < i; ++j) {
                if (r.exempt[j] == r.exempt[i]) return (false, "RULES_EXEMPT");
            }
        }
        bool anyTrade;
        (anyTrade, reason) = _checkTradeRules(r);
        if (reason != bytes32(0)) return (false, reason);
        reason = _checkConflicts(r);
        if (reason != bytes32(0)) return (false, reason);
        if (!any && !anyTrade) return (false, "RULES_EMPTY");
        return (true, "OK");
    }

    /// @notice `checkRules` for `abi.encode(rules)`, the form the factory forwards.
    function checkEncodedRules(bytes calldata encoded) external view returns (bool ok, bytes32 reason) {
        return checkRules(abi.decode(encoded, (Rules)));
    }

    /// @dev Bounds of the trade rules. Returns whether any is on, or the first reason one is refused.
    function _checkTradeRules(Rules memory r) internal pure returns (bool any, bytes32 reason) {
        if (r.marketHours != 0) {
            if (r.marketHours & MARKET_HOURS == 0 || r.marketHours > 7) return (false, "RULES_MARKET_HOURS");
            any = true;
        }
        if (r.sellTierSmallBps != 0 || r.sellTierFloorBps != 0 || r.sellTierBagBps != 0) {
            if (
                r.sellTierSmallBps < MIN_SELL_TIER_SMALL_BPS || r.sellTierSmallBps > MAX_SELL_TIER_SMALL_BPS
                    || r.sellTierFloorBps < MIN_SELL_TIER_FLOOR_BPS || r.sellTierFloorBps > MAX_SELL_TIER_FLOOR_BPS
                    || r.sellTierBagBps < MIN_SELL_TIER_BAG_BPS || r.sellTierBagBps > MAX_SELL_TIER_BAG_BPS
                    || r.sellTierFloorBps >= r.sellTierSmallBps || r.sellTierSmallBps >= r.sellTierBagBps
            ) return (false, "RULES_SELL_TIERS");
            any = true;
        }
        if (r.levels.length != 0) {
            if (
                r.levels.length > MAX_LEVELS || !_capOk(r.slideMaxBuyBps, MIN_MAX_BUY_BPS)
                    || !_capOk(r.slideMaxSellBps, MIN_MAX_SELL_BPS)
            ) return (false, "RULES_SLIDING");
            bool capped = r.slideMaxBuyBps != 0 || r.slideMaxSellBps != 0;
            uint256 previous;
            for (uint256 i; i < r.levels.length; ++i) {
                CapLevel memory level = r.levels[i];
                if (
                    level.fromProgressBps <= previous || level.fromProgressBps >= BPS
                        || !_capOk(level.maxBuyBps, MIN_MAX_BUY_BPS) || !_capOk(level.maxSellBps, MIN_MAX_SELL_BPS)
                ) return (false, "RULES_SLIDING");
                previous = level.fromProgressBps;
                if (level.maxBuyBps != 0 || level.maxSellBps != 0) capped = true;
            }
            if (!capped) return (false, "RULES_SLIDING");
            any = true;
        } else if (r.slideMaxBuyBps != 0 || r.slideMaxSellBps != 0) {
            return (false, "RULES_SLIDING");
        }
        if (r.risingStartBps != 0) {
            if (
                r.risingStartBps > MAX_RISING_BPS || r.risingPeriod < MIN_RISING_PERIOD || r.risingPeriod > MAX_RISING_PERIOD
                    || (r.risingDoubles ? r.risingStepBps != 0 : r.risingStepBps == 0 || r.risingStepBps > MAX_RISING_BPS)
            ) return (false, "RULES_RISING");
            any = true;
        } else if (r.risingStepBps != 0 || r.risingDoubles || r.risingPeriod != 0) {
            return (false, "RULES_RISING");
        }
        if (r.chapterStartBps != 0) {
            if (
                r.chapterStartBps < MIN_CHAPTER_START_BPS || r.chapterStartBps > MAX_CHAPTER_START_BPS
                    || r.chapterVolumeBps < MIN_CHAPTER_VOLUME_BPS || r.chapterVolumeBps > MAX_CHAPTER_VOLUME_BPS
            ) return (false, "RULES_CHAPTERS");
            any = true;
        } else if (r.chapterVolumeBps != 0) {
            return (false, "RULES_CHAPTERS");
        }
        if (r.maxGasPrice != 0) {
            if (
                r.maxGasPrice < MIN_GAS_CAP || r.maxGasPrice > MAX_GAS_CAP || r.gasCapSeconds < MIN_GAS_CAP_WINDOW
                    || r.gasCapSeconds > MAX_GAS_CAP_WINDOW
            ) return (false, "RULES_GAS_CAP");
            any = true;
        } else if (r.gasCapSeconds != 0) {
            return (false, "RULES_GAS_CAP");
        }
        if (r.maxBuysPerBlock != 0) {
            if (r.maxBuysPerBlock > MAX_BUYS_PER_BLOCK || r.bundleMinBps == 0 || r.bundleMinBps > MAX_BUNDLE_MIN_BPS) {
                return (false, "RULES_BUNDLE");
            }
            any = true;
        } else if (r.bundleMinBps != 0) {
            return (false, "RULES_BUNDLE");
        }
        if (r.walletVestPeriod != 0) {
            if (
                r.walletVestPeriod < MIN_WALLET_VEST_PERIOD || r.walletVestPeriod > MAX_WALLET_VEST_PERIOD
                    || r.walletVestUnlockBps < MIN_WALLET_VEST_UNLOCK_BPS || r.walletVestUnlockBps > BPS
                    || r.walletVestCliff > MAX_WALLET_VEST_CLIFF
                    || (r.walletVestWindow != 0
                        && (r.walletVestWindow < MIN_WALLET_VEST_WINDOW || r.walletVestWindow > MAX_WALLET_VEST_WINDOW))
                    || _walletVestLength(r.walletVestCliff, r.walletVestPeriod, r.walletVestUnlockBps) > MAX_VESTING_END
            ) return (false, "RULES_WALLET_VESTING");
            any = true;
        } else if (r.walletVestWindow != 0 || r.walletVestCliff != 0 || r.walletVestUnlockBps != 0) {
            return (false, "RULES_WALLET_VESTING");
        }
    }

    /// @dev As on HookedPad, each cap comes from one rule: the wallet cap, the buy cap, the sell
    ///      cap and the vesting schedule.
    function _checkConflicts(Rules memory r) internal pure returns (bytes32) {
        bool sliding = r.levels.length != 0;
        if (_count(r.maxWalletBps != 0, r.risingStartBps != 0, r.chapterStartBps != 0) > 1) return "RULES_WALLET_CAP_CONFLICT";
        if (sliding && r.maxBuyBps != 0) return "RULES_BUY_CAP_CONFLICT";
        if (_count(r.maxSellBps != 0, r.sellTierSmallBps != 0, sliding) > 1) return "RULES_SELL_CAP_CONFLICT";
        if (r.vestingWindow != 0 && r.walletVestPeriod != 0) return "RULES_VESTING_CONFLICT";
        return bytes32(0);
    }

    function _capOk(uint16 bps, uint16 minimum) private pure returns (bool) {
        return bps == 0 || (bps >= minimum && bps <= MAX_CAP_BPS);
    }

    function _count(bool a, bool b, bool c) private pure returns (uint256 n) {
        if (a) n += 1;
        if (b) n += 1;
        if (c) n += 1;
    }

    /// @dev Seconds from a holder-vesting clock's start until all of it has unlocked.
    function _walletVestLength(uint256 cliff, uint256 period, uint256 unlockBps) private pure returns (uint256) {
        return cliff + period * ((BPS + unlockBps - 1) / unlockBps);
    }

    /// @notice Called once by the factory in the launch transaction, with `abi.encode(rules)`.
    function register(address token, address curve, address creator, uint256 supply, bytes calldata encoded) external {
        if (msg.sender != factory) revert OnlyFactory();
        Launch storage l = _launches[token];
        if (l.curve != address(0)) revert AlreadyRegistered();
        Rules memory r = abi.decode(encoded, (Rules));
        (bool ok, bytes32 reason) = checkRules(r);
        if (!ok) revert InvalidRules(reason);
        require(token != address(0) && curve != address(0) && creator != address(0) && supply > 0, "ZERO_VALUE");

        l.curve = curve;
        l.creator = creator;
        l.launchTimestamp = uint64(block.timestamp);
        l.supply = supply;
        l.maxWalletBps = r.maxWalletBps;
        l.maxBuyBps = r.maxBuyBps;
        l.maxSellBps = r.maxSellBps;
        l.sellCooldown = r.sellCooldown;
        l.curveOnly = r.curveOnly;
        l.vestingWindow = r.vestingWindow;
        l.vestingCliff = r.vestingCliff;
        l.vestingDuration = r.vestingDuration;
        l.allowlistSeconds = r.allowlistSeconds;
        l.gateToken = r.gateToken;
        l.gateMinBalance = r.gateMinBalance;
        l.gateSeconds = r.gateSeconds;
        uint32 listed;
        for (uint256 i; i < r.allowlist.length; ++i) {
            if (!isAllowlisted[token][r.allowlist[i]]) {
                isAllowlisted[token][r.allowlist[i]] = true;
                listed += 1;
            }
        }
        l.allowlistCount = listed;
        for (uint256 i; i < r.exempt.length; ++i) {
            isExempt[token][r.exempt[i]] = true;
            l.exemptList.push(r.exempt[i]);
        }

        TradeRules memory t = TradeRules({
            marketHours: r.marketHours,
            sellTierSmallBps: r.sellTierSmallBps,
            sellTierFloorBps: r.sellTierFloorBps,
            sellTierBagBps: r.sellTierBagBps,
            slideMaxBuyBps: r.slideMaxBuyBps,
            slideMaxSellBps: r.slideMaxSellBps,
            levelCount: uint8(r.levels.length),
            risingStartBps: r.risingStartBps,
            risingStepBps: r.risingStepBps,
            risingDoubles: r.risingDoubles,
            risingPeriod: r.risingPeriod,
            chapterStartBps: r.chapterStartBps,
            chapterVolumeBps: r.chapterVolumeBps,
            maxBuysPerBlock: r.maxBuysPerBlock,
            bundleMinBps: r.bundleMinBps,
            maxGasPrice: r.maxGasPrice,
            gasCapSeconds: r.gasCapSeconds,
            walletVestWindow: r.walletVestWindow,
            walletVestCliff: r.walletVestCliff,
            walletVestUnlockBps: r.walletVestUnlockBps,
            walletVestPeriod: r.walletVestPeriod
        });
        _trade[token] = t;
        for (uint256 i; i < r.levels.length; ++i) {
            _levels[token].push(r.levels[i]);
        }

        emit RulesRegistered(
            token, curve, r.maxWalletBps, r.maxBuyBps, r.maxSellBps, r.sellCooldown, r.curveOnly, r.vestingWindow, r.vestingCliff, r.vestingDuration
        );
        emit AccessRulesRegistered(token, r.allowlistSeconds, r.allowlist, r.gateToken, r.gateMinBalance, r.gateSeconds, r.exempt);
        emit TradeRulesRegistered(token, t, r.levels);
    }

    // ----------------------------------------------------------- enforcement

    /// @notice Called by a registered launch token after each transfer, with the
    ///         balances that transfer left. Reverts to refuse the transfer.
    function onTransfer(address from, address to, uint256 value, uint256 fromBalance, uint256 toBalance) external {
        address token = msg.sender;
        Launch storage l = _launches[token];
        // Only registered tokens have rules, and each can only touch its own.
        if (l.curve == address(0) || from == address(0) || to == address(0)) return;
        IFortuneLaunchRulesCurve curve = IFortuneLaunchRulesCurve(l.curve);
        if (curve.graduated() || curve.rescueActive()) return;
        TradeRules storage t = _trade[token];

        if (from == l.curve) {
            if (t.marketHours != 0 && !_marketOpen(t.marketHours)) revert RulesMarketClosed();
            _checkBuy(token, l, t, to, value, toBalance);
            _afterTrade(token, t, curve, value);
        } else if (to == l.curve) {
            if (t.marketHours & (MARKET_HOURS | MARKET_SELLS_OPEN) == MARKET_HOURS && !_marketOpen(t.marketHours)) {
                revert RulesMarketClosed();
            }
            _checkSell(token, l, t, from, value, fromBalance);
            _afterTrade(token, t, curve, value);
        } else {
            if (l.curveOnly && !isExempt[token][from] && !isExempt[token][to]) revert RulesCurveOnly();
            _checkWallet(token, l, t, to, toBalance);
            _checkVesting(token, l, t, from, fromBalance);
        }
    }

    function _checkBuy(address token, Launch storage l, TradeRules storage t, address buyer, uint256 value, uint256 balance)
        internal
    {
        uint256 elapsed = block.timestamp - l.launchTimestamp;
        bool exempt = isExempt[token][buyer];
        bool privileged = exempt || buyer == l.creator;
        if (l.allowlistSeconds != 0 && elapsed < l.allowlistSeconds && !privileged && !isAllowlisted[token][buyer]) {
            revert RulesAllowlistOnly(l.launchTimestamp + l.allowlistSeconds);
        }
        if (l.gateSeconds != 0 && elapsed < l.gateSeconds && !privileged && !_holdsGate(l, buyer)) {
            revert RulesHolderGate(l.launchTimestamp + l.gateSeconds);
        }
        if (t.maxGasPrice != 0 && elapsed < t.gasCapSeconds && !privileged && tx.gasprice > t.maxGasPrice) {
            revert RulesGasPrice(t.maxGasPrice);
        }
        if (!exempt) {
            if (t.maxBuysPerBlock != 0 && value >= _cap(l, t.bundleMinBps)) _countBuy(token, t);
            uint256 cap = _buyCap(token, l, t);
            if (cap != 0 && value > cap) revert RulesMaxBuy(cap);
        }
        _checkWallet(token, l, t, buyer, balance);
        if (l.vestingWindow != 0 && elapsed < l.vestingWindow) vestedOf[token][buyer] += value;
        if (t.walletVestPeriod != 0 && (t.walletVestWindow == 0 || elapsed < t.walletVestWindow)) {
            WalletClock storage c = walletClockOf[token][buyer];
            // The newest buy restarts the clock for everything still locked; what already unlocked stays free.
            c.locked = uint192(_walletLocked(t, c) + value);
            c.start = uint64(block.timestamp);
        }
    }

    function _checkSell(address token, Launch storage l, TradeRules storage t, address seller, uint256 value, uint256 balance)
        internal
    {
        uint256 cap = _sellCap(token, l, t, balance + value);
        if (cap != 0 && value > cap) revert RulesMaxSell(cap);
        if (l.sellCooldown != 0) {
            uint64 last = lastSellAt[token][seller];
            if (last != 0 && block.timestamp < uint256(last) + l.sellCooldown) revert RulesSellCooldown(uint256(last) + l.sellCooldown);
            lastSellAt[token][seller] = uint64(block.timestamp);
        }
        _checkVesting(token, l, t, seller, balance);
    }

    function _checkWallet(address token, Launch storage l, TradeRules storage t, address holder, uint256 balance)
        internal
        view
    {
        uint256 cap = _walletCap(token, l, t);
        if (cap == 0 || isExempt[token][holder]) return;
        if (balance > cap) revert RulesMaxWallet(cap);
    }

    function _checkVesting(address token, Launch storage l, TradeRules storage t, address holder, uint256 balance)
        internal
        view
    {
        uint256 locked;
        if (t.walletVestPeriod != 0) {
            locked = _walletLocked(t, walletClockOf[token][holder]);
        } else {
            uint256 vested = vestedOf[token][holder];
            if (vested == 0) return;
            locked = _locked(l, vested);
        }
        if (balance < locked) revert RulesVestingLocked(locked);
    }

    /// @dev Counts a buy of at least the anti-bundle minimum against this block's limit.
    function _countBuy(address token, TradeRules storage t) internal {
        Flow storage f = flowOf[token];
        if (f.bundleBlock != block.number) {
            f.bundleBlock = uint64(block.number);
            f.bundleBuys = 1;
        } else {
            if (f.bundleBuys >= t.maxBuysPerBlock) revert RulesBundle(t.maxBuysPerBlock);
            f.bundleBuys += 1;
        }
    }

    /// @dev After a curve trade: count its volume for chapters, and record the sliding-caps level it
    ///      left the curve at, which the next trade uses. A trade is judged at the level the market
    ///      stood at before it, so a large sell cannot escape a level's cap by pushing the curve below it.
    function _afterTrade(address token, TradeRules storage t, IFortuneLaunchRulesCurve curve, uint256 value) internal {
        if (t.chapterStartBps == 0 && t.levelCount == 0) return;
        Flow storage f = flowOf[token];
        if (t.chapterStartBps != 0) {
            uint256 volume = uint256(f.volume) + value;
            f.volume = volume > type(uint128).max ? type(uint128).max : uint128(volume);
        }
        if (t.levelCount != 0) {
            uint8 level = _levelAt(token, t.levelCount, curve.graduationProgressBps());
            if (level != f.level) f.level = level;
        }
    }

    function _locked(Launch storage l, uint256 vested) internal view returns (uint256) {
        uint256 unlockStart = uint256(l.launchTimestamp) + l.vestingCliff;
        if (block.timestamp < unlockStart) return vested;
        uint256 unlockEnd = unlockStart + l.vestingDuration;
        if (block.timestamp >= unlockEnd) return 0;
        return vested * (unlockEnd - block.timestamp) / l.vestingDuration;
    }

    /// @dev Holder vesting: nothing unlocks until a whole period after the cliff, then a share per period.
    function _walletLocked(TradeRules storage t, WalletClock storage c) internal view returns (uint256) {
        uint256 locked = c.locked;
        if (locked == 0) return 0;
        uint256 elapsed = block.timestamp - c.start;
        if (elapsed < uint256(t.walletVestCliff) + t.walletVestPeriod) return locked;
        uint256 unlockedBps = (elapsed - t.walletVestCliff) / t.walletVestPeriod * t.walletVestUnlockBps;
        return unlockedBps >= BPS ? 0 : locked * (BPS - unlockedBps) / BPS;
    }

    /// @dev The max per wallet now, from whichever rule sets it; zero when there is none.
    function _walletCap(address token, Launch storage l, TradeRules storage t) internal view returns (uint256) {
        if (l.maxWalletBps != 0) return _cap(l, l.maxWalletBps);
        uint256 bps;
        if (t.risingStartBps != 0) {
            uint256 periods = (block.timestamp - l.launchTimestamp) / t.risingPeriod;
            bps = t.risingDoubles ? _doubled(t.risingStartBps, periods) : t.risingStartBps + periods * t.risingStepBps;
        } else if (t.chapterStartBps != 0) {
            bps = _doubled(t.chapterStartBps, flowOf[token].volume / _cap(l, t.chapterVolumeBps));
        } else {
            return 0;
        }
        // A cap that has grown to the whole supply no longer limits anyone.
        return bps >= BPS ? 0 : _cap(l, uint16(bps));
    }

    /// @dev The max per buy now: the fixed cap, or the sliding level's; zero when there is none.
    function _buyCap(address token, Launch storage l, TradeRules storage t) internal view returns (uint256) {
        if (l.maxBuyBps != 0) return _cap(l, l.maxBuyBps);
        if (t.levelCount == 0) return 0;
        (uint16 buyBps,) = _levelCaps(token, t, flowOf[token].level);
        return _cap(l, buyBps);
    }

    /// @dev The max per sell now for a wallet holding `bag` before the sell; zero when there is none.
    function _sellCap(address token, Launch storage l, TradeRules storage t, uint256 bag) internal view returns (uint256) {
        if (l.maxSellBps != 0) return _cap(l, l.maxSellBps);
        if (t.levelCount != 0) {
            (, uint16 sellBps) = _levelCaps(token, t, flowOf[token].level);
            return _cap(l, sellBps);
        }
        if (t.sellTierSmallBps == 0) return 0;
        uint256 small = _cap(l, t.sellTierSmallBps);
        if (bag <= small) return small;
        uint256 floor = _cap(l, t.sellTierFloorBps);
        uint256 big = _cap(l, t.sellTierBagBps);
        if (bag >= big) return floor;
        return small - (small - floor) * (bag - small) / (big - small);
    }

    function _levelCaps(address token, TradeRules storage t, uint8 level) internal view returns (uint16, uint16) {
        if (level == 0) return (t.slideMaxBuyBps, t.slideMaxSellBps);
        CapLevel storage c = _levels[token][level - 1];
        return (c.maxBuyBps, c.maxSellBps);
    }

    /// @dev The sliding-caps level for `progressBps`: zero below the first level.
    function _levelAt(address token, uint8 count, uint256 progressBps) internal view returns (uint8 level) {
        CapLevel[] storage levels = _levels[token];
        for (uint8 i; i < count; ++i) {
            if (progressBps < levels[i].fromProgressBps) break;
            level = i + 1;
        }
    }

    function _doubled(uint256 startBps, uint256 times) internal pure returns (uint256) {
        return times >= 14 ? BPS : startBps << times;
    }

    function _cap(Launch storage l, uint16 bps) internal view returns (uint256) {
        return l.supply * bps / BPS;
    }

    function _marketOpen(uint8 flags) internal view returns (bool) {
        return FortuneMarketCalendar.isOpen(block.timestamp, flags & MARKET_IGNORE_HOLIDAYS == 0);
    }

    function _holdsGate(Launch storage l, address buyer) internal view returns (bool) {
        (bool ok, uint256 amount) = _gateBalance(l.gateToken, buyer);
        return ok && amount >= l.gateMinBalance;
    }

    /// @dev `balanceOf` with at most `GATE_GAS` and only the first word of the reply copied, so a
    ///      hostile gate token can neither burn the caller's gas nor make it pay for a huge reply.
    function _gateBalance(address gateToken, address account) internal view returns (bool ok, uint256 amount) {
        assembly ("memory-safe") {
            let ptr := mload(0x40)
            mstore(ptr, shl(224, 0x70a08231))
            mstore(add(ptr, 0x04), and(account, 0xffffffffffffffffffffffffffffffffffffffff))
            ok := staticcall(GATE_GAS, gateToken, ptr, 0x24, ptr, 0x20)
            ok := and(ok, gt(returndatasize(), 0x1f))
            amount := mload(ptr)
        }
    }

    // ------------------------------------------------------------------ views

    /// @notice Whether `token` has rules that still apply (registered, not graduated, not in rescue).
    function active(address token) public view returns (bool) {
        Launch storage l = _launches[token];
        if (l.curve == address(0)) return false;
        IFortuneLaunchRulesCurve curve = IFortuneLaunchRulesCurve(l.curve);
        return !curve.graduated() && !curve.rescueActive();
    }

    function rulesOf(address token) external view returns (Launch memory) {
        return _launches[token];
    }

    /// @notice A launch's trade rules and its sliding-caps levels.
    function tradeRulesOf(address token) external view returns (TradeRules memory, CapLevel[] memory) {
        return (_trade[token], _levels[token]);
    }

    /// @notice Caps in launch tokens that apply to the next trade; zero where there is none. With
    ///         graduated sell caps, `maxSell` is the small holders' cap: see `sellCapOf`.
    function capsOf(address token) external view returns (uint256 maxWallet, uint256 maxBuy, uint256 maxSell) {
        Launch storage l = _launches[token];
        if (l.curve == address(0)) return (0, 0, 0);
        TradeRules storage t = _trade[token];
        maxWallet = _walletCap(token, l, t);
        maxBuy = _buyCap(token, l, t);
        maxSell = _sellCap(token, l, t, 0);
    }

    /// @notice The most `account` may sell to the curve in one go now, given what it holds (zero: no cap).
    function sellCapOf(address token, address account) external view returns (uint256) {
        Launch storage l = _launches[token];
        if (l.curve == address(0)) return 0;
        return _sellCap(token, l, _trade[token], IFortuneLaunchRulesToken(token).balanceOf(account));
    }

    /// @notice A wallet's vesting now: tokens still locked, what was vested, and when unlocking
    ///         starts and ends. Under holder vesting, `vested` is what was locked when the wallet's
    ///         clock last started, `unlockStart` is its first unlock and `unlockEnd` its last.
    function lockOf(address token, address account)
        external
        view
        returns (uint256 locked, uint256 vested, uint64 unlockStart, uint64 unlockEnd)
    {
        Launch storage l = _launches[token];
        TradeRules storage t = _trade[token];
        if (t.walletVestPeriod != 0) {
            WalletClock storage c = walletClockOf[token][account];
            vested = c.locked;
            if (vested == 0) return (0, 0, 0, 0);
            unlockStart = c.start + t.walletVestCliff + t.walletVestPeriod;
            unlockEnd = c.start + uint64(_walletVestLength(t.walletVestCliff, t.walletVestPeriod, t.walletVestUnlockBps));
            if (active(token)) locked = _walletLocked(t, c);
            return (locked, vested, unlockStart, unlockEnd);
        }
        vested = vestedOf[token][account];
        unlockStart = l.launchTimestamp + l.vestingCliff;
        unlockEnd = unlockStart + l.vestingDuration;
        if (vested != 0 && active(token)) locked = _locked(l, vested);
    }

    /// @notice When `account` may next sell to the curve (zero: now).
    function sellReadyAt(address token, address account) external view returns (uint64) {
        Launch storage l = _launches[token];
        uint64 last = lastSellAt[token][account];
        if (l.sellCooldown == 0 || last == 0 || !active(token)) return 0;
        uint64 ready = last + l.sellCooldown;
        return ready > block.timestamp ? ready : 0;
    }

    /// @notice Whether the market-hours rule lets curve buys and sells through right now.
    function marketStatus(address token) external view returns (bool buysOpen, bool sellsOpen) {
        uint8 flags = _trade[token].marketHours;
        if (flags == 0 || !active(token)) return (true, true);
        buysOpen = _marketOpen(flags);
        sellsOpen = buysOpen || flags & MARKET_SELLS_OPEN != 0;
    }

    /// @notice The NYSE regular-session calendar the market-hours rule follows.
    function isMarketOpen(uint256 timestamp, bool observeHolidays) external pure returns (bool) {
        return FortuneMarketCalendar.isOpen(timestamp, observeHolidays);
    }

    /// @notice Whether `account` may buy from the curve right now under market hours and the access
    ///         rules. The gas cap depends on the transaction and is not checked here.
    function canBuyNow(address token, address account) external view returns (bool) {
        Launch storage l = _launches[token];
        if (l.curve == address(0) || !active(token)) return true;
        uint8 flags = _trade[token].marketHours;
        if (flags != 0 && !_marketOpen(flags)) return false;
        if (isExempt[token][account] || account == l.creator) return true;
        uint256 elapsed = block.timestamp - l.launchTimestamp;
        if (l.allowlistSeconds != 0 && elapsed < l.allowlistSeconds && !isAllowlisted[token][account]) return false;
        if (l.gateSeconds != 0 && elapsed < l.gateSeconds && !_holdsGate(l, account)) return false;
        return true;
    }
}
