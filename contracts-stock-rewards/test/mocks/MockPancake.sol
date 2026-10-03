// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @notice PancakeSwap V3 pool stand-in that really holds its liquidity, so
///         launch tokens land in the pool address as they do on chain.
contract MockV3Pool {
    using SafeERC20 for IERC20;

    address public immutable factory;
    address public immutable token0;
    address public immutable token1;
    uint24 public immutable fee;
    address public immutable manager;
    uint160 public sqrtPriceX96;

    constructor(address token0_, address token1_, uint24 fee_, address manager_) {
        factory = msg.sender;
        token0 = token0_;
        token1 = token1_;
        fee = fee_;
        manager = manager_;
    }

    function initialize(uint160 price) external {
        require(sqrtPriceX96 == 0, "INITIALIZED");
        sqrtPriceX96 = price;
    }

    function slot0() external view returns (uint160, int24, uint16, uint16, uint16, uint32, bool) {
        return (sqrtPriceX96, 0, 0, 1, 1, 0, true);
    }

    /// Position-manager only: pays out collected fees.
    function pay(address token, address to, uint256 amount) external {
        require(msg.sender == manager, "ONLY_MANAGER");
        if (amount > 0) IERC20(token).safeTransfer(to, amount);
    }
}

contract MockV3Factory {
    mapping(uint24 => int24) public feeAmountTickSpacing;
    mapping(address => mapping(address => mapping(uint24 => address))) internal _pools;

    constructor() {
        feeAmountTickSpacing[100] = 1;
        feeAmountTickSpacing[500] = 10;
        feeAmountTickSpacing[2500] = 50;
        feeAmountTickSpacing[10_000] = 200;
    }

    function getPool(address tokenA, address tokenB, uint24 fee) external view returns (address) {
        return _pools[tokenA][tokenB][fee];
    }

    function createPool(address tokenA, address tokenB, uint24 fee, address manager) public returns (address pool) {
        require(tokenA != tokenB && feeAmountTickSpacing[fee] > 0, "BAD_POOL");
        (address token0, address token1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
        require(_pools[token0][token1][fee] == address(0), "EXISTS");
        pool = address(new MockV3Pool(token0, token1, fee, manager));
        _pools[token0][token1][fee] = pool;
        _pools[token1][token0][fee] = pool;
    }
}

/// @notice Position manager stand-in: `mint` moves the tokens from the caller
///         into the pool, `collect` pays fees the test credited with `addFees`.
///         `useBps` below 10,000 leaves dust with the caller, as a real mint
///         does when the price ratio is not exact.
contract MockV3PositionManager is ERC721 {
    using SafeERC20 for IERC20;

    struct MintParams {
        address token0;
        address token1;
        uint24 fee;
        int24 tickLower;
        int24 tickUpper;
        uint256 amount0Desired;
        uint256 amount1Desired;
        uint256 amount0Min;
        uint256 amount1Min;
        address recipient;
        uint256 deadline;
    }

    struct CollectParams {
        uint256 tokenId;
        address recipient;
        uint128 amount0Max;
        uint128 amount1Max;
    }

    struct Position {
        address pool;
        uint256 fees0;
        uint256 fees1;
    }

    MockV3Factory public immutable factory;
    uint256 public nextTokenId = 1;
    uint16 public useBps = 10_000;
    mapping(uint256 => Position) public positions;

    constructor(MockV3Factory factory_) ERC721("Mock Pancake V3 Position", "MPV3") {
        factory = factory_;
    }

    function setUseBps(uint16 value) external {
        useBps = value;
    }

    function createAndInitializePoolIfNecessary(address token0, address token1, uint24 fee, uint160 sqrtPriceX96)
        external
        payable
        returns (address pool)
    {
        pool = factory.getPool(token0, token1, fee);
        if (pool == address(0)) pool = factory.createPool(token0, token1, fee, address(this));
        if (MockV3Pool(pool).sqrtPriceX96() == 0) MockV3Pool(pool).initialize(sqrtPriceX96);
    }

    function mint(MintParams calldata p)
        external
        payable
        returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1)
    {
        require(block.timestamp <= p.deadline, "EXPIRED");
        address pool = factory.getPool(p.token0, p.token1, p.fee);
        require(pool != address(0), "NO_POOL");
        amount0 = p.amount0Desired * useBps / 10_000;
        amount1 = p.amount1Desired * useBps / 10_000;
        require(amount0 >= p.amount0Min && amount1 >= p.amount1Min, "PRICE_SLIPPAGE");
        IERC20(p.token0).safeTransferFrom(msg.sender, pool, amount0);
        IERC20(p.token1).safeTransferFrom(msg.sender, pool, amount1);
        tokenId = nextTokenId++;
        liquidity = 1;
        positions[tokenId].pool = pool;
        _mint(p.recipient, tokenId);
    }

    /// Test helper: credits fees the pool already holds to a position.
    function addFees(uint256 tokenId, uint256 fees0, uint256 fees1) external {
        positions[tokenId].fees0 += fees0;
        positions[tokenId].fees1 += fees1;
    }

    function collect(CollectParams calldata p) external payable returns (uint256 amount0, uint256 amount1) {
        require(_isAuthorized(ownerOf(p.tokenId), msg.sender, p.tokenId), "NOT_APPROVED");
        Position storage position = positions[p.tokenId];
        amount0 = position.fees0 < p.amount0Max ? position.fees0 : p.amount0Max;
        amount1 = position.fees1 < p.amount1Max ? position.fees1 : p.amount1Max;
        position.fees0 -= amount0;
        position.fees1 -= amount1;
        MockV3Pool pool = MockV3Pool(position.pool);
        pool.pay(pool.token0(), p.recipient, amount0);
        pool.pay(pool.token1(), p.recipient, amount1);
    }
}

/// @notice Minimal PancakeSwap V2 factory and pair: enough for `excludePool`.
contract MockV2Pair {
    address public immutable factory;
    address public immutable token0;
    address public immutable token1;

    constructor(address token0_, address token1_) {
        factory = msg.sender;
        token0 = token0_;
        token1 = token1_;
    }
}

contract MockV2Factory {
    mapping(address => mapping(address => address)) public getPair;

    function createPair(address tokenA, address tokenB) external returns (address pair) {
        (address token0, address token1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
        require(getPair[token0][token1] == address(0), "EXISTS");
        pair = address(new MockV2Pair(token0, token1));
        getPair[token0][token1] = pair;
        getPair[token1][token0] = pair;
    }
}

/// @notice Claims to be a pool for any pair and fee, but is not registered with any factory.
contract FakePool {
    address public token0;
    address public token1;
    uint24 public fee;

    constructor(address token0_, address token1_, uint24 fee_) {
        token0 = token0_;
        token1 = token1_;
        fee = fee_;
    }
}
