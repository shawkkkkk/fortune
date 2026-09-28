// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IFortuneLaunchRulesCurve {
    function graduated() external view returns (bool);
    function rescueActive() external view returns (bool);
}

/// @notice Optional launch rules for Fortune custom-pair launches: caps, sell
///         cooldowns, early-buyer vesting, curve-only transfers and time-boxed
///         allowlist or holder-gated access. The launch token calls
///         `onTransfer` after every balance change, so every path obeys: curve
///         buys, curve sells and wallet transfers. UNAUDITED BETA.
/// @dev One shared contract, with no owner, no upgrade path and no setter.
///      The factory registers a launch's rules once, inside the launch
///      transaction; after that nobody can change them, not the creator and
///      not Fortune.
///
///      Rules stop when the curve graduates (the token stops calling) or
///      opens rescue (checked here), so they can never block graduation, a
///      rescue redemption, or trading on PancakeSwap. Nothing here can stop a
///      holder from selling back to the curve for good: sell caps and
///      cooldowns only pace sales, and vesting ends by a fixed time within
///      30 days of launch.
///
///      Exempt wallets (up to ten, listed by the creator and public from the
///      launch) may exceed the wallet and buy caps, move tokens under
///      curve-only transfers, and buy during an access window. They are never
///      exempt from sell caps, sell cooldowns or vesting.
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
        /// Buys in the first `vestingWindow` seconds vest (up to one day).
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

    address public immutable factory;

    mapping(address token => Launch) private _launches;
    mapping(address token => mapping(address account => bool)) public isExempt;
    mapping(address token => mapping(address account => bool)) public isAllowlisted;
    /// Launch tokens a wallet bought from the curve inside the vesting window.
    mapping(address token => mapping(address account => uint256)) public vestedOf;
    mapping(address token => mapping(address account => uint64)) public lastSellAt;

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
            if (r.vestingWindow > MAX_VESTING_WINDOW || end == 0 || end > MAX_VESTING_END) return (false, "RULES_VESTING");
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
        if (!any) return (false, "RULES_EMPTY");
        return (true, "OK");
    }

    /// @notice `checkRules` for `abi.encode(rules)`, the form the factory forwards.
    function checkEncodedRules(bytes calldata encoded) external view returns (bool ok, bytes32 reason) {
        return checkRules(abi.decode(encoded, (Rules)));
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

        emit RulesRegistered(
            token, curve, r.maxWalletBps, r.maxBuyBps, r.maxSellBps, r.sellCooldown, r.curveOnly, r.vestingWindow, r.vestingCliff, r.vestingDuration
        );
        emit AccessRulesRegistered(token, r.allowlistSeconds, r.allowlist, r.gateToken, r.gateMinBalance, r.gateSeconds, r.exempt);
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

        if (from == l.curve) {
            _checkBuy(token, l, to, value, toBalance);
        } else if (to == l.curve) {
            _checkSell(token, l, from, value, fromBalance);
        } else {
            if (l.curveOnly && !isExempt[token][from] && !isExempt[token][to]) revert RulesCurveOnly();
            _checkWallet(token, l, to, toBalance);
            _checkVesting(token, l, from, fromBalance);
        }
    }

    function _checkBuy(address token, Launch storage l, address buyer, uint256 value, uint256 balance) internal {
        uint256 elapsed = block.timestamp - l.launchTimestamp;
        bool exempt = isExempt[token][buyer];
        bool privileged = exempt || buyer == l.creator;
        if (l.allowlistSeconds != 0 && elapsed < l.allowlistSeconds && !privileged && !isAllowlisted[token][buyer]) {
            revert RulesAllowlistOnly(l.launchTimestamp + l.allowlistSeconds);
        }
        if (l.gateSeconds != 0 && elapsed < l.gateSeconds && !privileged && !_holdsGate(l, buyer)) {
            revert RulesHolderGate(l.launchTimestamp + l.gateSeconds);
        }
        if (l.maxBuyBps != 0 && !exempt) {
            uint256 cap = _cap(l, l.maxBuyBps);
            if (value > cap) revert RulesMaxBuy(cap);
        }
        _checkWallet(token, l, buyer, balance);
        if (l.vestingWindow != 0 && elapsed < l.vestingWindow) vestedOf[token][buyer] += value;
    }

    function _checkSell(address token, Launch storage l, address seller, uint256 value, uint256 balance) internal {
        if (l.maxSellBps != 0) {
            uint256 cap = _cap(l, l.maxSellBps);
            if (value > cap) revert RulesMaxSell(cap);
        }
        if (l.sellCooldown != 0) {
            uint64 last = lastSellAt[token][seller];
            if (last != 0 && block.timestamp < uint256(last) + l.sellCooldown) revert RulesSellCooldown(uint256(last) + l.sellCooldown);
            lastSellAt[token][seller] = uint64(block.timestamp);
        }
        _checkVesting(token, l, seller, balance);
    }

    function _checkWallet(address token, Launch storage l, address holder, uint256 balance) internal view {
        if (l.maxWalletBps == 0 || isExempt[token][holder]) return;
        uint256 cap = _cap(l, l.maxWalletBps);
        if (balance > cap) revert RulesMaxWallet(cap);
    }

    function _checkVesting(address token, Launch storage l, address holder, uint256 balance) internal view {
        uint256 vested = vestedOf[token][holder];
        if (vested == 0) return;
        uint256 locked = _locked(l, vested);
        if (balance < locked) revert RulesVestingLocked(locked);
    }

    function _locked(Launch storage l, uint256 vested) internal view returns (uint256) {
        uint256 unlockStart = uint256(l.launchTimestamp) + l.vestingCliff;
        if (block.timestamp < unlockStart) return vested;
        uint256 unlockEnd = unlockStart + l.vestingDuration;
        if (block.timestamp >= unlockEnd) return 0;
        return vested * (unlockEnd - block.timestamp) / l.vestingDuration;
    }

    function _cap(Launch storage l, uint16 bps) internal view returns (uint256) {
        return l.supply * bps / BPS;
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

    /// @notice Caps in launch tokens; zero where the rule is off.
    function capsOf(address token) external view returns (uint256 maxWallet, uint256 maxBuy, uint256 maxSell) {
        Launch storage l = _launches[token];
        if (l.maxWalletBps != 0) maxWallet = _cap(l, l.maxWalletBps);
        if (l.maxBuyBps != 0) maxBuy = _cap(l, l.maxBuyBps);
        if (l.maxSellBps != 0) maxSell = _cap(l, l.maxSellBps);
    }

    /// @notice A wallet's vesting now: tokens still locked, what was vested, and when unlocking starts and ends.
    function lockOf(address token, address account)
        external
        view
        returns (uint256 locked, uint256 vested, uint64 unlockStart, uint64 unlockEnd)
    {
        Launch storage l = _launches[token];
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

    /// @notice Whether `account` may buy from the curve right now under the access rules.
    function canBuyNow(address token, address account) external view returns (bool) {
        Launch storage l = _launches[token];
        if (l.curve == address(0) || !active(token)) return true;
        if (isExempt[token][account] || account == l.creator) return true;
        uint256 elapsed = block.timestamp - l.launchTimestamp;
        if (l.allowlistSeconds != 0 && elapsed < l.allowlistSeconds && !isAllowlisted[token][account]) return false;
        if (l.gateSeconds != 0 && elapsed < l.gateSeconds && !_holdsGate(l, account)) return false;
        return true;
    }
}
