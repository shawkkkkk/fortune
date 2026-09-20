// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {IFortunePriceOracle} from "./interfaces/IFortunePriceOracle.sol";

/// @notice Curated compatibility registry for assets usable by Fortune.
/// @dev A registry entry is a capability grant, not an endorsement of an asset's economics.
contract FortuneAssetRegistry is Ownable2Step {
    struct AssetConfig {
        address oracle;
        uint32 maxOracleAge;
        bool quoteEnabled;
        bool rewardEnabled;
        bool graduationEnabled;
        bool active;
        string category;
    }

    mapping(address => AssetConfig) private _assets;
    mapping(address => uint8) public registeredDecimals;
    address[] public allAssets;

    event AssetConfigured(
        address indexed asset,
        address indexed oracle,
        bool quoteEnabled,
        bool rewardEnabled,
        bool graduationEnabled,
        bool active,
        string category,
        uint8 decimals
    );

    constructor(address initialOwner) Ownable(initialOwner) {}

    function configureAsset(address asset, AssetConfig calldata config) external onlyOwner {
        require(asset != address(0), "ZERO_ASSET");
        require(config.oracle != address(0), "ZERO_ORACLE");
        require(config.maxOracleAge >= 60, "ORACLE_AGE_TOO_LOW");

        uint8 decimals = IERC20Metadata(asset).decimals();
        require(decimals <= 36, "UNSUPPORTED_DECIMALS");

        if (_assets[asset].oracle == address(0)) {
            allAssets.push(asset);
        }

        _assets[asset] = config;
        registeredDecimals[asset] = decimals;
        emit AssetConfigured(
            asset,
            config.oracle,
            config.quoteEnabled,
            config.rewardEnabled,
            config.graduationEnabled,
            config.active,
            config.category,
            decimals
        );
    }

    function assetConfig(address asset) external view returns (AssetConfig memory) {
        return _assets[asset];
    }

    function isQuoteAsset(address asset) external view returns (bool) {
        AssetConfig memory config = _assets[asset];
        return config.active && config.quoteEnabled;
    }

    function isRewardAsset(address asset) external view returns (bool) {
        AssetConfig memory config = _assets[asset];
        return config.active && config.rewardEnabled;
    }

    function isGraduationAsset(address asset) external view returns (bool) {
        AssetConfig memory config = _assets[asset];
        return config.active && config.graduationEnabled;
    }

    /// @notice Non-reverting health probe used before a launch is allowed to exist.
    /// @dev Runtime transfers still require exact balance accounting inside FortuneCurve.
    function assetHealth(address asset)
        external
        view
        returns (
            bool healthy,
            bytes32 reasonCode,
            uint256 priceUsd1e18,
            uint256 updatedAt
        )
    {
        AssetConfig memory config = _assets[asset];

        if (!config.active) {
            return (false, bytes32("ASSET_DISABLED"), 0, 0);
        }
        if (!config.quoteEnabled) {
            return (false, bytes32("QUOTE_DISABLED"), 0, 0);
        }
        if (!config.graduationEnabled) {
            return (false, bytes32("GRADUATION_DISABLED"), 0, 0);
        }

        try IERC20Metadata(asset).decimals() returns (uint8 decimals) {
            if (decimals > 36) {
                return (false, bytes32("UNSUPPORTED_DECIMALS"), 0, 0);
            }
            if (decimals != registeredDecimals[asset]) {
                return (false, bytes32("DECIMALS_CHANGED"), 0, 0);
            }
        } catch {
            return (false, bytes32("DECIMALS_UNREADABLE"), 0, 0);
        }

        try IFortunePriceOracle(config.oracle).priceUsd(asset)
            returns (uint256 price, uint256 timestamp)
        {
            if (price == 0) {
                return (false, bytes32("BAD_PRICE"), price, timestamp);
            }
            if (timestamp == 0 || timestamp > block.timestamp) {
                return (false, bytes32("BAD_TIMESTAMP"), price, timestamp);
            }
            if (block.timestamp - timestamp > config.maxOracleAge) {
                return (false, bytes32("STALE_PRICE"), price, timestamp);
            }

            return (true, bytes32("OK"), price, timestamp);
        } catch {
            return (false, bytes32("ORACLE_REVERT"), 0, 0);
        }
    }

    function usdValue(address asset, uint256 amount) public view returns (uint256 value1e18) {
        AssetConfig memory config = _assets[asset];
        require(config.active, "ASSET_DISABLED");

        (uint256 price, uint256 updatedAt) = IFortunePriceOracle(config.oracle).priceUsd(asset);
        require(price > 0, "BAD_PRICE");
        require(updatedAt > 0 && updatedAt <= block.timestamp, "BAD_TIMESTAMP");
        require(block.timestamp - updatedAt <= config.maxOracleAge, "STALE_PRICE");

        uint8 decimals = IERC20Metadata(asset).decimals();
        require(
            decimals == registeredDecimals[asset],
            "ASSET_DECIMALS_CHANGED"
        );
        return amount * price / (10 ** uint256(decimals));
    }

    function tokenAmountForUsd(address asset, uint256 usd1e18) external view returns (uint256 amount) {
        AssetConfig memory config = _assets[asset];
        require(config.active, "ASSET_DISABLED");

        (uint256 price, uint256 updatedAt) = IFortunePriceOracle(config.oracle).priceUsd(asset);
        require(price > 0, "BAD_PRICE");
        require(updatedAt > 0 && updatedAt <= block.timestamp, "BAD_TIMESTAMP");
        require(block.timestamp - updatedAt <= config.maxOracleAge, "STALE_PRICE");

        uint8 decimals = IERC20Metadata(asset).decimals();
        require(
            decimals == registeredDecimals[asset],
            "ASSET_DECIMALS_CHANGED"
        );
        return usd1e18 * (10 ** uint256(decimals)) / price;
    }

    function assetCount() external view returns (uint256) {
        return allAssets.length;
    }
}
