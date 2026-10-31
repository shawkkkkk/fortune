// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IStrategyV3Factory, IStrategyV3Pool} from "./FortuneTestnetStrategyVault.sol";

interface ICustodyPositionManager {
    function factory() external view returns (address);
    function ownerOf(uint256 id) external view returns (address);
    function getApproved(uint256 id) external view returns (address);
    function transferFrom(address from, address to, uint256 id) external;
    function positions(uint256 id)
        external
        view
        returns (uint96, address, address, address, uint24, int24, int24, uint128, uint256, uint256, uint128, uint128);
}

/// @notice Unaudited, single-position chain97 custody primitive, not a liquidity manager or fee processor.
/// @dev Governor supplies operator-owned capital; code checks do not prove legitimate funding or safe proxies.
contract FortuneTestnetPositionCustody is ReentrancyGuard {
    struct Pin {
        address target;
        bytes32 codeHash;
    }

    struct Policy {
        Pin manager;
        Pin factory;
        Pin pool;
        Pin token0;
        Pin token1;
        uint256 positionId;
        uint24 fee;
        int24 tickLower;
        int24 tickUpper;
        uint128 expectedLiquidity;
    }
    address public immutable governor;
    address public immutable guardian;
    address public immutable treasury;
    // Assigned only in the constructor. No policy setter or arbitrary call/delegatecall exists.
    Policy private _policy;
    bool public paused = true;
    bool public held;
    bool public released;
    error WrongChain();
    error Unauthorized();
    error InvalidPolicy();
    error UntrustedPosition();
    error WrongState();
    event PauseChanged(bool paused);
    event PositionDeposited(uint256 indexed positionId, address indexed from);
    event PositionReleased(uint256 indexed positionId, address indexed treasury);

    constructor(address governor_, address guardian_, address treasury_, Policy memory p) {
        if (block.chainid != 97) revert WrongChain();
        if (
            governor_ == address(0) || guardian_ == address(0) || treasury_ == address(0) || governor_ == guardian_
                || governor_ == address(this) || guardian_ == address(this) || treasury_ == address(this)
                || p.positionId == 0 || p.expectedLiquidity == 0 || p.fee == 0 || p.fee >= 1_000_000
                || p.tickLower >= p.tickUpper || p.token0.target >= p.token1.target
        ) revert InvalidPolicy();
        address[5] memory targets =
            [p.manager.target, p.factory.target, p.pool.target, p.token0.target, p.token1.target];
        for (uint256 i; i < targets.length; ++i) {
            if (targets[i] == governor_ || targets[i] == guardian_ || targets[i] == treasury_) revert InvalidPolicy();
            for (uint256 j; j < i; ++j) {
                if (targets[i] == targets[j]) revert InvalidPolicy();
            }
        }
        governor = governor_;
        guardian = guardian_;
        treasury = treasury_;
        _policy = p;
        _verify();
        if (ICustodyPositionManager(p.manager.target).ownerOf(p.positionId) != governor_) revert UntrustedPosition();
    }
    modifier chain97() {
        if (block.chainid != 97) revert WrongChain();
        _;
    }

    function policy() external view returns (Policy memory) {
        return _policy;
    }

    function setPaused(bool value) external chain97 nonReentrant {
        if (msg.sender != governor && (msg.sender != guardian || !value)) revert Unauthorized();
        if (!value) _verify();
        paused = value;
        emit PauseChanged(value);
    }

    function deposit() external chain97 nonReentrant {
        if (msg.sender != governor) revert Unauthorized();
        if (paused || held || released) revert WrongState();
        _verify();
        ICustodyPositionManager manager = ICustodyPositionManager(_policy.manager.target);
        if (manager.ownerOf(_policy.positionId) != governor) revert UntrustedPosition();
        held = true;
        manager.transferFrom(governor, address(this), _policy.positionId);
        _verify();
        if (
            manager.ownerOf(_policy.positionId) != address(this)
                || manager.getApproved(_policy.positionId) != address(0)
        ) revert UntrustedPosition();
        emit PositionDeposited(_policy.positionId, governor);
    }

    function releaseToTreasury() external chain97 nonReentrant {
        if (msg.sender != governor) revert Unauthorized();
        if (!paused || !held || released) revert WrongState();
        _verify();
        ICustodyPositionManager manager = ICustodyPositionManager(_policy.manager.target);
        if (
            manager.ownerOf(_policy.positionId) != address(this)
                || manager.getApproved(_policy.positionId) != address(0)
        ) revert UntrustedPosition();
        held = false;
        released = true;
        manager.transferFrom(address(this), treasury, _policy.positionId);
        _verify();
        if (manager.ownerOf(_policy.positionId) != treasury || manager.getApproved(_policy.positionId) != address(0)) {
            revert UntrustedPosition();
        }
        emit PositionReleased(_policy.positionId, treasury);
    }

    function _pin(Pin memory p) private view {
        if (p.target.code.length == 0 || p.codeHash == bytes32(0) || p.target.codehash != p.codeHash) {
            revert UntrustedPosition();
        }
    }

    function _verify() private view {
        Policy memory p = _policy;
        _pin(p.manager);
        _pin(p.factory);
        _pin(p.pool);
        _pin(p.token0);
        _pin(p.token1);
        if (
            ICustodyPositionManager(p.manager.target).factory() != p.factory.target
                || IStrategyV3Factory(p.factory.target).getPool(p.token0.target, p.token1.target, p.fee)
                    != p.pool.target || IStrategyV3Pool(p.pool.target).factory() != p.factory.target
                || IStrategyV3Pool(p.pool.target).token0() != p.token0.target
                || IStrategyV3Pool(p.pool.target).token1() != p.token1.target
                || IStrategyV3Pool(p.pool.target).fee() != p.fee
        ) revert UntrustedPosition();
        (,, address a, address b, uint24 fee_, int24 lower, int24 upper, uint128 liquidity,,,,) =
            ICustodyPositionManager(p.manager.target).positions(p.positionId);
        if (
            a != p.token0.target || b != p.token1.target || fee_ != p.fee || lower != p.tickLower
                || upper != p.tickUpper || liquidity != p.expectedLiquidity
        ) revert UntrustedPosition();
    }
}
