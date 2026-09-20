// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";

import {FortuneAssetRegistry} from "../src/FortuneAssetRegistry.sol";
import {FortuneAutomationRegistry} from "../src/FortuneAutomationRegistry.sol";
import {FortuneMetadataRegistry} from "../src/FortuneMetadataRegistry.sol";
import {FortunePoolRegistry} from "../src/FortunePoolRegistry.sol";
import {FortuneFactory} from "../src/FortuneFactory.sol";
import {FortuneTaxFactory} from "../src/FortuneTaxFactory.sol";
import {FortunePermanentLiquidityLocker} from "../src/FortunePermanentLiquidityLocker.sol";
import {FortunePermanentV2LiquidityLocker} from "../src/FortunePermanentV2LiquidityLocker.sol";
import {FortunePancakeV3GraduationAdapter} from "../src/FortunePancakeV3GraduationAdapter.sol";
import {FortunePancakeV2TaxGraduationAdapter} from "../src/FortunePancakeV2TaxGraduationAdapter.sol";
import {FortuneTokenDeployer} from "../src/deployers/FortuneTokenDeployer.sol";
import {FortuneVaultDeployer} from "../src/deployers/FortuneVaultDeployer.sol";
import {FortuneFeeRouterDeployer} from "../src/deployers/FortuneFeeRouterDeployer.sol";
import {FortuneCurveDeployer} from "../src/deployers/FortuneCurveDeployer.sol";
import {MockQuoteToken} from "../src/test/MockQuoteToken.sol";
import {MockUsdOracle} from "../src/test/MockUsdOracle.sol";

interface IPancakeV2RouterFactoryView {
    function factory()
        external
        view
        returns (address);
}

