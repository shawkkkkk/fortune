// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Oracle interface for external reference markets such as a perp venue.
/// @dev Production implementations must bridge/attest prices to BNB Chain;
///      Solidity cannot trust a REST API directly.
interface IFortuneReferenceOracle {
    function referencePrice(bytes32 marketKey)
        external
        view
        returns (uint256 priceUsd1e18, uint256 updatedAt);
}
