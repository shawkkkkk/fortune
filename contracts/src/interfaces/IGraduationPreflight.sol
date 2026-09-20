// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IGraduationAdapter} from "./IGraduationAdapter.sol";

/// @notice Optional-but-required-by-Fortune production preflight for graduation adapters.
/// @dev The same reserve snapshot passed to graduate() is validated before any
///      FortuneCurve funds leave the curve. Adapter implementations should check
///      pool compatibility, destination configuration, deadlines, slippage bounds,
///      duplicate pools and any venue-specific prerequisites.
interface IGraduationPreflight {
    function preflight(
        address launchToken,
        uint256 launchTokenAmount,
        IGraduationAdapter.AssetReserve[] calldata reserves,
        bytes calldata data
    ) external view returns (bool ready, bytes32 reasonCode);
}
