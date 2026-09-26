// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

/// @notice Minimal constant-product pair with PancakeSwap V2 semantics that
///         matter here: balance-based mint/swap (fee-on-transfer safe), a
///         1000-unit minimum liquidity lock, uint112 reserves, sync and skim,
///         and a 0.25% swap fee. Test-only; the fork suite uses real Pancake V2.
contract MockPancakeV2Pair {
    using SafeERC20 for IERC20;

    uint256 public constant MINIMUM_LIQUIDITY = 1_000;

    address public immutable factory;
    address public token0;
    address public token1;

    uint112 private _reserve0;
    uint112 private _reserve1;
    uint32 private _blockTimestampLast;

    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    bool private _locked;

    event Mint(address indexed sender, uint256 amount0, uint256 amount1);
    event Swap(address indexed sender, uint256 amount0In, uint256 amount1In, uint256 amount0Out, uint256 amount1Out, address indexed to);

    modifier lock() {
        require(!_locked, "Pancake: LOCKED");
        _locked = true;
        _;
        _locked = false;
    }

    constructor() {
        factory = msg.sender;
    }

    function initialize(address token0_, address token1_) external {
        require(msg.sender == factory, "Pancake: FORBIDDEN");
        token0 = token0_;
        token1 = token1_;
    }

    function getReserves() public view returns (uint112, uint112, uint32) {
        return (_reserve0, _reserve1, _blockTimestampLast);
    }

    function _update(uint256 balance0, uint256 balance1) private {
        require(balance0 <= type(uint112).max && balance1 <= type(uint112).max, "Pancake: OVERFLOW");
        _reserve0 = uint112(balance0);
        _reserve1 = uint112(balance1);
        _blockTimestampLast = uint32(block.timestamp);
    }

    function mint(address to) external lock returns (uint256 liquidity) {
        uint256 balance0 = IERC20(token0).balanceOf(address(this));
        uint256 balance1 = IERC20(token1).balanceOf(address(this));
        uint256 amount0 = balance0 - _reserve0;
        uint256 amount1 = balance1 - _reserve1;
        if (totalSupply == 0) {
            liquidity = Math.sqrt(amount0 * amount1) - MINIMUM_LIQUIDITY;
            _mintLp(address(0), MINIMUM_LIQUIDITY);
        } else {
            liquidity = Math.min(amount0 * totalSupply / _reserve0, amount1 * totalSupply / _reserve1);
        }
        require(liquidity > 0, "Pancake: INSUFFICIENT_LIQUIDITY_MINTED");
        _mintLp(to, liquidity);
        _update(balance0, balance1);
        emit Mint(msg.sender, amount0, amount1);
    }

    function swap(uint256 amount0Out, uint256 amount1Out, address to, bytes calldata) external lock {
        require(amount0Out > 0 || amount1Out > 0, "Pancake: INSUFFICIENT_OUTPUT_AMOUNT");
        (uint112 reserve0, uint112 reserve1,) = getReserves();
        require(amount0Out < reserve0 && amount1Out < reserve1, "Pancake: INSUFFICIENT_LIQUIDITY");
        require(to != token0 && to != token1, "Pancake: INVALID_TO");
        if (amount0Out > 0) IERC20(token0).safeTransfer(to, amount0Out);
        if (amount1Out > 0) IERC20(token1).safeTransfer(to, amount1Out);
        uint256 balance0 = IERC20(token0).balanceOf(address(this));
        uint256 balance1 = IERC20(token1).balanceOf(address(this));
        uint256 amount0In = balance0 > reserve0 - amount0Out ? balance0 - (reserve0 - amount0Out) : 0;
        uint256 amount1In = balance1 > reserve1 - amount1Out ? balance1 - (reserve1 - amount1Out) : 0;
        require(amount0In > 0 || amount1In > 0, "Pancake: INSUFFICIENT_INPUT_AMOUNT");
        uint256 adjusted0 = balance0 * 10_000 - amount0In * 25;
        uint256 adjusted1 = balance1 * 10_000 - amount1In * 25;
        require(adjusted0 * adjusted1 >= uint256(reserve0) * reserve1 * 1e8, "Pancake: K");
        _update(balance0, balance1);
        emit Swap(msg.sender, amount0In, amount1In, amount0Out, amount1Out, to);
    }

    function skim(address to) external lock {
        IERC20(token0).safeTransfer(to, IERC20(token0).balanceOf(address(this)) - _reserve0);
        IERC20(token1).safeTransfer(to, IERC20(token1).balanceOf(address(this)) - _reserve1);
    }

    function sync() external lock {
        _update(IERC20(token0).balanceOf(address(this)), IERC20(token1).balanceOf(address(this)));
    }

    function _mintLp(address to, uint256 amount) private {
        totalSupply += amount;
        balanceOf[to] += amount;
    }
}

contract MockPancakeV2Factory {
    mapping(address => mapping(address => address)) public getPair;
    address[] public allPairs;

    function createPair(address tokenA, address tokenB) external returns (address pair) {
        require(tokenA != tokenB, "Pancake: IDENTICAL_ADDRESSES");
        (address token0, address token1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
        require(token0 != address(0), "Pancake: ZERO_ADDRESS");
        require(getPair[token0][token1] == address(0), "Pancake: PAIR_EXISTS");
        MockPancakeV2Pair created = new MockPancakeV2Pair{salt: keccak256(abi.encodePacked(token0, token1))}();
        created.initialize(token0, token1);
        pair = address(created);
        getPair[token0][token1] = pair;
        getPair[token1][token0] = pair;
        allPairs.push(pair);
    }

    function allPairsLength() external view returns (uint256) {
        return allPairs.length;
    }
}

/// @notice Swap helper equivalent to the V2 router's *SupportingFeeOnTransferTokens
///         path for one hop: send input first, then price from balances.
library PairSwap {
    using SafeERC20 for IERC20;

    function swapExactIn(MockPancakeV2PairLike pair, address tokenIn, uint256 amountIn, address to)
        internal
        returns (uint256 amountOut)
    {
        IERC20(tokenIn).safeTransfer(address(pair), amountIn);
        (uint112 reserve0, uint112 reserve1,) = pair.getReserves();
        bool zeroForOne = tokenIn == pair.token0();
        (uint256 reserveIn, uint256 reserveOut) = zeroForOne ? (uint256(reserve0), uint256(reserve1)) : (uint256(reserve1), uint256(reserve0));
        uint256 actualIn = IERC20(tokenIn).balanceOf(address(pair)) - reserveIn;
        uint256 inWithFee = actualIn * 9_975;
        amountOut = inWithFee * reserveOut / (reserveIn * 10_000 + inWithFee);
        (uint256 out0, uint256 out1) = zeroForOne ? (uint256(0), amountOut) : (amountOut, uint256(0));
        pair.swap(out0, out1, to, "");
    }
}

interface MockPancakeV2PairLike {
    function getReserves() external view returns (uint112, uint112, uint32);
    function token0() external view returns (address);
    function swap(uint256 amount0Out, uint256 amount1Out, address to, bytes calldata data) external;
}
