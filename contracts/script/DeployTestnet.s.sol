// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";

import {FortuneAssetRegistry} from "../src/FortuneAssetRegistry.sol";
import {FortuneFactory} from "../src/FortuneFactory.sol";
import {FortuneAutomationRegistry} from "../src/FortuneAutomationRegistry.sol";
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

        FortuneFactory factory =
            new FortuneFactory(
                deployer,
                address(registry),
                address(automationRegistry),
                deployer,
                deployer
            );
        MockGraduationAdapter graduation = new MockGraduationAdapter();
        factory.setGraduationAdapter(address(graduation));

        vm.stopBroadcast();

        console2.log("FortuneFactory", address(factory));
        console2.log("FortuneAssetRegistry", address(registry));
        console2.log("FortuneAutomationRegistry", address(automationRegistry));
        console2.log("FortuneMetadataRegistry", address(factory.metadataRegistry()));
        console2.log("MockGraduationAdapter", address(graduation));
        console2.log("MockUsdOracle", address(oracle));
        console2.log("Mock tUSDT", address(mockUsdt));
        console2.log("Mock tWBNB", address(mockWbnb));
    }
}
