// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {IPancakeV3FactoryLike} from "../interfaces/IPancakeV3FactoryLike.sol";
import {IPancakeV3PoolLike} from "../interfaces/IPancakeV3PoolLike.sol";
import {IPancakeV3PositionManagerLike} from "../interfaces/IPancakeV3PositionManagerLike.sol";

contract MockPancakeV3Pool is IPancakeV3PoolLike {
    uint160 public sqrtPriceX96;
    bool public unlocked = true;

    constructor(uint160 sqrtPriceX96_) {
        sqrtPriceX96 = sqrtPriceX96_;
    }

    function setSqrtPriceX96(uint160 value) external {
        sqrtPriceX96 = value;
    }

    function setUnlocked(bool value) external {
        unlocked = value;
    }

    function slot0()
        external
        view
        returns (
            uint160,
            int24,
            uint16,
            uint16,
            uint16,
            uint32,
            bool
        )
    {
        return (
            sqrtPriceX96,
            0,
            0,
            1,
            1,
            0,
            unlocked
        );
    }
}

contract MockPancakeV3Factory is IPancakeV3FactoryLike {
    mapping(uint24 => int24) public override feeAmountTickSpacing;
    mapping(bytes32 => address) private _pools;

    constructor() {
        feeAmountTickSpacing[100] = 1;
        feeAmountTickSpacing[500] = 10;
        feeAmountTickSpacing[2500] = 50;
        feeAmountTickSpacing[10_000] = 200;
    }

    function _key(
        address tokenA,
        address tokenB,
        uint24 fee
    ) internal pure returns (bytes32) {
        (address token0, address token1) =
            uint160(tokenA) < uint160(tokenB)
                ? (tokenA, tokenB)
                : (tokenB, tokenA);

        return keccak256(
            abi.encode(token0, token1, fee)
        );
    }

    function getPool(
        address tokenA,
        address tokenB,
        uint24 fee
    ) external view returns (address) {
        return _pools[_key(tokenA, tokenB, fee)];
    }

    function setPool(
        address tokenA,
        address tokenB,
        uint24 fee,
        address pool
    ) external {
        _pools[_key(tokenA, tokenB, fee)] = pool;
    }
}

contract MockPancakeV3PositionManager is
    ERC721,
    IPancakeV3PositionManagerLike
{
    using SafeERC20 for IERC20;

    MockPancakeV3Factory public immutable factory;
    uint256 public nextTokenId = 1;

    constructor(address factory_)
        ERC721("Mock Pancake Position", "MPV3")
    {
        factory = MockPancakeV3Factory(factory_);
    }

    function ownerOf(uint256 tokenId)
        public
        view
        override(ERC721, IPancakeV3PositionManagerLike)
        returns (address)
    {
        return super.ownerOf(tokenId);
    }

    function safeTransferFrom(
        address from,
        address to,
        uint256 tokenId
    )
        public
        override(ERC721, IPancakeV3PositionManagerLike)
    {
        super.safeTransferFrom(from, to, tokenId);
    }

    function createAndInitializePoolIfNecessary(
        address token0,
        address token1,
        uint24 fee,
        uint160 sqrtPriceX96
    ) external payable returns (address pool) {
        pool = factory.getPool(
            token0,
            token1,
            fee
        );

        if (pool == address(0)) {
            pool = address(
                new MockPancakeV3Pool(
                    sqrtPriceX96
                )
            );
            factory.setPool(
                token0,
                token1,
                fee,
                pool
            );
        }
    }

    function mint(MintParams calldata params)
        external
        payable
        returns (
            uint256 tokenId,
            uint128 liquidity,
            uint256 amount0,
            uint256 amount1
        )
    {
        require(
            block.timestamp <= params.deadline,
            "EXPIRED"
        );

        amount0 = params.amount0Desired;
        amount1 = params.amount1Desired;

        require(
            amount0 >= params.amount0Min &&
                amount1 >= params.amount1Min,
            "MIN_AMOUNT"
        );

        IERC20(params.token0).safeTransferFrom(
            msg.sender,
            address(this),
            amount0
        );
        IERC20(params.token1).safeTransferFrom(
            msg.sender,
            address(this),
            amount1
        );

        tokenId = nextTokenId++;
        liquidity = 1;
        _mint(params.recipient, tokenId);
    }

    function collect(CollectParams calldata params)
        external
        payable
        returns (uint256 amount0, uint256 amount1)
    {
        require(
            ownerOf(params.tokenId) == msg.sender,
            "NOT_OWNER"
        );
        return (0, 0);
    }
}
