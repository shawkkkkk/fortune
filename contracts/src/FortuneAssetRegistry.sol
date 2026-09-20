// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable2Step, Ownable} from "@openzeppelin/contracts/access/Ownable2Step.sol";
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
    address[] public allAssets;

    event AssetConfigured(
        address indexed asset,
        address indexed oracle,
        bool quoteEnabled,
        bool rewardEnabled,
        bool graduationEnabled,
        bool active,
        string category
    );

    constructor(address initialOwner) Ownable(initialOwner) {}

    function configureAsset(address asset, AssetConfig calldata config) external onlyOwner {
        require(asset != address(0), "ZERO_ASSET");
        require(config.oracle != address(0), "ZERO_ORACLE");
        require(config.maxOracleAge >= 60, "ORACLE_AGE_TOO_LOW");

        if (_assets[asset].oracle == address(0)) {
            allAssets.push(asset);
        }

        _assets[asset] = config;
        emit AssetConfigured(
            asset,
            config.oracle,
            config.quoteEnabled,
            config.rewardEnabled,
            config.graduationEnabled,
            config.active,
            config.category
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

    function usdValue(address asset, uint256 amount) public view returns (uint256 value1e18) {
        AssetConfig memory config = _assets[asset];
        require(config.active, "ASSET_DISABLED");

        (uint256 price, uint256 updatedAt) = IFortunePriceOracle(config.oracle).priceUsd(asset);
        require(price > 0, "BAD_PRICE");
        require(block.timestamp - updatedAt <= config.maxOracleAge, "STALE_PRICE");

        uint8 decimals = IERC20Metadata(asset).decimals();
        return amount * price / (10 ** decimals);
    }

    function tokenAmountForUsd(address asset, uint256 usd1e18) external view returns (uint256 amount) {
        AssetConfig memory config = _assets[asset];
        require(config.active, "ASSET_DISABLED");

        (uint256 price, uint256 updatedAt) = IFortunePriceOracle(config.oracle).priceUsd(asset);
        require(price > 0, "BAD_PRICE");
        require(block.timestamp - updatedAt <= config.maxOracleAge, "STALE_PRICE");

        uint8 decimals = IERC20Metadata(asset).decimals();
        return usd1e18 * (10 ** decimals) / price;
    }

    function assetCount() external view returns (uint256) {
        return allAssets.length;
    }
}
