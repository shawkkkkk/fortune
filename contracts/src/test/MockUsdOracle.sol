// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IFortunePriceOracle} from "../interfaces/IFortunePriceOracle.sol";

/// @notice Testnet-only mutable USD oracle. Never use in production.
contract MockUsdOracle is IFortunePriceOracle {
    address public immutable admin;
    mapping(address => uint256) public prices;

    constructor(address admin_) {
        require(admin_ != address(0), "ZERO_ADMIN");
        admin = admin_;
    }

    function setPrice(address asset, uint256 price1e18) external {
        require(msg.sender == admin, "ONLY_ADMIN");
        require(price1e18 > 0, "ZERO_PRICE");
        prices[asset] = price1e18;
    }

    function priceUsd(address asset) external view returns (uint256 price, uint256 updatedAt) {
        price = prices[asset];
        require(price > 0, "NO_PRICE");
        updatedAt = block.timestamp;
    }
}
