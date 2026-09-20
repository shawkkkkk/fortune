// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Minimal PancakeSwap/Uniswap-V3-style position-manager surface used by
///         Fortune's permanent liquidity locker.
interface IFortunePositionManager {
    struct CollectParams {
        uint256 tokenId;
        address recipient;
        uint128 amount0Max;
        uint128 amount1Max;
    }

    function ownerOf(uint256 tokenId) external view returns (address);

    function collect(CollectParams calldata params)
        external
        payable
        returns (uint256 amount0, uint256 amount1);
}
