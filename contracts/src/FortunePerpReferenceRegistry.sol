// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

import {IFortuneReferenceOracle} from "./interfaces/IFortuneReferenceOracle.sol";

/// @notice Registry for experimental external-perp reference markets.
/// @dev This registry does not custody or trade a perp position. It only
///      validates a BNB-chain price reference supplied by an approved oracle.
contract FortunePerpReferenceRegistry is Ownable2Step {
    struct MarketConfig {
        address oracle;
        uint32 maxOracleAge;
        uint16 maxMultiplierBps;
        uint16 lowDepthBps;
        bool active;
        string venue;
        string symbol;
    }

    mapping(bytes32 => MarketConfig) private _markets;
    bytes32[] public marketKeys;

    event MarketConfigured(
        bytes32 indexed marketKey,
        address indexed oracle,
        bool active,
        string venue,
        string symbol
    );

    constructor(address initialOwner) Ownable(initialOwner) {}

    function configureMarket(
        bytes32 marketKey,
        MarketConfig calldata config
    ) external onlyOwner {
        require(marketKey != bytes32(0), "ZERO_KEY");
        require(config.oracle != address(0), "ZERO_ORACLE");
        require(config.maxOracleAge >= 5, "ORACLE_AGE_TOO_LOW");
        require(
            config.maxMultiplierBps >= 10_000 &&
                config.maxMultiplierBps <= 30_000,
            "BAD_MULTIPLIER_CAP"
        );
        require(
            config.lowDepthBps > 0 && config.lowDepthBps <= 10_000,
            "BAD_DEPTH"
        );

        if (_markets[marketKey].oracle == address(0)) {
            marketKeys.push(marketKey);
        }

        _markets[marketKey] = config;

        emit MarketConfigured(
            marketKey,
            config.oracle,
            config.active,
            config.venue,
            config.symbol
        );
    }

    function marketConfig(bytes32 marketKey)
        external
        view
        returns (MarketConfig memory)
    {
        return _markets[marketKey];
    }

    function referencePrice(
        bytes32 marketKey,
        uint16 multiplierBps
    ) external view returns (uint256 adjustedPriceUsd1e18) {
        MarketConfig memory config = _markets[marketKey];
        require(config.active, "MARKET_DISABLED");
        require(
            multiplierBps >= 10_000 &&
                multiplierBps <= config.maxMultiplierBps,
            "MULTIPLIER_NOT_ALLOWED"
        );

        (uint256 price, uint256 updatedAt) =
            IFortuneReferenceOracle(config.oracle)
                .referencePrice(marketKey);

        require(price > 0, "BAD_PRICE");
        require(
            block.timestamp - updatedAt <= config.maxOracleAge,
            "STALE_REFERENCE"
        );

        return price * multiplierBps / 10_000;
    }

    function marketCount() external view returns (uint256) {
        return marketKeys.length;
    }
}
