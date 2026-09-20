// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IFortuneAutomationAdapter {
    /// @notice Called by a FortuneAutomationVault after funds have been transferred.
    /// @dev Adapter implementations must validate all execution-specific data.
    function execute(
        uint8 purpose,
        address launchToken,
        address inputAsset,
        uint256 amount,
        bytes calldata data
    ) external;
}
