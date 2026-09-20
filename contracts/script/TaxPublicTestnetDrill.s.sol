// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {FortuneTaxFactory} from "../src/FortuneTaxFactory.sol";
import {FortuneCurve} from "../src/FortuneCurve.sol";
import {FortuneTaxToken} from "../src/FortuneTaxToken.sol";
import {FortuneTaxProcessor} from "../src/FortuneTaxProcessor.sol";
import {FortuneDividendVault} from "../src/FortuneDividendVault.sol";
import {FortunePoolRegistry} from "../src/FortunePoolRegistry.sol";
import {FortunePermanentV2LiquidityLocker} from "../src/FortunePermanentV2LiquidityLocker.sol";
import {FortunePancakeV2TaxGraduationAdapter} from "../src/FortunePancakeV2TaxGraduationAdapter.sol";
import {MockQuoteToken} from "../src/test/MockQuoteToken.sol";

interface IPancakeV2SwapRouterDrill {
    function swapExactTokensForTokensSupportingFeeOnTransferTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external;
}

/// @notice Runs a complete real BSC Testnet lifecycle against an already deployed
///         Fortune public tax stack: atomic creator first-buy, curve tax,
///         Pancake V2 graduation, permanent LP lock, post-graduation sell tax,
///         tax processing, burn and holder-dividend epoch creation.
contract TaxPublicTestnetDrill is Script {
    function run() external {
        require(
            block.chainid == 97,
            "BSC_TESTNET_ONLY"
        );

        uint256 deployerKey =
            vm.envUint("PRIVATE_KEY");
        address deployer =
            vm.addr(deployerKey);

        FortuneTaxFactory taxFactory =
            FortuneTaxFactory(
                vm.envAddress(
                    "FORTUNE_TAX_FACTORY"
                )
            );
        MockQuoteToken mockUsd =
            MockQuoteToken(
                vm.envAddress(
                    "FORTUNE_MOCK_QUOTE"
                )
            );
        FortunePoolRegistry poolRegistry =
            FortunePoolRegistry(
                vm.envAddress(
                    "FORTUNE_POOL_REGISTRY"
                )
            );
        FortunePermanentV2LiquidityLocker locker =
            FortunePermanentV2LiquidityLocker(
                vm.envAddress(
                    "FORTUNE_V2_LOCKER"
                )
            );
        FortunePancakeV2TaxGraduationAdapter adapter =
            FortunePancakeV2TaxGraduationAdapter(
                vm.envAddress(
                    "FORTUNE_V2_TAX_ADAPTER"
                )
            );
        address pancakeV2Router =
            vm.envAddress(
                "PANCAKE_V2_ROUTER"
            );

        require(
            address(taxFactory).code.length > 0 &&
                address(mockUsd).code.length > 0 &&
                address(poolRegistry).code.length > 0 &&
                address(locker).code.length > 0 &&
                address(adapter).code.length > 0 &&
                pancakeV2Router.code.length > 0,
            "MISSING_TESTNET_CODE"
        );

        require(
            !taxFactory.launchesPaused(),
            "TAX_FACTORY_PAUSED"
        );
        require(
            taxFactory.graduationAdapter() ==
                address(adapter),
            "WRONG_TAX_ADAPTER"
        );

        vm.startBroadcast(
            deployerKey
        );

        mockUsd.faucet(
            500e18
        );

        uint16[6] memory baseFees = [
            uint16(25),
            uint16(25),
            uint16(25),
            uint16(15),
            uint16(0),
            uint16(10)
        ];

        uint16[7] memory taxAllocation = [
            uint16(2_000), // creator
            uint16(1_000), // direct burn
            uint16(2_000), // holder dividends
            uint16(2_000), // buyback + burn
            uint16(1_500), // liquidity reinforcement
            uint16(500),   // community treasury
            uint16(1_000)  // protocol
        ];

        FortuneTaxFactory
            .TaxLaunchParams
            memory params =
                FortuneTaxFactory
                    .TaxLaunchParams({
                        name: "Fortune Tax Drill",
                        symbol: "FTAX",
                        totalSupply: 1_000_000_000e18,
                        quoteAsset: address(mockUsd),
                        basePriceUsd1e18: 1e15,
                        slopeUsd1e18: 1e6,
                        graduationUsd1e18: 1e18,
                        feeBps: baseFees,
                        treasury: deployer,
                        buyTaxBps: 200,
                        sellTaxBps: 300,
                        antiFarmerDuration: 30 days,
                        minimumDividendBalance: 100e18,
                        taxAllocationBps: taxAllocation,
                        description: "Fortune real BSC testnet tax-token lifecycle drill",
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
        ) = taxFactory
                .previewPreparedVanity(
                    deployer,
                    params
                );

        require(
            uint8(
                uint160(
                    predictedToken
                )
            ) == 0xfe,
            "BAD_VANITY_PREVIEW"
        );

        uint256 initialPurchase =
            250e18;

        mockUsd.approve(
            address(taxFactory),
            initialPurchase
        );

        (
            FortuneTaxFactory.LaunchInfo
                memory info,
            uint256 initialTokens
        ) = taxFactory
                .createLaunchPreparedAndBuy(
                    params,
                    vanitySalt,
                    initialPurchase,
                    1
                );

        require(
            info.token ==
                predictedToken,
            "TOKEN_PREVIEW_MISMATCH"
        );
        require(
            initialTokens > 0 &&
                FortuneTaxToken(
                    info.token
                ).balanceOf(
                    deployer
                ) >=
                initialTokens,
            "INITIAL_BUY_FAILED"
        );

        FortuneCurve curve =
            FortuneCurve(
                info.curve
            );

        require(
            curve.graduationReady(),
            "CURVE_NOT_READY"
        );
        require(
            FortuneTaxProcessor(
                info.taxProcessor
            ).totalCurveTaxRecorded() >
                0,
            "CURVE_TAX_NOT_RECORDED"
        );

        FortunePancakeV2TaxGraduationAdapter
            .GraduationPlan
            memory plan =
                FortunePancakeV2TaxGraduationAdapter
                    .GraduationPlan({
                        maxDustBps: 100,
                        deadline: uint64(
                            block.timestamp +
                                20 minutes
                        )
                    });

        bool graduated =
            taxFactory
                .finalizeGraduation(
                    address(curve),
                    abi.encode(plan)
                );

        require(
            graduated &&
                curve.graduated(),
            "TAX_GRADUATION_FAILED"
        );

        FortuneTaxToken token =
            FortuneTaxToken(
                info.token
            );

        address officialPool =
            token.officialPool();

        require(
            officialPool != address(0) &&
                officialPool.code.length > 0,
            "OFFICIAL_POOL_MISSING"
        );
        require(
            token.antiFarmerActive(),
            "ANTI_FARMER_NOT_ACTIVE"
        );
        require(
            poolRegistry
                .isRecognizedPool(
                    officialPool
                ),
            "POOL_NOT_RECOGNIZED"
        );
        require(
            locker.lockedPairCount() >
                0,
            "V2_LP_NOT_LOCKED"
        );

        FortunePermanentV2LiquidityLocker
            .LockedPair
            memory locked =
                locker.lockedPair(
                    officialPool
                );

        require(
            locked.registered &&
                locked.launchToken ==
                    info.token &&
                locked.quoteAsset ==
                    address(mockUsd) &&
                locked.lpAmount > 0,
            "BAD_V2_LOCK"
        );

        uint256 deployerTokens =
            token.balanceOf(
                deployer
            );
        uint256 sellAmount =
            deployerTokens /
            20;

        require(
            sellAmount > 0,
            "NO_POST_GRAD_TOKENS"
        );

        token.approve(
            pancakeV2Router,
            sellAmount
        );

        address[] memory path =
            new address[](2);
        path[0] =
            info.token;
        path[1] =
            address(mockUsd);

        IPancakeV2SwapRouterDrill(
            pancakeV2Router
        )
            .swapExactTokensForTokensSupportingFeeOnTransferTokens(
                sellAmount,
                0,
                path,
                deployer,
                block.timestamp +
                    20 minutes
            );

        FortuneTaxProcessor processor =
            FortuneTaxProcessor(
                info.taxProcessor
            );

        require(
            IERC20(info.token)
                .balanceOf(
                    info.taxProcessor
                ) > 0,
            "DEX_TAX_NOT_CAPTURED"
        );

        processor
            .processDexTaxTokens(
                0,
                block.timestamp +
                    20 minutes
            );

        require(
            processor
                .totalDexTaxTokensProcessed() >
                0,
            "DEX_TAX_NOT_PROCESSED"
        );
        require(
            processor
                .totalTokensBurned() >
                0,
            "DIRECT_BURN_NOT_PROCESSED"
        );

        processor
            .dispatchNonMarket();

        require(
            FortuneDividendVault(
                info.dividendVault
            ).epochCount() >
                0,
            "DIVIDEND_EPOCH_MISSING"
        );

        vm.stopBroadcast();

        console2.log(
            "TAX_ONCHAIN_EXECUTION_COMPLETE_AND_SUCCESSFUL"
        );
        console2.log(
            "FortuneTaxFactory",
            address(taxFactory)
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
            "TaxProcessor",
            info.taxProcessor
        );
        console2.log(
            "DividendVault",
            info.dividendVault
        );
        console2.log(
            "OfficialPancakeV2Pool",
            officialPool
        );
        console2.log(
            "LockedLpAmount",
            locked.lpAmount
        );
        console2.log(
            "CurveTaxRecorded",
            processor.totalCurveTaxRecorded()
        );
        console2.log(
            "DexTaxTokensProcessed",
            processor.totalDexTaxTokensProcessed()
        );
        console2.log(
            "TokensBurned",
            processor.totalTokensBurned()
        );
    }
}
