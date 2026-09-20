// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IGraduationAdapter} from "./interfaces/IGraduationAdapter.sol";
import {IGraduationPreflight} from "./interfaces/IGraduationPreflight.sol";

/// @notice Test-only sink used to exercise Fortune graduation.
/// @dev It does not create PancakeSwap pools and MUST NOT be used in production.
contract MockGraduationAdapter is IGraduationAdapter, IGraduationPreflight {
    bool public ready = true;
    bytes32 public reasonCode = bytes32("OK");
    bool public revertOnGraduate;

    event MockGraduation(
        address indexed caller,
        address indexed launchToken,
        uint256 launchTokenAmount,
        uint256 reserveCount
    );

    function setPreflight(
        bool ready_,
        bytes32 reasonCode_
    ) external {
        ready = ready_;
        reasonCode = reasonCode_;
    }

    function setRevertOnGraduate(bool value) external {
        revertOnGraduate = value;
    }

    function preflight(
        address,
        uint256 launchTokenAmount,
        AssetReserve[] calldata reserves,
        bytes calldata
    ) external view returns (bool, bytes32) {
        if (!ready) return (false, reasonCode);
        if (launchTokenAmount == 0) return (false, bytes32("NO_LAUNCH_TOKEN"));
        if (reserves.length == 0) return (false, bytes32("NO_RESERVES"));

        for (uint256 i; i < reserves.length; ++i) {
            if (reserves[i].asset == address(0)) {
                return (false, bytes32("ZERO_ASSET"));
            }
            if (reserves[i].amount == 0) {
                return (false, bytes32("EMPTY_RESERVE"));
            }
        }

        return (true, bytes32("OK"));
    }

    function graduate(
        address launchToken,
        uint256 launchTokenAmount,
        AssetReserve[] calldata reserves,
        bytes calldata
    ) external {
        require(!revertOnGraduate, "MOCK_GRADUATION_REVERT");

        emit MockGraduation(
            msg.sender,
            launchToken,
            launchTokenAmount,
            reserves.length
        );
    }
}
