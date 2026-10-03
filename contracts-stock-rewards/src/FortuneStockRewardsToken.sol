// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Burnable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IPancakeV3PoolLookup {
    function getPool(address tokenA, address tokenB, uint24 fee) external view returns (address);
}

interface IPancakeV2PairLookup {
    function getPair(address tokenA, address tokenB) external view returns (address);
}

/// @notice Fixed-supply Fortune launch token whose holders earn up to five
///         stock tokens. UNAUDITED TESTNET BETA.
/// @dev Every reward-asset token this contract receives is paid to holders:
///      the holder share of curve trade fees (sent by the launch's fee
///      router), the stock side of PancakeSwap fees from the locked
///      liquidity, graduation dust, or anything else sent here. New funds are
///      streamed out over STREAM_DURATION, pro rata to balance at each moment,
///      so buying just before a large payment lands and selling right after
///      earns almost nothing. Holders claim whenever they like; nothing needs a
///      keeper. Launch tokens sent to this contract are burned, which is where
///      the launch-token side of pool fees goes.
///
///      Supply that can never claim earns nothing, and its share goes to
///      everyone else: the factory, the curve, the graduation adapter, the
///      dead address and PancakeSwap pools holding this token. The factory
///      excludes the curve at launch and the launch's pools at graduation, and
///      anyone can exclude any other genuine PancakeSwap V3 pool or V2 pair.
///      There is no owner, mint, transfer fee, blacklist or pause.
///
///      Accounting is the usual dividend-token scheme: a per-asset cumulative
///      reward per token (`perShare`, scaled by 2^96) and a signed correction
///      per holder, adjusted on every transfer so a balance change never moves
///      rewards already earned. The stream releases at most once per block
///      timestamp, before the first balance change in that block. New funds
///      join the stream at that point too, or whenever anyone calls `sync`,
///      claims, or collects pool fees through the factory.
contract FortuneStockRewardsToken is ERC20, ERC20Burnable, ReentrancyGuard {
    uint16 public constant FORTUNE_STOCK_REWARDS_TOKEN_VERSION = 1;
    uint256 public constant MAX_REWARD_ASSETS = 5;
    uint256 public constant STREAM_DURATION = 6 hours;
    /// Below this many eligible tokens, streams wait instead of paying out.
    uint256 public constant MIN_ELIGIBLE_SUPPLY = 1e18;
    uint256 public constant MAX_SUPPLY = 1e33;
    address public constant DEAD = 0x000000000000000000000000000000000000dEaD;
    /// Gas allowed for each `balanceOf`, `token0`, `token1` or `fee` read of another contract.
    uint256 public constant READ_GAS = 50_000;
    uint256 internal constant MAGNITUDE = 2 ** 96;

    /// Per reward asset. The first transfer in each block reads `perShare`
    /// and the packed slot after it, so they are kept to two slots;
    /// `totalReceived` is only written when funds arrive.
    struct RewardState {
        /// Cumulative rewards per eligible token, scaled by 2^96.
        uint256 perShare;
        /// Released to holders and not claimed yet.
        uint96 owed;
        /// Received and not released yet.
        uint96 streaming;
        /// When `streaming` is fully released, if nothing new arrives.
        uint64 streamEnd;
        /// Everything ever received.
        uint256 totalReceived;
    }

    address public immutable factory;
    address public immutable pancakeV3Factory;
    /// Zero when only V3 pools can be excluded.
    address public immutable pancakeV2Factory;
    uint256 public immutable initialSupply;
    uint256 public immutable rewardAssetCount;
    // perShare never exceeds this, so perShare * any balance fits in an int256.
    uint256 internal immutable _maxPerShare;
    address internal immutable _asset0;
    address internal immutable _asset1;
    address internal immutable _asset2;
    address internal immutable _asset3;
    address internal immutable _asset4;

    mapping(address asset => RewardState) internal _rewards;
    mapping(address asset => mapping(address account => int256)) internal _corrections;
    /// Rewards paid out to (or given up by) each account, per asset.
    mapping(address asset => mapping(address account => uint256)) public claimed;
    mapping(address account => bool) public isExcluded;
    uint192 internal _eligibleSupply;
    uint64 public lastAccrual;

    event RewardsReceived(address indexed asset, uint256 amount, uint256 streamEnd);
    event RewardClaimed(address indexed account, address indexed asset, uint256 amount);
    event RewardClaimFailed(address indexed account, address indexed asset, uint256 amount);
    event ExcludedFromRewards(address indexed account, uint256 balance);

    error OnlyFactory();
    error NotAPancakePool();
    error UnknownRewardAsset();

    struct Accrual {
        uint256 perShare;
        uint256 owed;
        uint256 streaming;
        uint256 streamEnd;
        uint256 received;
        bool changed;
    }

    /// @param factory_ Receives the whole supply and can exclude accounts.
    /// @param rewardAssets_ One to five distinct token contracts holders earn.
    /// @param excluded_ Further accounts that never earn, besides the factory and the dead address.
    constructor(
        string memory name_,
        string memory symbol_,
        uint256 supply_,
        address factory_,
        address[] memory rewardAssets_,
        address pancakeV3Factory_,
        address pancakeV2Factory_,
        address[] memory excluded_
    ) ERC20(name_, symbol_) {
        require(factory_ != address(0), "ZERO_FACTORY");
        require(supply_ > 0 && supply_ <= MAX_SUPPLY, "BAD_SUPPLY");
        uint256 count = rewardAssets_.length;
        require(count > 0 && count <= MAX_REWARD_ASSETS, "BAD_ASSET_COUNT");
        for (uint256 i; i < count; ++i) {
            address asset = rewardAssets_[i];
            require(asset != address(0) && asset.code.length > 0, "BAD_ASSET");
            for (uint256 j; j < i; ++j) {
                require(rewardAssets_[j] != asset, "DUPLICATE_ASSET");
            }
        }

        factory = factory_;
        pancakeV3Factory = pancakeV3Factory_;
        pancakeV2Factory = pancakeV2Factory_;
        initialSupply = supply_;
        rewardAssetCount = count;
        _maxPerShare = uint256(type(int256).max) / supply_;
        _asset0 = rewardAssets_[0];
        _asset1 = count > 1 ? rewardAssets_[1] : address(0);
        _asset2 = count > 2 ? rewardAssets_[2] : address(0);
        _asset3 = count > 3 ? rewardAssets_[3] : address(0);
        _asset4 = count > 4 ? rewardAssets_[4] : address(0);

        isExcluded[factory_] = true;
        isExcluded[DEAD] = true;
        for (uint256 i; i < excluded_.length; ++i) {
            if (excluded_[i] != address(0)) isExcluded[excluded_[i]] = true;
        }
        lastAccrual = uint64(block.timestamp);
        _mint(factory_, supply_);
    }

    // -------------------------------------------------------------- claims

    /// @notice Releases what the streams owe so far and starts streaming any
    ///         reward-asset tokens that arrived since. Anyone may call it.
    function sync() external nonReentrant {
        _accrue();
    }

    /// @notice Pays the caller everything released to them, in every reward asset.
    /// @return amounts Paid per reward asset, in `rewardAssets()` order. An
    ///         asset whose transfer fails pays zero and stays claimable.
    function claim() external nonReentrant returns (uint256[] memory amounts) {
        return _claim(msg.sender);
    }

    /// @notice Pays each account its own rewards. Anyone may call it.
    function claimFor(address[] calldata accounts) external nonReentrant {
        for (uint256 i; i < accounts.length; ++i) {
            _claim(accounts[i]);
        }
    }

    function _claim(address account) internal returns (uint256[] memory amounts) {
        _accrue();
        uint256 count = rewardAssetCount;
        amounts = new uint256[](count);
        if (isExcluded[account]) return amounts;
        for (uint256 i; i < count; ++i) {
            address asset = _asset(i);
            RewardState storage s = _rewards[asset];
            // Reads the balance afresh for each asset, so a token that calls back
            // during a payment cannot make a later payment use a stale balance.
            uint256 amount = _earned(asset, account, s.perShare);
            if (amount == 0) continue;
            claimed[asset][account] += amount;
            s.owed -= uint96(amount);
            if (_send(asset, account, amount)) {
                amounts[i] = amount;
                emit RewardClaimed(account, asset, amount);
            } else {
                claimed[asset][account] -= amount;
                s.owed += uint96(amount);
                emit RewardClaimFailed(account, asset, amount);
            }
        }
    }

    // ---------------------------------------------------------- exclusions

    /// @notice Factory only: the launch's curve at launch and its PancakeSwap
    ///         pools at graduation.
    function excludeFromRewards(address account) external nonReentrant {
        if (msg.sender != factory) revert OnlyFactory();
        _exclude(account);
    }

    /// @notice Anyone may exclude a genuine PancakeSwap V3 pool or V2 pair that
    ///         holds this token: a pool can never claim, so whatever it would
    ///         earn would sit here forever. Its unclaimed rewards are streamed
    ///         to everyone else.
    function excludePool(address pool) external nonReentrant {
        if (!isPancakePool(pool)) revert NotAPancakePool();
        _exclude(pool);
    }

    function _exclude(address account) internal {
        if (account == address(0) || isExcluded[account]) return;
        _accrue();
        uint256 balance = balanceOf(account);
        uint256 count = rewardAssetCount;
        for (uint256 i; i < count; ++i) {
            address asset = _asset(i);
            RewardState storage s = _rewards[asset];
            uint256 unclaimed = _earned(asset, account, s.perShare);
            if (unclaimed == 0) continue;
            claimed[asset][account] += unclaimed;
            s.owed -= uint96(unclaimed);
            s.streaming += uint96(unclaimed);
            s.streamEnd = uint64(block.timestamp + STREAM_DURATION);
        }
        isExcluded[account] = true;
        _eligibleSupply -= uint192(balance);
        emit ExcludedFromRewards(account, balance);
    }

    /// @notice Whether `pool` is a PancakeSwap V3 pool or V2 pair, registered
    ///         with the factories this token was created with, that trades this token.
    function isPancakePool(address pool) public view returns (bool) {
        if (pool.code.length == 0) return false;
        (bool ok0, uint256 word0) = _read(pool, 0x0dfe1681); // token0()
        (bool ok1, uint256 word1) = _read(pool, 0xd21220a7); // token1()
        if (!ok0 || !ok1 || word0 > type(uint160).max || word1 > type(uint160).max) return false;
        address token0 = address(uint160(word0));
        address token1 = address(uint160(word1));
        if (token0 != address(this) && token1 != address(this)) return false;
        if (pancakeV3Factory != address(0)) {
            (bool okFee, uint256 fee) = _read(pool, 0xddca3f43); // fee()
            if (okFee && fee <= type(uint24).max) {
                try IPancakeV3PoolLookup(pancakeV3Factory).getPool(token0, token1, uint24(fee)) returns (address found) {
                    if (found == pool) return true;
                } catch {}
            }
        }
        if (pancakeV2Factory != address(0)) {
            try IPancakeV2PairLookup(pancakeV2Factory).getPair(token0, token1) returns (address found) {
                if (found == pool) return true;
            } catch {}
        }
        return false;
    }

    // --------------------------------------------------------------- views

    function rewardAssets() public view returns (address[] memory assets) {
        uint256 count = rewardAssetCount;
        assets = new address[](count);
        for (uint256 i; i < count; ++i) {
            assets[i] = _asset(i);
        }
    }

    function isRewardAsset(address asset) public view returns (bool) {
        if (asset == address(0)) return false;
        uint256 count = rewardAssetCount;
        for (uint256 i; i < count; ++i) {
            if (_asset(i) == asset) return true;
        }
        return false;
    }

    /// @notice Tokens that currently earn rewards: total supply minus excluded holdings.
    function eligibleSupply() external view returns (uint256) {
        return _eligibleSupply;
    }

    /// @notice What `account` would receive from `claim()` now, for one asset.
    function claimableOf(address asset, address account) public view returns (uint256) {
        if (!isRewardAsset(asset)) revert UnknownRewardAsset();
        if (isExcluded[account]) return 0;
        return _earned(asset, account, _accrual(asset, lastAccrual, _eligibleSupply).perShare);
    }

    /// @notice What `account` would receive from `claim()` now, per reward asset.
    function claimable(address account) external view returns (address[] memory assets, uint256[] memory amounts) {
        assets = rewardAssets();
        amounts = new uint256[](assets.length);
        if (isExcluded[account]) return (assets, amounts);
        uint256 last = lastAccrual;
        uint256 eligible = _eligibleSupply;
        for (uint256 i; i < assets.length; ++i) {
            amounts[i] = _earned(assets[i], account, _accrual(assets[i], last, eligible).perShare);
        }
    }

    /// @notice Reward state as last written.
    function rewardState(address asset) external view returns (RewardState memory) {
        if (!isRewardAsset(asset)) revert UnknownRewardAsset();
        return _rewards[asset];
    }

    /// @notice Reward state as it would be after an accrual now: what the
    ///         website shows as streaming, owed and the stream's end.
    function previewRewardState(address asset) external view returns (RewardState memory state) {
        if (!isRewardAsset(asset)) revert UnknownRewardAsset();
        state = _rewards[asset];
        Accrual memory a = _accrual(asset, lastAccrual, _eligibleSupply);
        state.perShare = a.perShare;
        state.owed = uint96(a.owed);
        state.streaming = uint96(a.streaming);
        state.streamEnd = uint64(a.streamEnd);
        state.totalReceived += a.received;
    }

    // ------------------------------------------------------------ internals

    function _update(address from, address to, uint256 value) internal override {
        // Launch tokens sent here are burned: the launch-token side of pool fees and graduation dust.
        if (to == address(this)) to = address(0);
        // Release rewards for the time since the last balance change, before this one.
        if (block.timestamp != lastAccrual) _accrue();
        super._update(from, to, value);
        if (value == 0 || from == to) return;
        bool fromEarns = from != address(0) && !isExcluded[from];
        bool toEarns = to != address(0) && !isExcluded[to];
        if (!fromEarns && !toEarns) return;
        uint256 eligible = _eligibleSupply;
        if (fromEarns) eligible -= value;
        if (toEarns) eligible += value;
        _eligibleSupply = uint192(eligible);
        uint256 count = rewardAssetCount;
        for (uint256 i; i < count; ++i) {
            address asset = _asset(i);
            uint256 perShare = _rewards[asset].perShare;
            if (perShare == 0) continue;
            // Moves exactly the rewards that `value` tokens would carry, so neither
            // side's earnings to date change.
            int256 adjustment = int256(perShare * value);
            if (fromEarns) _corrections[asset][from] += adjustment;
            if (toEarns) _corrections[asset][to] -= adjustment;
        }
    }

    /// @dev Never reverts: transfers must keep working whatever a reward asset does.
    function _accrue() internal {
        uint256 last = lastAccrual;
        if (block.timestamp != last) lastAccrual = uint64(block.timestamp);
        uint256 eligible = _eligibleSupply;
        uint256 count = rewardAssetCount;
        for (uint256 i; i < count; ++i) {
            address asset = _asset(i);
            Accrual memory a = _accrual(asset, last, eligible);
            if (!a.changed) continue;
            RewardState storage s = _rewards[asset];
            if (a.perShare != s.perShare) s.perShare = a.perShare;
            (s.owed, s.streaming, s.streamEnd) = (uint96(a.owed), uint96(a.streaming), uint64(a.streamEnd));
            if (a.received > 0) {
                // Each intake is at most 2^96, so this cannot overflow.
                s.totalReceived += a.received;
                emit RewardsReceived(asset, a.received, a.streamEnd);
            }
        }
    }

    /// @dev One accrual step for `asset` at the current timestamp, given the
    ///      previous accrual time and the eligible supply since then. First the
    ///      stream releases what it owes for that time; then any balance this
    ///      contract holds beyond what it already accounts for joins the stream,
    ///      which restarts over STREAM_DURATION. Within one timestamp only the
    ///      second part does anything, so it is safe to repeat.
    function _accrual(address asset, uint256 last, uint256 eligible) internal view returns (Accrual memory a) {
        RewardState storage s = _rewards[asset];
        a.perShare = s.perShare;
        a.owed = s.owed;
        a.streaming = s.streaming;
        a.streamEnd = s.streamEnd;

        if (a.streaming > 0 && block.timestamp > last) {
            if (eligible < MIN_ELIGIBLE_SUPPLY) {
                // Nobody to pay: the stream waits, and restarts in full when holders return.
                a.streamEnd = block.timestamp + STREAM_DURATION;
                a.changed = true;
            } else {
                uint256 amount = block.timestamp >= a.streamEnd
                    ? a.streaming
                    : a.streaming * (block.timestamp - last) / (a.streamEnd - last);
                uint256 increment = amount * MAGNITUDE / eligible;
                if (increment > 0 && increment <= _maxPerShare - a.perShare) {
                    a.perShare += increment;
                    a.owed += amount;
                    a.streaming -= amount;
                    a.changed = true;
                }
            }
        }

        (bool ok, uint256 held) = _read(asset, 0x70a08231, address(this)); // balanceOf(this)
        uint256 known = a.owed + a.streaming;
        // Balances beyond 2^96 base units are ignored, which keeps every amount here in range.
        if (ok && held > known && held <= type(uint96).max) {
            a.received = held - known;
            a.streaming += a.received;
            a.streamEnd = block.timestamp + STREAM_DURATION;
            a.changed = true;
        }
    }

    function _earned(address asset, address account, uint256 perShare) internal view returns (uint256) {
        int256 accrued = int256(perShare * balanceOf(account)) + _corrections[asset][account];
        if (accrued <= 0) return 0;
        uint256 total = uint256(accrued) / MAGNITUDE;
        uint256 done = claimed[asset][account];
        return total > done ? total - done : 0;
    }

    function _asset(uint256 i) internal view returns (address) {
        if (i == 0) return _asset0;
        if (i == 1) return _asset1;
        if (i == 2) return _asset2;
        if (i == 3) return _asset3;
        return _asset4;
    }

    /// @dev A zero-argument view call with at most READ_GAS and only the first
    ///      word of the reply copied, so a hostile contract can neither burn the
    ///      caller's gas nor make it pay for a huge reply.
    function _read(address target, uint32 selector) internal view returns (bool ok, uint256 word) {
        assembly ("memory-safe") {
            let ptr := mload(0x40)
            mstore(ptr, shl(224, selector))
            ok := staticcall(READ_GAS, target, ptr, 0x04, ptr, 0x20)
            ok := and(ok, gt(returndatasize(), 0x1f))
            word := mload(ptr)
        }
    }

    /// @dev `_read` for a one-address-argument call such as `balanceOf`.
    function _read(address target, uint32 selector, address argument) internal view returns (bool ok, uint256 word) {
        assembly ("memory-safe") {
            let ptr := mload(0x40)
            mstore(ptr, shl(224, selector))
            mstore(add(ptr, 0x04), and(argument, 0xffffffffffffffffffffffffffffffffffffffff))
            ok := staticcall(READ_GAS, target, ptr, 0x24, ptr, 0x20)
            ok := and(ok, gt(returndatasize(), 0x1f))
            word := mload(ptr)
        }
    }

    /// @dev ERC-20 `transfer` that reports failure instead of reverting, accepts
    ///      tokens that return nothing, and copies at most one word of the reply.
    function _send(address asset, address to, uint256 amount) internal returns (bool ok) {
        assembly ("memory-safe") {
            let ptr := mload(0x40)
            mstore(ptr, shl(224, 0xa9059cbb)) // transfer(address,uint256)
            mstore(add(ptr, 0x04), and(to, 0xffffffffffffffffffffffffffffffffffffffff))
            mstore(add(ptr, 0x24), amount)
            let success := call(gas(), asset, 0, ptr, 0x44, ptr, 0x20)
            switch returndatasize()
            case 0 { ok := and(success, gt(extcodesize(asset), 0)) }
            default { ok := and(success, and(gt(returndatasize(), 0x1f), eq(mload(ptr), 1))) }
        }
    }
}