/// @notice Persistent public-alpha stack on BSC Testnet.
/// @dev Deploys both the standard V3 Fortune path and the isolated tax-token V2
///      path around one Fortune-owned valueless fUSD token. No mainnet assets are
///      touched. Mock fUSD keeps a fixed $1 oracle value for public testing.
contract PublicTestnetStack is Script {
    function run() external {
        require(
            block.chainid == 97,
            "BSC_TESTNET_ONLY"
        );

        uint256 deployerKey =
            vm.envUint("PRIVATE_KEY");
        address deployer =
            vm.addr(deployerKey);

        address pancakeV3Factory =
            vm.envAddress(
                "PANCAKE_V3_FACTORY"
            );
        address positionManager =
            vm.envAddress(
                "PANCAKE_V3_POSITION_MANAGER"
            );
        address pancakeV2Router =
            vm.envAddress(
                "PANCAKE_V2_ROUTER"
            );

        require(
            pancakeV3Factory.code.length > 0 &&
                positionManager.code.length > 0 &&
                pancakeV2Router.code.length > 0,
            "PANCAKE_DEPENDENCY_NO_CODE"
        );

        address pancakeV2Factory =
            IPancakeV2RouterFactoryView(
                pancakeV2Router
            ).factory();

        require(
            pancakeV2Factory != address(0) &&
                pancakeV2Factory.code.length > 0,
            "PANCAKE_V2_FACTORY_NO_CODE"
        );

        vm.startBroadcast(
            deployerKey
        );

        MockUsdOracle oracle =
            new MockUsdOracle(
                deployer
            );
        MockQuoteToken mockUsd =
            new MockQuoteToken(
                "Fortune Public Test USD",
                "fUSD",
                18
            );

        FortuneAssetRegistry registry =
            new FortuneAssetRegistry(
                deployer
            );

        registry.configureAsset(
            address(mockUsd),
            FortuneAssetRegistry
                .AssetConfig({
                    oracle: address(oracle),
                    maxOracleAge: type(uint32).max,
                    quoteEnabled: true,
                    rewardEnabled: true,
                    graduationEnabled: true,
                    active: true,
                    category: "Fortune Public Testnet"
                })
        );

        oracle.setPrice(
            address(mockUsd),
            1e18
        );

        FortuneAutomationRegistry automationRegistry =
            new FortuneAutomationRegistry(
                deployer
            );
        FortuneMetadataRegistry metadataRegistry =
            new FortuneMetadataRegistry(
                deployer
            );
        FortunePoolRegistry poolRegistry =
            new FortunePoolRegistry(
                deployer
            );

        poolRegistry.configureFactory(
            pancakeV2Factory,
            FortunePoolRegistry
                .FactoryKind
                .V2,
            true
        );
        poolRegistry.configureFactory(
            pancakeV3Factory,
            FortunePoolRegistry
                .FactoryKind
                .V3,
            true
        );

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
                address(
                    automationRegistry
                ),
                address(
                    metadataRegistry
                ),
                address(
                    tokenDeployer
                ),
                address(
                    vaultDeployer
                ),
                address(
                    feeRouterDeployer
                ),
                address(
                    curveDeployer
                ),
                deployer,
                deployer
            );

        metadataRegistry.bindFactory(
            address(factory)
        );

        FortunePermanentLiquidityLocker v3Locker =
            new FortunePermanentLiquidityLocker(
                address(factory),
                positionManager
            );

        FortunePancakeV3GraduationAdapter v3Adapter =
            new FortunePancakeV3GraduationAdapter(
                address(factory),
                address(registry),
                pancakeV3Factory,
                positionManager,
                address(v3Locker)
            );

        factory.setLiquidityLockerDepositor(
            address(v3Locker),
            address(v3Adapter),
            true
        );
        factory.setGraduationAdapter(
            address(v3Adapter)
        );

        FortuneTaxFactory taxFactory =
            new FortuneTaxFactory(
                deployer,
                address(registry),
                address(
                    automationRegistry
                ),
                address(poolRegistry),
                address(
                    tokenDeployer
                ),
                address(
                    vaultDeployer
                ),
                address(
                    feeRouterDeployer
                ),
                address(
                    curveDeployer
                ),
                deployer,
                deployer
            );

        FortunePermanentV2LiquidityLocker v2Locker =
            new FortunePermanentV2LiquidityLocker(
                address(taxFactory)
            );

        FortunePancakeV2TaxGraduationAdapter v2Adapter =
            new FortunePancakeV2TaxGraduationAdapter(
                address(taxFactory),
                pancakeV2Factory,
                pancakeV2Router,
                address(v2Locker),
                address(poolRegistry)
            );

        taxFactory
            .setLiquidityLockerDepositor(
                address(v2Locker),
                address(v2Adapter),
                true
            );
        taxFactory.setGraduationAdapter(
            address(v2Adapter)
        );
        taxFactory.setLaunchesPaused(
            false
        );

        vm.stopBroadcast();

        console2.log(
            "PUBLIC_TESTNET_STACK_READY"
        );
        console2.log(
            "FortuneFactory",
            address(factory)
        );
        console2.log(
            "FortuneTaxFactory",
            address(taxFactory)
        );
        console2.log(
            "FortuneAssetRegistry",
            address(registry)
        );
        console2.log(
            "FortuneAutomationRegistry",
            address(automationRegistry)
        );
        console2.log(
            "FortuneMetadataRegistry",
            address(metadataRegistry)
        );
        console2.log(
            "FortunePoolRegistry",
            address(poolRegistry)
        );
        console2.log(
            "FortuneTokenDeployer",
            address(tokenDeployer)
        );
        console2.log(
            "FortuneVaultDeployer",
            address(vaultDeployer)
        );
        console2.log(
            "FortuneFeeRouterDeployer",
            address(feeRouterDeployer)
        );
        console2.log(
            "FortuneCurveDeployer",
            address(curveDeployer)
        );
        console2.log(
            "FortunePancakeV3GraduationAdapter",
            address(v3Adapter)
        );
        console2.log(
            "FortunePermanentLiquidityLocker",
            address(v3Locker)
        );
        console2.log(
            "FortunePancakeV2TaxGraduationAdapter",
            address(v2Adapter)
        );
        console2.log(
            "FortunePermanentV2LiquidityLocker",
            address(v2Locker)
        );
        console2.log(
            "MockQuote",
            address(mockUsd)
        );
        console2.log(
            "MockUsdOracle",
            address(oracle)
        );
        console2.log(
            "PancakeV2Router",
            pancakeV2Router
        );
        console2.log(
            "PancakeV2Factory",
            pancakeV2Factory
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
