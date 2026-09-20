// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";

import {FortuneFactory} from "../src/FortuneFactory.sol";
import {FortuneAssetRegistry} from "../src/FortuneAssetRegistry.sol";
import {FortuneMetadataRegistry} from "../src/FortuneMetadataRegistry.sol";
import {FortunePancakeV3GraduationAdapter} from "../src/FortunePancakeV3GraduationAdapter.sol";
import {FortunePermanentLiquidityLocker} from "../src/FortunePermanentLiquidityLocker.sol";

/// @notice Final, explicit activation step for a previously deployed and reviewed
///         Fortune production stack on BNB Smart Chain mainnet.
/// @dev This script cannot deploy anything. It only performs invariant checks and
///      unpauses launch creation when the governance owner explicitly confirms.
contract ActivateProduction is Script {
    function run() external {
        require(block.chainid == 56, "BSC_MAINNET_ONLY");

        string memory confirm =
            vm.envString("CONFIRM_MAINNET_ACTIVATION");

        require(
            keccak256(bytes(confirm)) ==
                keccak256(bytes("ACTIVATE_FORTUNE_MAINNET")),
            "BAD_ACTIVATION_CONFIRMATION"
        );

        uint256 governanceKey =
            vm.envUint("PRIVATE_KEY");
        address governance =
            vm.addr(governanceKey);

        FortuneFactory factory =
            FortuneFactory(
                vm.envAddress("FORTUNE_FACTORY")
            );

        require(
            address(factory).code.length > 0,
            "FACTORY_NO_CODE"
        );
        require(
            factory.owner() == governance,
            "CALLER_NOT_FACTORY_OWNER"
        );
        require(
            factory.launchesPaused(),
            "FACTORY_ALREADY_ACTIVE"
        );

        FortuneAssetRegistry registry =
            factory.registry();

        require(
            address(registry).code.length > 0,
            "REGISTRY_NO_CODE"
        );
        require(
            registry.owner() == governance,
            "GOVERNANCE_NOT_REGISTRY_OWNER"
        );

        FortuneMetadataRegistry metadata =
            factory.metadataRegistry();

        require(
            metadata.factory() == address(factory),
            "METADATA_NOT_BOUND"
        );

        address adapterAddress =
            factory.graduationAdapter();

        require(
            adapterAddress != address(0) &&
                adapterAddress.code.length > 0,
            "GRADUATION_ADAPTER_NO_CODE"
        );

        FortunePancakeV3GraduationAdapter adapter =
            FortunePancakeV3GraduationAdapter(
                adapterAddress
            );

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

        require(
            address(locker).code.length > 0,
            "LOCKER_NO_CODE"
        );
        require(
            locker.approvedDepositor(adapterAddress),
            "LOCKER_ADAPTER_NOT_APPROVED"
        );

        uint256 assetCount =
            registry.assetCount();

        require(
            assetCount > 0,
            "NO_REGISTERED_ASSETS"
        );

        bool hasHealthyLaunchableQuote;

        for (uint256 i; i < assetCount; ++i) {
            address asset =
                registry.allAssets(i);

            FortuneAssetRegistry.AssetConfig
                memory config =
                    registry.assetConfig(asset);

            if (
                config.active &&
                config.quoteEnabled &&
                config.graduationEnabled
            ) {
                (
                    bool healthy,
                    bytes32 reasonCode,
                    uint256 price,
                    uint256 updatedAt
                ) = registry.assetHealth(asset);

                if (
                    healthy &&
                    reasonCode == bytes32("OK") &&
                    price > 0 &&
                    updatedAt > 0
                ) {
                    hasHealthyLaunchableQuote = true;
                    break;
                }
            }
        }

        require(
            hasHealthyLaunchableQuote,
            "NO_HEALTHY_LAUNCHABLE_QUOTE"
        );

        vm.startBroadcast(governanceKey);
        factory.setLaunchesPaused(false);
        vm.stopBroadcast();

        require(
            !factory.launchesPaused(),
            "ACTIVATION_DID_NOT_STICK"
        );

        console2.log(
            "FORTUNE MAINNET ACTIVATED"
        );
        console2.log(
            "Factory",
            address(factory)
        );
        console2.log(
            "Governance",
            governance
        );
        console2.log(
            "GraduationAdapter",
            adapterAddress
        );
        console2.log(
            "LiquidityLocker",
            address(locker)
        );
        console2.log(
            "RegisteredAssets",
            assetCount
        );
    }
}
