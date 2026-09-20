// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IFortunePriceOracle} from "./interfaces/IFortunePriceOracle.sol";

interface IAggregatorV3 {
    function decimals() external view returns (uint8);
    function latestRoundData()
        external
        view
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        );
}

/// @notice Registry-controlled mapping from BSC assets to external USD feeds.
/// @dev No feed addresses are hardcoded; each deployment must verify current official feeds.
contract FortuneChainlinkOracle is IFortunePriceOracle, Ownable2Step {
    mapping(address => address) public feedFor;

    event FeedSet(address indexed asset, address indexed feed);

    constructor(address initialOwner) Ownable(initialOwner) {}

    function setFeed(address asset, address feed) external onlyOwner {
        require(asset != address(0) && feed != address(0), "ZERO_ADDRESS");
        feedFor[asset] = feed;
        emit FeedSet(asset, feed);
    }

    function priceUsd(address asset) external view returns (uint256 price, uint256 updatedAt) {
        address feed = feedFor[asset];
        require(feed != address(0), "NO_FEED");

        (, int256 answer,, uint256 timestamp,) = IAggregatorV3(feed).latestRoundData();
        require(answer > 0, "BAD_ANSWER");

        uint8 decimals = IAggregatorV3(feed).decimals();
        price = uint256(answer) * 1e18 / (10 ** uint256(decimals));
        updatedAt = timestamp;
    }
}
