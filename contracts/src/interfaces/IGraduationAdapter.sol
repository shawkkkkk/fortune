// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IGraduationAdapter {
    struct AssetReserve {
        address asset;
        uint256 amount;
        uint16 weightBps;
    }

    /// @notice Called by a Fortune curve after its graduation threshold is reached.
    /// @dev Production adapters must be separately audited for the destination DEX.
    function graduate(
        address launchToken,
        uint256 launchTokenAmount,
        AssetReserve[] calldata reserves,
        bytes calldata data
    ) external;
}
