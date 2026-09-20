// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";

import {FortuneAssetRegistry} from "../src/FortuneAssetRegistry.sol";
import {FortuneFactory} from "../src/FortuneFactory.sol";
import {FortuneAutomationRegistry} from "../src/FortuneAutomationRegistry.sol";
import {FortuneMetadataRegistry} from "../src/FortuneMetadataRegistry.sol";
import {FortuneTokenDeployer} from "../src/deployers/FortuneTokenDeployer.sol";
import {FortuneVaultDeployer} from "../src/deployers/FortuneVaultDeployer.sol";
import {FortuneFeeRouterDeployer} from "../src/deployers/FortuneFeeRouterDeployer.sol";
import {FortuneCurveDeployer} from "../src/deployers/FortuneCurveDeployer.sol";
import {MockGraduationAdapter} from "../src/MockGraduationAdapter.sol";
import {MockUsdOracle} from "../src/test/MockUsdOracle.sol";
import {MockQuoteToken} from "../src/test/MockQuoteToken.sol";

/// @notice Deploys an isolated Fortune research stack to BSC testnet.
/// @dev Uses mock quote assets + mock oracle. It intentionally does not touch
///      real BSC assets or PancakeSwap.
contract DeployTestnet is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);

        vm.startBroadcast(deployerKey);

        MockUsdOracle oracle = new MockUsdOracle(deployer);
        MockQuoteToken mockUsdt = new MockQuoteToken("Fortune Test USDT", "tUSDT", 18);
        MockQuoteToken mockWbnb = new MockQuoteToken("Fortune Test WBNB", "tWBNB", 18);

        FortuneAssetRegistry registry = new FortuneAssetRegistry(deployer);

        FortuneAssetRegistry.AssetConfig memory stableConfig =
            FortuneAssetRegistry.AssetConfig({
                oracle: address(oracle),
                maxOracleAge: 1 hours,
                quoteEnabled: true,
                rewardEnabled: true,
                graduationEnabled: true,
                active: true,
                category: "Test Stablecoin"
            });

        FortuneAssetRegistry.AssetConfig memory bnbConfig =
            FortuneAssetRegistry.AssetConfig({
                oracle: address(oracle),
                maxOracleAge: 1 hours,
                quoteEnabled: true,
                rewardEnabled: true,
                graduationEnabled: true,
                active: true,
                category: "Test BNB"
            });

        registry.configureAsset(address(mockUsdt), stableConfig);
        registry.configureAsset(address(mockWbnb), bnbConfig);
        oracle.setPrice(address(mockUsdt), 1e18);
        oracle.setPrice(address(mockWbnb), 600e18);

        FortuneAutomationRegistry automationRegistry =
            new FortuneAutomationRegistry(deployer);
        FortuneMetadataRegistry metadataRegistry =
            new FortuneMetadataRegistry(deployer);
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
                deployer,
                deployer
            );

        metadataRegistry.bindFactory(
            address(factory)
        );

        MockGraduationAdapter graduation =
            new MockGraduationAdapter();
        factory.setGraduationAdapter(
            address(graduation)
        );

        vm.stopBroadcast();

        console2.log("FortuneFactory", address(factory));
        console2.log("FortuneAssetRegistry", address(registry));
        console2.log("FortuneAutomationRegistry", address(automationRegistry));
        console2.log("FortuneMetadataRegistry", address(metadataRegistry));
        console2.log("FortuneTokenDeployer", address(tokenDeployer));
        console2.log("FortuneVaultDeployer", address(vaultDeployer));
        console2.log("FortuneFeeRouterDeployer", address(feeRouterDeployer));
        console2.log("FortuneCurveDeployer", address(curveDeployer));
        console2.log("MockGraduationAdapter", address(graduation));
        console2.log("MockUsdOracle", address(oracle));
        console2.log("Mock tUSDT", address(mockUsdt));
        console2.log("Mock tWBNB", address(mockWbnb));
    }
}
