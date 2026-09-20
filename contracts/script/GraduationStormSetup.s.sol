// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";

import {FortuneAssetRegistry} from "../src/FortuneAssetRegistry.sol";
import {FortuneAutomationRegistry} from "../src/FortuneAutomationRegistry.sol";
import {FortuneMetadataRegistry} from "../src/FortuneMetadataRegistry.sol";
import {FortuneTokenDeployer} from "../src/deployers/FortuneTokenDeployer.sol";
import {FortuneVaultDeployer} from "../src/deployers/FortuneVaultDeployer.sol";
import {FortuneFeeRouterDeployer} from "../src/deployers/FortuneFeeRouterDeployer.sol";
import {FortuneCurveDeployer} from "../src/deployers/FortuneCurveDeployer.sol";
import {FortuneCurve} from "../src/FortuneCurve.sol";
import {FortuneFactory} from "../src/FortuneFactory.sol";
import {FortunePancakeV3GraduationAdapter} from "../src/FortunePancakeV3GraduationAdapter.sol";
import {FortunePermanentLiquidityLocker} from "../src/FortunePermanentLiquidityLocker.sol";
import {MockQuoteToken} from "../src/test/MockQuoteToken.sol";
import {MockUsdOracle} from "../src/test/MockUsdOracle.sol";

/// @notice Testnet-only helper that compresses one complete launch + threshold buy
///         into one transaction while reusing shared Fortune infrastructure.
contract FortuneGraduationStormSeeder {
    using Strings for uint256;

    address public immutable operator;
    FortuneFactory public immutable factory;
    MockQuoteToken public immutable quote;

    address[] public curves;
    address[] public tokens;

    constructor(
        address operator_,
        FortuneFactory factory_,
        MockQuoteToken quote_
    ) {
        require(operator_ != address(0), "ZERO_OPERATOR");
        operator = operator_;
        factory = factory_;
        quote = quote_;
    }

    function seedOne(uint256 index)
        external
        returns (address curveAddress, address tokenAddress)
    {
        require(msg.sender == operator, "ONLY_OPERATOR");

        address[] memory quoteAssets = new address[](1);
        quoteAssets[0] = address(quote);

        uint16[] memory weights = new uint16[](1);
        weights[0] = 10_000;

        uint16[6] memory fees = [
            uint16(25),
            uint16(25),
            uint16(25),
            uint16(15),
            uint16(0),
            uint16(10)
        ];

        string memory suffix = index.toString();

        FortuneFactory.LaunchParams memory params =
            FortuneFactory.LaunchParams({
                name: string.concat("Fortune Graduation Storm ", suffix),
                symbol: string.concat("FST", suffix),
                totalSupply: 1_000_000_000e18,
                quoteAssets: quoteAssets,
                weightsBps: weights,
                primaryQuote: address(quote),
                basePriceUsd1e18: 1e15,
                slopeUsd1e18: 1e6,
                graduationUsd1e18: 1e18,
                adaptiveGraduation: true,
                feeBps: fees,
                treasury: operator,
                metadataEditable: false,
                description: "Fortune BSC testnet concurrent-graduation stress launch",
                imageURI: "",
                website: "",
                xProfile: "",
                telegram: "",
                github: "",
                youtube: "",
                debox: ""
            });

        (bytes32 vanitySalt, , , ) =
            factory.previewPreparedVanity(address(this), params);

        FortuneFactory.LaunchInfo memory info =
            factory.createLaunchPrepared(params, vanitySalt);

        FortuneCurve curve = FortuneCurve(info.curve);

        quote.faucet(250e18);
        quote.approve(address(curve), type(uint256).max);
        curve.buy(address(quote), 250e18, 1);

        require(curve.graduationReady(), "CURVE_NOT_READY");
        require(!curve.graduated(), "CURVE_ALREADY_GRADUATED");

        curves.push(info.curve);
        tokens.push(info.token);

        return (info.curve, info.token);
    }

    function count() external view returns (uint256) {
        return curves.length;
    }
}

