// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";

import {FortuneFactory} from "../src/FortuneFactory.sol";
import {FortuneAssetRegistry} from "../src/FortuneAssetRegistry.sol";
import {FortuneAutomationRegistry} from "../src/FortuneAutomationRegistry.sol";
import {FortuneMetadataRegistry} from "../src/FortuneMetadataRegistry.sol";
import {FortuneChainlinkOracle} from "../src/FortuneChainlinkOracle.sol";
import {FortunePancakeV3GraduationAdapter} from "../src/FortunePancakeV3GraduationAdapter.sol";
import {FortunePermanentLiquidityLocker} from "../src/FortunePermanentLiquidityLocker.sol";

/// @notice Validates a paused Fortune production deployment and prepares the
///         governance transaction required to activate launch creation.
/// @dev This script deliberately does not hold or use a governance private key.
///      Mainnet activation must be executed by the configured contract-based
///      governance wallet after all offchain release gates pass.
contract ActivateProduction is Script {
    function run() external {
        require(block.chainid == 56, "BSC_MAINNET_ONLY");

        address governance = vm.envAddress("FORTUNE_GOVERNANCE");
        require(governance != address(0), "ZERO_GOVERNANCE");
        require(governance.code.length > 0, "GOVERNANCE_MUST_BE_CONTRACT");

        FortuneFactory factory =
            FortuneFactory(vm.envAddress("FORTUNE_FACTORY"));

        require(address(factory).code.length > 0, "FACTORY_NO_CODE");
        require(factory.owner() == governance, "GOVERNANCE_NOT_FACTORY_OWNER");
        require(
            factory.automationExecutor() == governance,
            "AUTOMATION_EXECUTOR_NOT_GOVERNANCE"
        );
        require(
            factory.protocolTreasury() == governance,
            "PROTOCOL_TREASURY_NOT_GOVERNANCE"
        );
        require(factory.launchesPaused(), "FACTORY_ALREADY_ACTIVE");

        FortuneAssetRegistry registry = factory.registry();
        require(address(registry).code.length > 0, "REGISTRY_NO_CODE");
        require(registry.owner() == governance, "GOVERNANCE_NOT_REGISTRY_OWNER");

        FortuneAutomationRegistry automationRegistry =
            factory.automationRegistry();
        require(
            address(automationRegistry).code.length > 0,
            "AUTOMATION_REGISTRY_NO_CODE"
        );
        require(
            automationRegistry.owner() == governance,
            "GOVERNANCE_NOT_AUTOMATION_OWNER"
        );

        FortuneMetadataRegistry metadata = factory.metadataRegistry();
        require(
            metadata.factory() == address(factory),
            "METADATA_NOT_BOUND"
        );

        address adapterAddress = factory.graduationAdapter();
        require(
            adapterAddress != address(0) &&
                adapterAddress.code.length > 0,
            "GRADUATION_ADAPTER_NO_CODE"
        );

        FortunePancakeV3GraduationAdapter adapter =
            FortunePancakeV3GraduationAdapter(adapterAddress);

        require(
            address(adapter.pancakeFactory()).code.length > 0,
            "PANCAKE_FACTORY_NO_CODE"
        );
        require(
            address(adapter.positionManager()).code.length > 0,
            "POSITION_MANAGER_NO_CODE"
        );

        FortunePermanentLiquidityLocker locker =
            adapter.liquidityLocker();

        require(address(locker).code.length > 0, "LOCKER_NO_CODE");
        require(
            locker.approvedDepositor(adapterAddress),
            "LOCKER_ADAPTER_NOT_APPROVED"
        );

        address expectedPancakeFactory =
            vm.envAddress("PANCAKE_V3_FACTORY");
        address expectedPositionManager =
            vm.envAddress("PANCAKE_V3_POSITION_MANAGER");
        require(
            address(adapter.pancakeFactory()) == expectedPancakeFactory,
            "PANCAKE_FACTORY_MISMATCH"
        );
        require(
            address(adapter.positionManager()) == expectedPositionManager,
            "POSITION_MANAGER_MISMATCH"
        );

        uint256 assetCount = registry.assetCount();
        require(assetCount == 1, "MAINNET_V1_SINGLE_ASSET");

        address asset = registry.allAssets(0);
        require(
            asset == factory.BSC_MAINNET_V1_QUOTE(),
            "MAINNET_V1_ASSET_NOT_WBNB"
        );

        FortuneAssetRegistry.AssetConfig memory config =
            registry.assetConfig(asset);

        address expectedAsset = vm.envAddress("PRODUCTION_ASSET_0");
        address expectedFeed = vm.envAddress("PRODUCTION_FEED_0");
        uint256 expectedMaxAge = vm.envUint("PRODUCTION_MAX_AGE_0");
        bool expectedQuote =
            vm.envBool("PRODUCTION_QUOTE_ENABLED_0");
        bool expectedReward =
            vm.envBool("PRODUCTION_REWARD_ENABLED_0");
        bool expectedGraduation =
            vm.envBool("PRODUCTION_GRADUATION_ENABLED_0");

        require(asset == expectedAsset, "ASSET_MANIFEST_MISMATCH");
        require(
            uint256(config.maxOracleAge) == expectedMaxAge,
            "ORACLE_MAX_AGE_MISMATCH"
        );
        require(
            config.active &&
                config.quoteEnabled == expectedQuote &&
                config.rewardEnabled == expectedReward &&
                config.graduationEnabled == expectedGraduation,
            "WBNB_CAPABILITIES_MISMATCH"
        );
        require(config.oracle.code.length > 0, "ORACLE_NO_CODE");
        require(
            FortuneChainlinkOracle(config.oracle).feedFor(asset) ==
                expectedFeed,
            "ORACLE_FEED_MISMATCH"
        );

        (
            bool healthy,
            bytes32 reasonCode,
            uint256 price,
            uint256 updatedAt
        ) = registry.assetHealth(asset);

        require(
            healthy &&
                reasonCode == bytes32("OK") &&
                price > 0 &&
                updatedAt > 0,
            "WBNB_HEALTH_FAILED"
        );

        bytes memory activationCalldata =
            abi.encodeCall(
                FortuneFactory.setLaunchesPaused,
                (false)
            );

        console2.log("FORTUNE MAINNET ACTIVATION PREFLIGHT PASSED");
        console2.log("Factory", address(factory));
        console2.log("Governance", governance);
        console2.log("GraduationAdapter", adapterAddress);
        console2.log("LiquidityLocker", address(locker));
        console2.log("RegisteredAssets", assetCount);
        console2.log(
            "Submit the following calldata to the governance wallet targeting the Factory:"
        );
        console2.logBytes(activationCalldata);
        console2.log(
            "No activation transaction was broadcast by this script."
        );
    }
}
