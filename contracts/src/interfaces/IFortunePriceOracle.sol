// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IFortunePriceOracle {
    /// @notice Returns USD price scaled to 1e18 and the timestamp of the observation.
    function priceUsd(address asset) external view returns (uint256 price, uint256 updatedAt);
}
