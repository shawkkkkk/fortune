// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {IFortunePriceOracle} from "fortune/interfaces/IFortunePriceOracle.sol";

/// @notice BSC Testnet price source for Fortune test stocks: the owner sets a
///         USD price per asset, reported as always fresh. Never use with real
///         assets. Refuses to deploy on BSC mainnet.
contract FortuneTestStockOracle is IFortunePriceOracle, Ownable2Step {
    mapping(address asset => uint256) public prices;

    event PriceSet(address indexed asset, uint256 priceUsd1e18);

    constructor(address initialOwner) Ownable(initialOwner) {
        require(block.chainid != 56, "TESTNET_ONLY");
    }

    function setPrices(address[] calldata assets, uint256[] calldata pricesUsd1e18) external onlyOwner {
        require(assets.length == pricesUsd1e18.length, "LENGTH");
        for (uint256 i; i < assets.length; ++i) {
            require(assets[i] != address(0) && pricesUsd1e18[i] > 0, "BAD_PRICE");
            prices[assets[i]] = pricesUsd1e18[i];
            emit PriceSet(assets[i], pricesUsd1e18[i]);
        }
    }

    function priceUsd(address asset) external view returns (uint256 price, uint256 updatedAt) {
        price = prices[asset];
        require(price > 0, "NO_PRICE");
        updatedAt = block.timestamp;
    }
}
