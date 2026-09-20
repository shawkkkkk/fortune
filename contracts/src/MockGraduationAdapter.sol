// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IGraduationAdapter} from "./interfaces/IGraduationAdapter.sol";

/// @notice Test-only sink used to exercise Fortune graduation.
/// @dev It does not create PancakeSwap pools and MUST NOT be used in production.
contract MockGraduationAdapter is IGraduationAdapter {
    event MockGraduation(
        address indexed caller,
        address indexed launchToken,
        uint256 launchTokenAmount,
        uint256 reserveCount
    );

    function graduate(
        address launchToken,
        uint256 launchTokenAmount,
        AssetReserve[] calldata reserves,
        bytes calldata
    ) external {
        emit MockGraduation(
            msg.sender,
            launchToken,
            launchTokenAmount,
            reserves.length
        );
    }
}
