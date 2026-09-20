// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";

import {FortuneFactory} from "../src/FortuneFactory.sol";
import {FortuneCurve} from "../src/FortuneCurve.sol";
import {FortuneToken} from "../src/FortuneToken.sol";
import {FortunePancakeV3GraduationAdapter} from "../src/FortunePancakeV3GraduationAdapter.sol";
import {FortunePermanentLiquidityLocker} from "../src/FortunePermanentLiquidityLocker.sol";
import {IPancakeV3PositionManagerLike} from "../src/interfaces/IPancakeV3PositionManagerLike.sol";
import {MockQuoteToken} from "../src/test/MockQuoteToken.sol";

/// @notice Complete standard-token lifecycle against the persistent public
///         testnet stack, including the atomic creator first purchase.
contract StandardPublicTestnetDrill is Script {
    function run() external {
        require(
            block.chainid == 97,
            "BSC_TESTNET_ONLY"
        );

        uint256 deployerKey =
            vm.envUint("PRIVATE_KEY");
        address deployer =
            vm.addr(deployerKey);

        FortuneFactory factory =
            FortuneFactory(
                vm.envAddress(
                    "FORTUNE_FACTORY"
                )
            );
        MockQuoteToken mockUsd =
            MockQuoteToken(
                vm.envAddress(
                    "FORTUNE_MOCK_QUOTE"
                )
            );
        FortunePermanentLiquidityLocker locker =
            FortunePermanentLiquidityLocker(
                vm.envAddress(
                    "FORTUNE_V3_LOCKER"
                )
            );
        FortunePancakeV3GraduationAdapter adapter =
            FortunePancakeV3GraduationAdapter(
                vm.envAddress(
                    "FORTUNE_V3_ADAPTER"
                )
            );
        address positionManager =
            vm.envAddress(
                "PANCAKE_V3_POSITION_MANAGER"
            );

        require(
            address(factory).code.length > 0 &&
                address(mockUsd).code.length > 0 &&
                address(locker).code.length > 0 &&
                address(adapter).code.length > 0 &&
                positionManager.code.length > 0,
            "MISSING_TESTNET_CODE"
        );
        require(
            factory.graduationAdapter() ==
                address(adapter),
            "WRONG_V3_ADAPTER"
        );

        vm.startBroadcast(
            deployerKey
        );

        mockUsd.faucet(
            500e18
        );

        address[] memory quoteAssets =
            new address[](1);
        quoteAssets[0] =
            address(mockUsd);

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
                        name: "Fortune Standard Drill",
                        symbol: "FSTD",
                        totalSupply: 1_000_000_000e18,
                        quoteAssets: quoteAssets,
                        weightsBps: weights,
                        primaryQuote: address(mockUsd),
                        basePriceUsd1e18: 1e15,
                        slopeUsd1e18: 1e6,
                        graduationUsd1e18: 1e18,
                        adaptiveGraduation: true,
                        feeBps: fees,
                        treasury: deployer,
                        metadataEditable: true,
                        description: "Fortune standard public testnet lifecycle drill",
                        imageURI: "",
                        website: "https://fortune-rho-snowy.vercel.app",
                        xProfile: "",
                        telegram: "",
                        github: "https://github.com/shawkkkkk/fortune",
                        youtube: "",
                        debox: ""
                    });

        (
            bytes32 vanitySalt,
            address predictedToken,
            ,
        ) = factory
                .previewPreparedVanity(
                    deployer,
                    params
                );

        uint256 initialPurchase =
            250e18;

        mockUsd.approve(
            address(factory),
            initialPurchase
        );

        uint256 lockCountBefore =
            locker.lockedPositionCount();

        (
            FortuneFactory.LaunchInfo
                memory info,
            uint256 initialTokens
        ) = factory
                .createLaunchPreparedAndBuy(
                    params,
                    vanitySalt,
                    initialPurchase,
                    1
                );

        require(
            info.token ==
                predictedToken &&
                uint8(
                    uint160(
                        info.token
                    )
                ) == 0xfe,
            "BAD_STANDARD_TOKEN"
        );
        require(
            initialTokens > 0 &&
                FortuneToken(
                    info.token
                ).balanceOf(
                    deployer
                ) >=
                initialTokens,
            "STANDARD_INITIAL_BUY_FAILED"
        );

        FortuneCurve curve =
            FortuneCurve(
                info.curve
            );

        require(
            curve.graduationReady(),
            "STANDARD_CURVE_NOT_READY"
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

        bool graduated =
            factory
                .finalizeGraduation(
                    address(curve),
                    abi.encode(plan)
                );

        require(
            graduated &&
                curve.graduated(),
            "STANDARD_GRADUATION_FAILED"
        );

        require(
            locker.lockedPositionCount() ==
                lockCountBefore + 1,
            "STANDARD_LP_NOT_LOCKED"
        );

        uint256 tokenId =
            locker.lockedTokenIds(
                lockCountBefore
            );

        require(
            IPancakeV3PositionManagerLike(
                positionManager
            ).ownerOf(
                tokenId
            ) ==
                address(locker),
            "STANDARD_LOCKER_NOT_OWNER"
        );
        require(
            FortuneToken(info.token)
                .balanceOf(
                    address(curve)
                ) == 0 &&
                mockUsd.balanceOf(
                    address(curve)
                ) == 0,
            "STANDARD_CURVE_DUST"
        );

        vm.stopBroadcast();

        console2.log(
            "STANDARD_ONCHAIN_EXECUTION_COMPLETE_AND_SUCCESSFUL"
        );
        console2.log(
            "FortuneFactory",
            address(factory)
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
            "LPPositionTokenId",
            tokenId
        );
        console2.log(
            "GraduationAnchorUsd1e18",
            curve
                .graduationAnchorPriceUsd1e18()
        );
    }
}
