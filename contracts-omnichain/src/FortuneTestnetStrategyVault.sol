// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

interface IStrategyV3Factory {
    function getPool(address tokenA, address tokenB, uint24 fee) external view returns (address);
}

interface IStrategyV3Pool {
    function factory() external view returns (address);
    function token0() external view returns (address);
    function token1() external view returns (address);
    function fee() external view returns (uint24);
}

interface IStrategyV3Router {
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 deadline;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }
    function factory() external view returns (address);
    function exactInputSingle(ExactInputSingleParams calldata params) external payable returns (uint256 amountOut);
}

/// @notice Unaudited testnet-only, operator-owned capital. Not a holder/creator/launch-reserve vault.
/// @dev One pinned V3 pair, no arbitrary calls, native payments, bridging, LP custody or profit allocation.
contract FortuneTestnetStrategyVault is ReentrancyGuard {
    using SafeERC20 for IERC20;

    struct Infrastructure {
        address router;
        address factory;
        address pool;
        bytes32 routerHash;
        bytes32 factoryHash;
        bytes32 poolHash;
        uint24 fee;
    }

    struct AssetConfig {
        address token;
        bytes32 codeHash;
        uint128 maxPerTrade;
        uint128 maxPerWindow;
        uint128 reserveFloor;
    }

    struct SpendWindow {
        uint256 startedAt;
        uint256 spent;
        uint256 first;
        uint256 count;
    }

    struct SpendEntry {
        uint256 at;
        uint256 amount;
    }

    struct Order {
        address tokenIn;
        uint256 amountIn;
        uint256 minAmountOut;
        uint256 deadline;
        uint256 epoch;
        uint256 nonce;
    }

    uint256 public constant Q96 = 1 << 96;
    uint256 public constant SPEND_WINDOW = 1 days;
    uint256 public constant MAX_TRADES_PER_WINDOW = 64;
    uint256 public constant MAX_POLICY_DURATION = 1 hours;
    uint256 public constant MAX_ORDER_DURATION = 2 minutes;
    address public immutable governor;
    address public immutable guardian;
    address public immutable treasury;
    uint256 public immutable deploymentChainId;
    address public immutable asset0;
    address public immutable asset1;
    address public immutable router;
    address public immutable factory;
    address public immutable pool;
    bytes32 public immutable routerHash;
    bytes32 public immutable factoryHash;
    bytes32 public immutable poolHash;
    uint24 public immutable fee;
    mapping(address => AssetConfig) private _assets;
    mapping(address => SpendWindow) public spendWindow;
    mapping(address => mapping(uint256 => SpendEntry)) private _history;
    address public operator;
    bool public paused = true;
    uint256 public authorizationEpoch;
    uint256 public nextNonce;
    uint256 public policyExpiresAt;
    uint128 public rate0X96;
    uint128 public rate1X96;

    error WrongChain();
    error InvalidConfiguration();
    error Unauthorized();
    error MustBePaused();
    error ExecutionPaused();
    error PolicyExpired();
    error InvalidOrder();
    error BudgetExceeded();
    error InsufficientReserve();
    error UntrustedCode();
    error BadFill();
    error AllowanceNotZero();

    event PauseChanged(bool paused, uint256 epoch);
    event OperatorChanged(address operator, uint256 epoch);
    event PricingFloorChanged(uint128 rate0X96, uint128 rate1X96, uint256 expiresAt, uint256 epoch);
    event SwapExecuted(
        uint256 indexed nonce,
        uint256 indexed epoch,
        address indexed tokenIn,
        uint256 amountIn,
        uint256 amountOut,
        uint256 minimumOut
    );
    event TreasuryWithdrawal(address indexed token, uint256 amount);

    modifier onDeploymentChain() {
        if (block.chainid != deploymentChainId) revert WrongChain();
        _;
    }
    modifier onlyGovernor() {
        if (msg.sender != governor) revert Unauthorized();
        _;
    }
    modifier whenPaused() {
        if (!paused) revert MustBePaused();
        _;
    }

    constructor(
        address governor_,
        address guardian_,
        address treasury_,
        Infrastructure memory infra,
        AssetConfig memory a,
        AssetConfig memory b
    ) {
        if (block.chainid != 97 && block.chainid != 84532 && block.chainid != 11155111) {
            revert WrongChain();
        }
        if (
            governor_ == address(0) || guardian_ == address(0) || treasury_ == address(0) || governor_ == guardian_
                || infra.fee == 0 || infra.fee >= 1_000_000
        ) revert InvalidConfiguration();
        address[5] memory roles = [infra.router, infra.factory, infra.pool, a.token, b.token];
        if (governor_ == address(this) || guardian_ == address(this) || treasury_ == address(this)) {
            revert InvalidConfiguration();
        }
        for (uint256 i; i < roles.length; ++i) {
            if (roles[i] == governor_ || roles[i] == guardian_ || roles[i] == treasury_) revert InvalidConfiguration();
            for (uint256 j; j < i; ++j) {
                if (roles[i] == roles[j]) revert InvalidConfiguration();
            }
        }
        _checkAsset(a);
        _checkAsset(b);
        _checkCode(infra.router, infra.routerHash);
        _checkCode(infra.factory, infra.factoryHash);
        _checkCode(infra.pool, infra.poolHash);
        governor = governor_;
        guardian = guardian_;
        treasury = treasury_;
        deploymentChainId = block.chainid;
        asset0 = a.token;
        asset1 = b.token;
        _assets[a.token] = a;
        _assets[b.token] = b;
        router = infra.router;
        factory = infra.factory;
        pool = infra.pool;
        fee = infra.fee;
        routerHash = infra.routerHash;
        factoryHash = infra.factoryHash;
        poolHash = infra.poolHash;
        _checkRoute();
    }

    function assetConfig(address token) external view returns (AssetConfig memory) {
        return _assets[token];
    }

    function setOperator(address next) external onDeploymentChain onlyGovernor whenPaused {
        if (
            next == address(0) || next == address(this) || next == router || next == factory || next == pool
                || next == asset0 || next == asset1
        ) revert InvalidConfiguration();
        operator = next;
        ++authorizationEpoch;
        emit OperatorChanged(next, authorizationEpoch);
    }

    /// @dev Floors are settlement base units per input base unit in Q96, NOT an oracle or fair-price guarantee.
    function setPricingFloor(uint128 aToB, uint128 bToA, uint256 expiresAt)
        external
        onDeploymentChain
        onlyGovernor
        whenPaused
    {
        if (aToB == 0 || bToA == 0 || expiresAt <= block.timestamp || expiresAt > block.timestamp + MAX_POLICY_DURATION)
        {
            revert InvalidConfiguration();
        }
        rate0X96 = aToB;
        rate1X96 = bToA;
        policyExpiresAt = expiresAt;
        ++authorizationEpoch;
        emit PricingFloorChanged(aToB, bToA, expiresAt, authorizationEpoch);
    }

    function unpause() external onDeploymentChain onlyGovernor whenPaused {
        if (operator == address(0) || policyExpiresAt <= block.timestamp) revert PolicyExpired();
        _checkAllCode();
        _checkRoute();
        paused = false;
        ++authorizationEpoch;
        emit PauseChanged(false, authorizationEpoch);
    }

    function pause() external onDeploymentChain {
        if (msg.sender != governor && msg.sender != guardian) revert Unauthorized();
        paused = true;
        ++authorizationEpoch;
        emit PauseChanged(true, authorizationEpoch);
    }

    function revokeOperator() external onDeploymentChain {
        if (msg.sender != governor && msg.sender != guardian) revert Unauthorized();
        operator = address(0);
        paused = true;
        ++authorizationEpoch;
        emit OperatorChanged(address(0), authorizationEpoch);
        emit PauseChanged(true, authorizationEpoch);
    }

    function executeSwap(Order calldata order) external onDeploymentChain nonReentrant returns (uint256 amountOut) {
        if (msg.sender != operator || operator == address(0)) revert Unauthorized();
        if (paused) revert ExecutionPaused();
        if (block.timestamp >= policyExpiresAt) revert PolicyExpired();
        if (
            order.epoch != authorizationEpoch || order.nonce != nextNonce || order.amountIn == 0
                || order.deadline < block.timestamp || order.deadline > block.timestamp + MAX_ORDER_DURATION
                || order.deadline > policyExpiresAt
        ) revert InvalidOrder();
        AssetConfig memory input = _assets[order.tokenIn];
        if (input.token == address(0)) revert InvalidOrder();
        if (order.amountIn > input.maxPerTrade) revert BudgetExceeded();
        address tokenOut = order.tokenIn == asset0 ? asset1 : asset0;
        uint256 rate = order.tokenIn == asset0 ? rate0X96 : rate1X96;
        uint256 minimum = Math.mulDiv(order.amountIn, rate, Q96, Math.Rounding.Ceil);
        if (order.minAmountOut > minimum) minimum = order.minAmountOut;
        _checkAllCode();
        _checkRoute();
        IERC20 from = IERC20(order.tokenIn);
        IERC20 to = IERC20(tokenOut);
        uint256 beforeIn = from.balanceOf(address(this));
        uint256 beforeOut = to.balanceOf(address(this));
        if (beforeIn < order.amountIn + input.reserveFloor) revert InsufficientReserve();
        if (from.allowance(address(this), router) != 0 || to.allowance(address(this), router) != 0) {
            revert AllowanceNotZero();
        }
        _reserveBudget(order.tokenIn, order.amountIn, input.maxPerWindow);
        ++nextNonce;
        from.forceApprove(router, order.amountIn);
        uint256 reported = IStrategyV3Router(router)
            .exactInputSingle(
                IStrategyV3Router.ExactInputSingleParams({
                tokenIn: order.tokenIn,
                tokenOut: tokenOut,
                fee: fee,
                recipient: address(this),
                deadline: order.deadline,
                amountIn: order.amountIn,
                amountOutMinimum: minimum,
                sqrtPriceLimitX96: 0
            })
            );
        from.forceApprove(router, 0);
        uint256 afterIn = from.balanceOf(address(this));
        uint256 afterOut = to.balanceOf(address(this));
        if (afterIn > beforeIn || beforeIn - afterIn != order.amountIn || afterOut < beforeOut) revert BadFill();
        amountOut = afterOut - beforeOut;
        if (amountOut < minimum || reported != amountOut) revert BadFill();
        if (from.allowance(address(this), router) != 0 || to.allowance(address(this), router) != 0) {
            revert AllowanceNotZero();
        }
        emit SwapExecuted(order.nonce, order.epoch, order.tokenIn, order.amountIn, amountOut, minimum);
    }

    /// @notice Governor can recover all reviewed assets to the fixed treasury while paused, including reserve floors.
    function withdrawToTreasury(address token, uint256 amount)
        external
        onDeploymentChain
        onlyGovernor
        whenPaused
        nonReentrant
    {
        if (_assets[token].token == address(0) || amount == 0) revert InvalidOrder();
        _checkCode(token, _assets[token].codeHash);
        IERC20(token).safeTransfer(treasury, amount);
        emit TreasuryWithdrawal(token, amount);
    }

    function _checkAsset(AssetConfig memory a) private view {
        if (a.maxPerTrade == 0 || a.maxPerWindow < a.maxPerTrade) revert InvalidConfiguration();
        _checkCode(a.token, a.codeHash);
    }

    function _reserveBudget(address token, uint256 amount, uint256 cap) private {
        SpendWindow storage window = spendWindow[token];
        while (window.count != 0 && block.timestamp >= _history[token][window.first].at + SPEND_WINDOW) {
            window.spent -= _history[token][window.first].amount;
            delete _history[token][window.first];
            window.first = (window.first + 1) % MAX_TRADES_PER_WINDOW;
            --window.count;
        }
        if (window.count == MAX_TRADES_PER_WINDOW || window.spent + amount > cap) revert BudgetExceeded();
        uint256 index = (window.first + window.count) % MAX_TRADES_PER_WINDOW;
        _history[token][index] = SpendEntry(block.timestamp, amount);
        window.spent += amount;
        ++window.count;
        window.startedAt = _history[token][window.first].at;
    }

    function _checkAllCode() private view {
        _checkCode(router, routerHash);
        _checkCode(factory, factoryHash);
        _checkCode(pool, poolHash);
        _checkCode(asset0, _assets[asset0].codeHash);
        _checkCode(asset1, _assets[asset1].codeHash);
    }

    function _checkCode(address target, bytes32 expected) private view {
        if (target.code.length == 0 || expected == bytes32(0) || target.codehash != expected) revert UntrustedCode();
    }

    function _checkRoute() private view {
        (address a, address b) = asset0 < asset1 ? (asset0, asset1) : (asset1, asset0);
        if (
            IStrategyV3Router(router).factory() != factory
                || IStrategyV3Factory(factory).getPool(asset0, asset1, fee) != pool
                || IStrategyV3Pool(pool).factory() != factory || IStrategyV3Pool(pool).token0() != a
                || IStrategyV3Pool(pool).token1() != b || IStrategyV3Pool(pool).fee() != fee
        ) revert InvalidConfiguration();
    }
}
