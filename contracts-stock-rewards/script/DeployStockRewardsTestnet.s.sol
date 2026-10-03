// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {FortuneAssetRegistry} from "fortune/FortuneAssetRegistry.sol";
import {FortunePancakeV3GraduationAdapter} from "fortune/FortunePancakeV3GraduationAdapter.sol";
import {FortunePermanentLiquidityLocker} from "fortune/FortunePermanentLiquidityLocker.sol";
import {FortuneCurveDeployer} from "fortune/deployers/FortuneCurveDeployer.sol";
import {FortuneFeeRouterDeployer} from "fortune/deployers/FortuneFeeRouterDeployer.sol";
import {FortuneStockRewardsFactory} from "../src/FortuneStockRewardsFactory.sol";
import {FortuneStockRewardsTokenDeployer} from "../src/FortuneStockRewardsTokenDeployer.sol";
import {FortuneTestStock} from "../src/testnet/FortuneTestStock.sol";
import {FortuneTestStockOracle} from "../src/testnet/FortuneTestStockOracle.sol";

/// @notice Deploys the UNAUDITED Stock Rewards beta to BSC Testnet only: a
///         dedicated asset registry listing eight faucet test stocks (five large
///         caps and three penny stocks) priced by an owner-set test oracle, the
///         factory, and the graduation adapter and liquidity locker bound to it.
contract DeployStockRewardsTestnet is Script {
    struct Listing {
        string name;
        string symbol;
        uint256 priceUsd1e18;
        uint256 faucetShares;
        string category;
    }

    function run() external {
        require(block.chainid == 97, "BSC_TESTNET_ONLY");
        uint256 key = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(key);
        address owner = vm.envOr("STOCK_REWARDS_OWNER", deployer);
        address feeRecipient = vm.envOr("STOCK_REWARDS_FEE_RECIPIENT", deployer);
        address v3Factory = vm.envAddress("PANCAKE_V3_FACTORY");
        address positionManager = vm.envAddress("PANCAKE_V3_POSITION_MANAGER");
        address v2Factory = vm.envOr("PANCAKE_V2_FACTORY", address(0));
        require(v3Factory.code.length > 0, "PANCAKE_V3_FACTORY_NO_CODE");
        require(positionManager.code.length > 0, "PANCAKE_V3_POSITION_MANAGER_NO_CODE");
        require(v2Factory == address(0) || v2Factory.code.length > 0, "PANCAKE_V2_FACTORY_NO_CODE");

        Listing[8] memory listings = [
            Listing("Tesla (Fortune test share)", "tTSLA", 250e18, 1_000, "stock"),
            Listing("NVIDIA (Fortune test share)", "tNVDA", 120e18, 1_000, "stock"),
            Listing("Apple (Fortune test share)", "tAAPL", 230e18, 1_000, "stock"),
            Listing("Amazon (Fortune test share)", "tAMZN", 190e18, 1_000, "stock"),
            Listing("Microsoft (Fortune test share)", "tMSFT", 420e18, 1_000, "stock"),
            Listing("Plug Power (Fortune test share)", "tPLUG", 2.1e18, 100_000, "penny-stock"),
            Listing("Opendoor (Fortune test share)", "tOPEN", 2.6e18, 100_000, "penny-stock"),
            Listing("SNDL (Fortune test share)", "tSNDL", 1.8e18, 100_000, "penny-stock")
        ];

        vm.startBroadcast(key);
        FortuneAssetRegistry registry = new FortuneAssetRegistry(deployer);
        FortuneTestStockOracle oracle = new FortuneTestStockOracle(deployer);
        address[] memory stocks = new address[](listings.length);
        uint256[] memory prices = new uint256[](listings.length);
        for (uint256 i; i < listings.length; ++i) {
            stocks[i] = address(
                new FortuneTestStock(listings[i].name, listings[i].symbol, 18, listings[i].faucetShares)
            );
            prices[i] = listings[i].priceUsd1e18;
        }
        oracle.setPrices(stocks, prices);
        for (uint256 i; i < listings.length; ++i) {
            registry.configureAsset(
                stocks[i],
                FortuneAssetRegistry.AssetConfig({
                    oracle: address(oracle),
                    maxOracleAge: 3600,
                    quoteEnabled: true,
                    rewardEnabled: true,
                    graduationEnabled: true,
                    active: true,
                    category: listings[i].category
                })
            );
        }

        FortuneStockRewardsFactory factory = new FortuneStockRewardsFactory(
            deployer,
            address(registry),
            address(new FortuneCurveDeployer()),
            address(new FortuneFeeRouterDeployer()),
            address(new FortuneStockRewardsTokenDeployer()),
            v3Factory,
            v2Factory,
            feeRecipient
        );
        FortunePermanentLiquidityLocker locker = new FortunePermanentLiquidityLocker(address(factory), positionManager);
        FortunePancakeV3GraduationAdapter adapter = new FortunePancakeV3GraduationAdapter(
            address(factory), address(registry), v3Factory, positionManager, address(locker)
        );
        factory.initialize(address(adapter), address(locker));
        if (owner != deployer) {
            // Two-step: the owner accepts each from its own wallet.
            factory.transferOwnership(owner);
            registry.transferOwnership(owner);
            oracle.transferOwnership(owner);
        }
        vm.stopBroadcast();

        console2.log("STOCK_REWARDS_FACTORY=%s", address(factory));
        console2.log("STOCK_REWARDS_REGISTRY=%s", address(registry));
        console2.log("STOCK_REWARDS_ORACLE=%s", address(oracle));
        console2.log("STOCK_REWARDS_ADAPTER=%s", address(adapter));
        console2.log("STOCK_REWARDS_LOCKER=%s", address(locker));
        console2.log("STOCK_REWARDS_TOKEN_DEPLOYER=%s", address(factory.tokenDeployer()));
        string memory list = vm.toString(stocks[0]);
        for (uint256 i = 1; i < stocks.length; ++i) {
            list = string.concat(list, ",", vm.toString(stocks[i]));
        }
        console2.log("STOCK_REWARDS_TEST_STOCKS=%s", list);
    }
}
