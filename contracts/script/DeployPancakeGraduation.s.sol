// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";

import {FortuneFactory} from "../src/FortuneFactory.sol";
import {FortunePermanentLiquidityLocker} from "../src/FortunePermanentLiquidityLocker.sol";
import {FortunePancakeV3GraduationAdapter} from "../src/FortunePancakeV3GraduationAdapter.sol";

/// @notice Wires the research Pancake V3 graduation path to an existing Fortune deployment.
/// @dev External Pancake addresses are always supplied through environment variables.
///      Never copy addresses from examples without independently verifying the target chain.
contract DeployPancakeGraduation is Script {
    function run() external {
        uint256 deployerKey =
            vm.envUint("PRIVATE_KEY");

        address fortuneFactory =
            vm.envAddress("FORTUNE_FACTORY");
        address fortuneRegistry =
            vm.envAddress("FORTUNE_REGISTRY");
        address pancakeV3Factory =
            vm.envAddress("PANCAKE_V3_FACTORY");
        address positionManager =
            vm.envAddress(
                "PANCAKE_V3_POSITION_MANAGER"
            );

        require(
            fortuneFactory.code.length > 0 &&
                fortuneRegistry.code.length > 0 &&
                pancakeV3Factory.code.length > 0 &&
                positionManager.code.length > 0,
            "MISSING_DEPLOYMENT_CODE"
        );

        vm.startBroadcast(deployerKey);

        FortunePermanentLiquidityLocker locker =
            new FortunePermanentLiquidityLocker(
                fortuneFactory,
                positionManager
            );

        FortunePancakeV3GraduationAdapter adapter =
            new FortunePancakeV3GraduationAdapter(
                fortuneFactory,
                fortuneRegistry,
                pancakeV3Factory,
                positionManager,
                address(locker)
            );

        FortuneFactory factory =
            FortuneFactory(fortuneFactory);

        factory.setLiquidityLockerDepositor(
            address(locker),
            address(adapter),
            true
        );
        factory.setGraduationAdapter(
            address(adapter)
        );

        vm.stopBroadcast();

        console2.log(
            "FortunePermanentLiquidityLocker",
            address(locker)
        );
        console2.log(
            "FortunePancakeV3GraduationAdapter",
            address(adapter)
        );
        console2.log(
            "PancakeV3Factory",
            pancakeV3Factory
        );
        console2.log(
            "PancakeV3PositionManager",
            positionManager
        );
    }
}
