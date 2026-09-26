// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice The PancakeSwap V2 factory calls Fortune custom pairs rely on.
interface IPancakeV2FactoryLike {
    function createPair(address tokenA, address tokenB) external returns (address pair);

    function getPair(address tokenA, address tokenB) external view returns (address pair);
}

/// @notice The PancakeSwap V2 pair calls Fortune custom pairs rely on.
/// @dev `mint` credits the balances the pair holds above its stored reserves,
///      which is what makes V2 compatible with fee-on-transfer tokens.
interface IPancakeV2PairLike {
    function mint(address to) external returns (uint256 liquidity);

    function sync() external;

    function totalSupply() external view returns (uint256);

    function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast);

    function token0() external view returns (address);

    function token1() external view returns (address);
}
