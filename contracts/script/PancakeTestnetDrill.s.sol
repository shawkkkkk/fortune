// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";

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
import {FortuneToken} from "../src/FortuneToken.sol";
import {IPancakeV3PositionManagerLike} from "../src/interfaces/IPancakeV3PositionManagerLike.sol";
import {MockQuoteToken} from "../src/test/MockQuoteToken.sol";
import {MockUsdOracle} from "../src/test/MockUsdOracle.sol";

/// @notice End-to-end BSC testnet drill using real Pancake V3 infrastructure
///         with Fortune-owned mock assets.
/// @dev Testnet only. It deliberately creates a real testnet Pancake pool so we
///      can verify pool initialization, LP locking and price-continuity behavior.
contract PancakeTestnetDrill is Script {
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

        require(
            pancakeV3Factory.code.length > 0,
            "PANCAKE_FACTORY_NO_CODE"
        );
        require(
            positionManager.code.length > 0,
            "POSITION_MANAGER_NO_CODE"
        );

        vm.startBroadcast(deployerKey);

        MockUsdOracle oracle =
            new MockUsdOracle(deployer);

        MockQuoteToken mockUsdt =
            new MockQuoteToken(
                "Fortune Drill USD",
                "fUSD",
                18
            );

        FortuneAssetRegistry registry =
            new FortuneAssetRegistry(
                deployer
            );

        FortuneAssetRegistry.AssetConfig
            memory stableConfig =
                FortuneAssetRegistry
                    .AssetConfig({
                        oracle: address(oracle),
                        maxOracleAge: 1 hours,
                        quoteEnabled: true,
                        rewardEnabled: true,
                        graduationEnabled: true,
                        active: true,
                        category: "Fortune Testnet Drill"
                    });

        registry.configureAsset(
            address(mockUsdt),
            stableConfig
        );
        oracle.setPrice(
            address(mockUsdt),
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
        factory.setGraduationAdapter(
            address(adapter)
        );

        address[] memory quoteAssets =
            new address[](1);
        quoteAssets[0] =
            address(mockUsdt);

        uint16[] memory weights =
            new uint16[](1);
        weights[0] = 10_000;

        uint16[6] memory fees = [
            uint16(25),
            uint16(25),
            uint16(25),
            uint16(15),
            uint16(0),
            uint16(10)
        ];

        FortuneFactory.LaunchParams
            memory params =
                FortuneFactory
                    .LaunchParams({
                        name: "Fortune Testnet Drill",
                        symbol: "FDRILL",
                        totalSupply: 1_000_000_000e18,
                        quoteAssets: quoteAssets,
                        weightsBps: weights,
                        primaryQuote: address(mockUsdt),
                        basePriceUsd1e18: 1e15,
                        slopeUsd1e18: 1e6,
                        graduationUsd1e18: 1e18,
                        adaptiveGraduation: true,
                        feeBps: fees,
                        treasury: deployer,
                        metadataEditable: false,
                        description: "Fortune end-to-end BSC testnet graduation drill",
                        imageURI: "",
                        website: "",
                        xProfile: "",
                        telegram: "",
                        github: "",
                        youtube: "",
                        debox: ""
                    });

        (
            bytes32 vanitySalt,
            address predictedToken,
            ,
        ) = factory.previewPreparedVanity(
                deployer,
                params
            );

        FortuneFactory.LaunchInfo
            memory info =
                factory
                    .createLaunchPrepared(
                        params,
                        vanitySalt
                    );

        require(
            info.token ==
                predictedToken,
            "VANITY_PREVIEW_MISMATCH"
        );
        require(
            uint8(uint160(info.token)) ==
                0xfe,
            "BAD_VANITY_SUFFIX"
        );

        FortuneCurve curve =
            FortuneCurve(info.curve);

        // The drill can run immediately even while Launch Shield is active:
        // the deliberately tiny $1 graduation target and faucet-sized mock
        // input leave enough post-shield reserve to reach graduation.
        mockUsdt.faucet(250e18);
        mockUsdt.approve(
            address(curve),
            type(uint256).max
        );

        curve.buy(
            address(mockUsdt),
            250e18,
            1
        );

        require(
            curve.graduationReady(),
            "CURVE_NOT_READY"
        );

        uint24[] memory poolFees =
            new uint24[](1);
        poolFees[0] = 500;

        FortunePancakeV3GraduationAdapter
            .GraduationPlan
            memory plan =
                FortunePancakeV3GraduationAdapter
                    .GraduationPlan({
                        fees: poolFees,
                        maxSqrtPriceDeviationBps: 100,
                        maxDustBps: 100,
                        deadline: uint64(
                            block.timestamp +
                                20 minutes
                        )
                    });

        bool success =
            factory.finalizeGraduation(
                address(curve),
                abi.encode(plan)
            );

        require(
            success &&
                curve.graduated(),
            "GRADUATION_FAILED"
        );

        require(
            locker.lockedPositionCount() ==
                1,
            "LP_NOT_LOCKED"
        );

        uint256 positionTokenId =
            locker.lockedTokenIds(0);

        require(
            IPancakeV3PositionManagerLike(
                positionManager
            ).ownerOf(positionTokenId) ==
                address(locker),
            "LOCKER_NOT_POSITION_OWNER"
        );

        require(
            FortuneToken(info.token)
                .balanceOf(address(curve)) ==
                0,
            "CURVE_TOKEN_DUST"
        );
        require(
            mockUsdt.balanceOf(
                address(curve)
            ) == 0,
            "CURVE_QUOTE_DUST"
        );

        vm.stopBroadcast();

        console2.log(
            "FortuneFactory",
            address(factory)
        );
        console2.log(
            "FortuneAssetRegistry",
            address(registry)
        );
        console2.log(
            "FortunePancakeV3GraduationAdapter",
            address(adapter)
        );
        console2.log(
            "FortunePermanentLiquidityLocker",
            address(locker)
        );
        console2.log(
            "LaunchToken",
            info.token
        );
        console2.log(
            "FortuneCurve",
            info.curve
        );
        console2.log(
            "MockQuote",
            address(mockUsdt)
        );
        console2.log(
            "LPPositionTokenId",
            positionTokenId
        );
        console2.log(
            "GraduationAnchorUsd1e18",
            curve.graduationAnchorPriceUsd1e18()
        );
    }
}
