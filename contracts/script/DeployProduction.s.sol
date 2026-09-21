// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";

import {FortuneAssetRegistry} from "../src/FortuneAssetRegistry.sol";
import {FortuneAutomationRegistry} from "../src/FortuneAutomationRegistry.sol";
import {FortuneMetadataRegistry} from "../src/FortuneMetadataRegistry.sol";
import {FortuneChainlinkOracle} from "../src/FortuneChainlinkOracle.sol";
import {FortuneFactory} from "../src/FortuneFactory.sol";
import {FortunePermanentLiquidityLocker} from "../src/FortunePermanentLiquidityLocker.sol";
import {FortunePancakeV3GraduationAdapter} from "../src/FortunePancakeV3GraduationAdapter.sol";
import {FortuneTokenDeployer} from "../src/deployers/FortuneTokenDeployer.sol";
import {FortuneVaultDeployer} from "../src/deployers/FortuneVaultDeployer.sol";
import {FortuneFeeRouterDeployer} from "../src/deployers/FortuneFeeRouterDeployer.sol";
import {FortuneCurveDeployer} from "../src/deployers/FortuneCurveDeployer.sol";

/// @notice Production deployment script for Fortune on BNB Smart Chain mainnet.
/// @dev Every external asset, Chainlink feed, governance address and Pancake
///      dependency is supplied through environment variables. Nothing external
///      is silently hardcoded in this script.
contract DeployProduction is Script {
    function run() external {
        require(block.chainid == 56, "BSC_MAINNET_ONLY");

        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);

        address governance = vm.envAddress("FORTUNE_GOVERNANCE");
        address automationExecutor =
            vm.envAddress("FORTUNE_AUTOMATION_EXECUTOR");
        address protocolTreasury =
            vm.envAddress("FORTUNE_PROTOCOL_TREASURY");
        address pancakeV3Factory =
            vm.envAddress("PANCAKE_V3_FACTORY");
        address positionManager =
            vm.envAddress("PANCAKE_V3_POSITION_MANAGER");

        require(
            governance != address(0) &&
                automationExecutor != address(0) &&
                protocolTreasury != address(0),
            "ZERO_GOVERNANCE_ADDRESS"
        );
        require(
            governance.code.length > 0,
            "GOVERNANCE_MUST_BE_CONTRACT"
        );
        // Mainnet v1 does not permit a single hot-key EOA to command launch
        // automation vaults. The executor must itself be contract-controlled.
        require(
            automationExecutor.code.length > 0,
            "AUTOMATION_EXECUTOR_MUST_BE_CONTRACT"
        );
        require(
            protocolTreasury.code.length > 0,
            "PROTOCOL_TREASURY_MUST_BE_CONTRACT"
        );
        require(
            automationExecutor == governance &&
                protocolTreasury == governance,
            "MAINNET_V1_USE_GOVERNANCE_SAFE"
        );
        require(
            pancakeV3Factory.code.length > 0 &&
                positionManager.code.length > 0,
            "PANCAKE_DEPENDENCY_NO_CODE"
        );

        uint256 assetCount = vm.envUint("PRODUCTION_ASSET_COUNT");
        // Mainnet v1 is deliberately single-reserve. This removes
        // cross-reserve execution/arbitrage from the first real-funds canary.
        // Additional assets require a later reviewed release.
        require(assetCount == 1, "MAINNET_V1_SINGLE_ASSET");

        vm.startBroadcast(deployerKey);

        FortuneChainlinkOracle oracle =
            new FortuneChainlinkOracle(deployer);
        FortuneAssetRegistry registry =
            new FortuneAssetRegistry(deployer);
        FortuneAutomationRegistry automationRegistry =
            new FortuneAutomationRegistry(deployer);
        FortuneMetadataRegistry metadataRegistry =
            new FortuneMetadataRegistry(deployer);

        bool hasLaunchableQuote;

        for (uint256 i; i < assetCount; ++i) {
            string memory suffix = vm.toString(i);
            address asset =
                vm.envAddress(string.concat("PRODUCTION_ASSET_", suffix));
            address feed =
                vm.envAddress(string.concat("PRODUCTION_FEED_", suffix));
            uint256 maxAge =
                vm.envUint(string.concat("PRODUCTION_MAX_AGE_", suffix));
            bool quoteEnabled =
                vm.envBool(string.concat("PRODUCTION_QUOTE_ENABLED_", suffix));
            bool rewardEnabled =
                vm.envBool(string.concat("PRODUCTION_REWARD_ENABLED_", suffix));
            bool graduationEnabled =
                vm.envBool(string.concat("PRODUCTION_GRADUATION_ENABLED_", suffix));
            string memory category =
                vm.envString(string.concat("PRODUCTION_CATEGORY_", suffix));

            require(
                asset != address(0) &&
                    feed != address(0) &&
                    asset.code.length > 0 &&
                    feed.code.length > 0,
                "ASSET_OR_FEED_NO_CODE"
            );
            require(
                maxAge >= 60 &&
                    maxAge <= type(uint32).max,
                "BAD_MAX_ORACLE_AGE"
            );
            require(
                bytes(category).length > 0,
                "EMPTY_ASSET_CATEGORY"
            );

            oracle.setFeed(asset, feed);

            registry.configureAsset(
                asset,
                FortuneAssetRegistry.AssetConfig({
                    oracle: address(oracle),
                    maxOracleAge: uint32(maxAge),
                    quoteEnabled: quoteEnabled,
                    rewardEnabled: rewardEnabled,
                    graduationEnabled: graduationEnabled,
                    active: true,
                    category: category
                })
            );

            (
                bool healthy,
                bytes32 reasonCode,
                uint256 price,
                uint256 updatedAt
            ) = registry.assetHealth(asset);

            require(healthy, "ASSET_HEALTH_FAILED");
            require(reasonCode == bytes32("OK"), "ASSET_REASON_NOT_OK");
            require(price > 0 && updatedAt > 0, "BAD_ASSET_PRICE");

            if (quoteEnabled && graduationEnabled) {
                hasLaunchableQuote = true;
            }
        }

        require(hasLaunchableQuote, "NO_LAUNCHABLE_QUOTE");

        FortuneTokenDeployer tokenDeployer =
            new FortuneTokenDeployer();
        FortuneVaultDeployer vaultDeployer =
            new FortuneVaultDeployer();
        FortuneFeeRouterDeployer feeRouterDeployer =
            new FortuneFeeRouterDeployer();
        FortuneCurveDeployer curveDeployer =
            new FortuneCurveDeployer();

        FortuneFactory factory =
            new FortuneFactory(
                deployer,
                address(registry),
                address(automationRegistry),
                address(metadataRegistry),
                address(tokenDeployer),
                address(vaultDeployer),
                address(feeRouterDeployer),
                address(curveDeployer),
                automationExecutor,
                protocolTreasury
            );

        metadataRegistry.bindFactory(address(factory));

        FortunePermanentLiquidityLocker locker =
            new FortunePermanentLiquidityLocker(
                address(factory),
                positionManager
            );

        FortunePancakeV3GraduationAdapter adapter =
            new FortunePancakeV3GraduationAdapter(
                address(factory),
                address(registry),
                pancakeV3Factory,
                positionManager,
                address(locker)
            );

        factory.setLiquidityLockerDepositor(
            address(locker),
            address(adapter),
            true
        );
        factory.setGraduationAdapter(address(adapter));

        // Production deploys closed. Governance must explicitly activate
        // launches after ownership acceptance and final release checks.
        factory.setLaunchesPaused(true);

        // Ownable2Step deliberately leaves the deployer as owner until the
        // governance address explicitly accepts ownership onchain.
        oracle.transferOwnership(governance);
        registry.transferOwnership(governance);
        automationRegistry.transferOwnership(governance);
        factory.transferOwnership(governance);

        vm.stopBroadcast();

        console2.log("Fortune production deployer", deployer);
        console2.log("Pending governance owner", governance);
        console2.log("FortuneFactory", address(factory));
        console2.log("FortuneAssetRegistry", address(registry));
        console2.log("FortuneAutomationRegistry", address(automationRegistry));
        console2.log("FortuneMetadataRegistry", address(metadataRegistry));
        console2.log("FortuneChainlinkOracle", address(oracle));
        console2.log("FortuneTokenDeployer", address(tokenDeployer));
        console2.log("FortuneVaultDeployer", address(vaultDeployer));
        console2.log("FortuneFeeRouterDeployer", address(feeRouterDeployer));
        console2.log("FortuneCurveDeployer", address(curveDeployer));
        console2.log("FortunePermanentLiquidityLocker", address(locker));
        console2.log("FortunePancakeV3GraduationAdapter", address(adapter));
        console2.log("PancakeV3Factory", pancakeV3Factory);
        console2.log("PancakeV3PositionManager", positionManager);
        console2.log("LaunchesPaused", factory.launchesPaused());
        console2.log("IMPORTANT: governance must accept Ownable2Step ownership");
        console2.log("IMPORTANT: production launches remain paused until explicit activation");
    }
}