/// @notice Funds ephemeral permissionless graduation keepers in one transaction.
///         Testnet-only; this contract deliberately has no production role.
contract FortuneGraduationStormFunder {
    address public immutable operator;

    constructor(address operator_) {
        require(operator_ != address(0), "ZERO_OPERATOR");
        operator = operator_;
    }

    function fund(address payable[] calldata recipients, uint256 amountEach)
        external
        payable
    {
        require(msg.sender == operator, "ONLY_OPERATOR");
        require(
            msg.value == recipients.length * amountEach,
            "BAD_VALUE"
        );

        for (uint256 i; i < recipients.length; ++i) {
            (bool ok, ) = recipients[i].call{value: amountEach}("");
            require(ok, "FUND_FAILED");
        }
    }
}

/// @notice Prepares 1-100 independent Fortune launches on real BSC testnet,
///         all sharing one protocol stack and all stopped at GraduationReady.
/// @dev Finalization is intentionally left for the offchain concurrent keeper storm.
contract GraduationStormSetup is Script {
    function run() external {
        require(block.chainid == 97, "BSC_TESTNET_ONLY");

        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);

        uint256 launchCount = vm.envUint("STORM_LAUNCH_COUNT");
        require(launchCount >= 1 && launchCount <= 100, "BAD_LAUNCH_COUNT");

        address pancakeV3Factory =
            vm.envAddress("PANCAKE_V3_FACTORY");
        address positionManager =
            vm.envAddress("PANCAKE_V3_POSITION_MANAGER");

        require(pancakeV3Factory.code.length > 0, "PANCAKE_FACTORY_NO_CODE");
        require(positionManager.code.length > 0, "POSITION_MANAGER_NO_CODE");

        vm.startBroadcast(deployerKey);

        MockUsdOracle oracle = new MockUsdOracle(deployer);
        MockQuoteToken quote =
            new MockQuoteToken("Fortune Storm USD", "fSUSD", 18);

        FortuneAssetRegistry registry =
            new FortuneAssetRegistry(deployer);

        registry.configureAsset(
            address(quote),
            FortuneAssetRegistry.AssetConfig({
                oracle: address(oracle),
                maxOracleAge: 1 hours,
                quoteEnabled: true,
                rewardEnabled: true,
                graduationEnabled: true,
                active: true,
                category: "Fortune Graduation Storm"
            })
        );
        oracle.setPrice(address(quote), 1e18);

        FortuneAutomationRegistry automationRegistry =
            new FortuneAutomationRegistry(deployer);
        FortuneMetadataRegistry metadataRegistry =
            new FortuneMetadataRegistry(deployer);
        FortuneTokenDeployer tokenDeployer = new FortuneTokenDeployer();
        FortuneVaultDeployer vaultDeployer = new FortuneVaultDeployer();
        FortuneFeeRouterDeployer feeRouterDeployer =
            new FortuneFeeRouterDeployer();
        FortuneCurveDeployer curveDeployer = new FortuneCurveDeployer();

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

        FortuneGraduationStormSeeder seeder =
            new FortuneGraduationStormSeeder(
                deployer,
                factory,
                quote
            );

        FortuneGraduationStormFunder funder =
            new FortuneGraduationStormFunder(deployer);

        for (uint256 i; i < launchCount; ++i) {
            seeder.seedOne(i);
        }

        vm.stopBroadcast();

        require(seeder.count() == launchCount, "SEED_COUNT_MISMATCH");
        require(locker.lockedPositionCount() == 0, "PREMATURE_LP_LOCK");

        console2.log("StormFactory", address(factory));
        console2.log("StormRegistry", address(registry));
        console2.log("StormAdapter", address(adapter));
        console2.log("StormLocker", address(locker));
        console2.log("StormQuote", address(quote));
        console2.log("StormSeeder", address(seeder));
        console2.log("StormFunder", address(funder));
        console2.log("StormLaunchCount", launchCount);

        for (uint256 i; i < launchCount; ++i) {
            console2.log("StormCurve", seeder.curves(i));
            console2.log("StormToken", seeder.tokens(i));
        }
    }
}
