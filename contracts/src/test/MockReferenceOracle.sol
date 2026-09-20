// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IFortuneReferenceOracle} from "../interfaces/IFortuneReferenceOracle.sol";

contract MockReferenceOracle is IFortuneReferenceOracle {
    struct Reading {
        uint256 price;
        uint256 updatedAt;
    }

    mapping(bytes32 => Reading) public readings;

    function setPrice(bytes32 marketKey, uint256 priceUsd1e18) external {
        readings[marketKey] = Reading({
            price: priceUsd1e18,
            updatedAt: block.timestamp
        });
    }

    function referencePrice(bytes32 marketKey)
        external
        view
        returns (uint256 priceUsd1e18, uint256 updatedAt)
    {
        Reading memory reading = readings[marketKey];
        return (reading.price, reading.updatedAt);
    }
}
