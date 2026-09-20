// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {FortuneFactory} from "../FortuneFactory.sol";
import {FortuneTaxFactory} from "../FortuneTaxFactory.sol";
import {FortuneCurve} from "../FortuneCurve.sol";
import {FortuneToken} from "../FortuneToken.sol";
import {FortuneTaxToken} from "../FortuneTaxToken.sol";
import {FortuneTaxProcessor} from "../FortuneTaxProcessor.sol";
import {FortuneDividendVault} from "../FortuneDividendVault.sol";
import {FortunePoolRegistry} from "../FortunePoolRegistry.sol";
import {FortunePermanentLiquidityLocker} from "../FortunePermanentLiquidityLocker.sol";
import {FortunePermanentV2LiquidityLocker} from "../FortunePermanentV2LiquidityLocker.sol";
import {FortunePancakeV3GraduationAdapter} from "../FortunePancakeV3GraduationAdapter.sol";
import {FortunePancakeV2TaxGraduationAdapter} from "../FortunePancakeV2TaxGraduationAdapter.sol";
import {IPancakeV3PositionManagerLike} from "../interfaces/IPancakeV3PositionManagerLike.sol";
import {MockQuoteToken} from "./MockQuoteToken.sol";

interface IPancakeV2SwapRouterHarness {
    function swapExactTokensForTokensSupportingFeeOnTransferTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external;
}

/// @notice Onchain testnet-only lifecycle harness for Fortune standard tokens.
/// @dev Constructor reverts unless the full launch -> curve -> Pancake V3 ->
///      permanent LP-lock lifecycle succeeds against the supplied live stack.
contract FortuneStandardLifecycleHarness {
    address public immutable launchToken;
    address public immutable curve;
    uint256 public immutable lpTokenId;
    uint256 public immutable graduationAnchorUsd1e18;
    bool public immutable passed;

    constructor(
        address factory_,
        address mockQuote_,
        address locker_,
        address adapter_,
        address positionManager_
    ) {
        require(block.chainid == 97, "BSC_TESTNET_ONLY");

        FortuneFactory factory =
            FortuneFactory(factory_);
        MockQuoteToken mockQuote =
            MockQuoteToken(mockQuote_);
        FortunePermanentLiquidityLocker locker =
            FortunePermanentLiquidityLocker(locker_);

        require(
            factory.graduationAdapter() == adapter_,
            "WRONG_V3_ADAPTER"
        );

        mockQuote.faucet(500e18);

        address[] memory quoteAssets =
            new address[](1);
        quoteAssets[0] = mockQuote_;

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

        FortuneFactory.LaunchParams memory params =
            FortuneFactory.LaunchParams({
                name: "Fortune Standard Harness",
                symbol: "FHSTD",
                totalSupply: 1_000_000_000e18,
                quoteAssets: quoteAssets,
                weightsBps: weights,
                primaryQuote: mockQuote_,
                basePriceUsd1e18: 1e15,
                slopeUsd1e18: 1e6,
                graduationUsd1e18: 1e18,
                adaptiveGraduation: true,
                feeBps: fees,
                treasury: address(this),
                metadataEditable: false,
                description: "Fortune BSC testnet standard lifecycle harness",
                imageURI: "",
                website: "",
                xProfile: "",
                telegram: "",
                github: "",
                youtube: "",
                debox: ""
            });

        (
            bytes32 salt,
            address predictedToken,
            ,
        ) = factory.previewPreparedVanity(
            address(this),
            params
        );

        mockQuote.approve(
            factory_,
            250e18
        );

        uint256 lockCountBefore =
            locker.lockedPositionCount();

        (
            FortuneFactory.LaunchInfo memory info,
            uint256 tokensOut
        ) = factory.createLaunchPreparedAndBuy(
            params,
            salt,
            250e18,
            1
        );

        require(
            info.token == predictedToken &&
                uint8(uint160(info.token)) == uint8(0xfe),
            "BAD_STANDARD_TOKEN"
        );
        require(
            tokensOut > 0 &&
                FortuneToken(info.token).balanceOf(address(this)) >= tokensOut,
            "STANDARD_FIRST_BUY_FAILED"
        );

        FortuneCurve launchCurve =
            FortuneCurve(info.curve);

        require(
            launchCurve.graduationReady(),
            "STANDARD_NOT_READY"
        );

        uint24[] memory poolFees =
            new uint24[](1);
        poolFees[0] = 500;

        FortunePancakeV3GraduationAdapter.GraduationPlan memory plan =
            FortunePancakeV3GraduationAdapter.GraduationPlan({
                fees: poolFees,
                maxSqrtPriceDeviationBps: 100,
                maxDustBps: 100,
                deadline: uint64(block.timestamp + 20 minutes)
            });

        require(
            factory.finalizeGraduation(
                info.curve,
                abi.encode(plan)
            ),
            "STANDARD_GRADUATION_FALSE"
        );
        require(
            launchCurve.graduated(),
            "STANDARD_NOT_GRADUATED"
        );
        require(
            locker.lockedPositionCount() == lockCountBefore + 1,
            "STANDARD_LP_NOT_LOCKED"
        );

        uint256 tokenId =
            locker.lockedTokenIds(lockCountBefore);

        require(
            IPancakeV3PositionManagerLike(positionManager_)
                .ownerOf(tokenId) == locker_,
            "STANDARD_LOCKER_NOT_OWNER"
        );
        require(
            FortuneToken(info.token).balanceOf(info.curve) == 0 &&
                mockQuote.balanceOf(info.curve) == 0,
            "STANDARD_CURVE_DUST"
        );

        launchToken = info.token;
        curve = info.curve;
        lpTokenId = tokenId;
        graduationAnchorUsd1e18 =
            launchCurve.graduationAnchorPriceUsd1e18();
        passed = true;
    }
}

/// @notice Onchain testnet-only lifecycle harness for Fortune tax tokens.
/// @dev Constructor reverts unless launch, curve tax, Pancake V2 graduation,
///      permanent LP locking, DEX sell tax, processing, burn and dividend
///      dispatch all succeed against the supplied live stack.
contract FortuneTaxLifecycleHarness {
    address public immutable launchToken;
    address public immutable curve;
    address public immutable officialPool;
    address public immutable taxProcessor;
    address public immutable dividendVault;
    uint256 public immutable lockedLpAmount;
    uint256 public immutable curveTaxRecorded;
    uint256 public immutable dexTaxTokensProcessed;
    uint256 public immutable tokensBurned;
    bool public immutable passed;

    constructor(
        address taxFactory_,
        address mockQuote_,
        address poolRegistry_,
        address locker_,
        address adapter_,
        address pancakeV2Router_
    ) {
        require(block.chainid == 97, "BSC_TESTNET_ONLY");

        FortuneTaxFactory taxFactory =
            FortuneTaxFactory(taxFactory_);
        MockQuoteToken mockQuote =
            MockQuoteToken(mockQuote_);
        FortunePoolRegistry poolRegistry =
            FortunePoolRegistry(poolRegistry_);
        FortunePermanentV2LiquidityLocker locker =
            FortunePermanentV2LiquidityLocker(locker_);

        require(
            !taxFactory.launchesPaused(),
            "TAX_FACTORY_PAUSED"
        );
        require(
            taxFactory.graduationAdapter() == adapter_,
            "WRONG_TAX_ADAPTER"
        );

        mockQuote.faucet(500e18);

        uint16[6] memory baseFees = [
            uint16(25),
            uint16(25),
            uint16(25),
            uint16(15),
            uint16(0),
            uint16(10)
        ];

        uint16[7] memory taxAllocation = [
            uint16(2_000),
            uint16(1_000),
            uint16(2_000),
            uint16(2_000),
            uint16(1_500),
            uint16(500),
            uint16(1_000)
        ];

        FortuneTaxFactory.TaxLaunchParams memory params =
            FortuneTaxFactory.TaxLaunchParams({
                name: "Fortune Tax Harness",
                symbol: "FHTAX",
                totalSupply: 1_000_000_000e18,
                quoteAsset: mockQuote_,
                basePriceUsd1e18: 1e15,
                slopeUsd1e18: 1e6,
                graduationUsd1e18: 1e18,
                feeBps: baseFees,
                treasury: address(this),
                buyTaxBps: 200,
                sellTaxBps: 300,
                antiFarmerDuration: 30 days,
                minimumDividendBalance: 100e18,
                taxAllocationBps: taxAllocation,
                description: "Fortune BSC testnet tax lifecycle harness",
                imageURI: "",
                website: "",
                xProfile: "",
                telegram: "",
                github: "",
                youtube: "",
                debox: ""
            });

        (
            bytes32 salt,
            address predictedToken,
            ,
        ) = taxFactory.previewPreparedVanity(
            address(this),
            params
        );

        mockQuote.approve(
            taxFactory_,
            250e18
        );

        (
            FortuneTaxFactory.LaunchInfo memory info,
            uint256 initialTokens
        ) = taxFactory.createLaunchPreparedAndBuy(
            params,
            salt,
            250e18,
            1
        );

        require(
            info.token == predictedToken &&
                uint8(uint160(info.token)) == uint8(0xfe),
            "BAD_TAX_TOKEN"
        );
        require(
            initialTokens > 0 &&
                FortuneTaxToken(info.token)
                    .balanceOf(address(this)) >= initialTokens,
            "TAX_FIRST_BUY_FAILED"
        );

        FortuneCurve launchCurve =
            FortuneCurve(info.curve);
        FortuneTaxProcessor processor =
            FortuneTaxProcessor(info.taxProcessor);

        require(
            launchCurve.graduationReady(),
            "TAX_NOT_READY"
        );
        require(
            processor.totalCurveTaxRecorded() > 0,
            "CURVE_TAX_MISSING"
        );

        FortunePancakeV2TaxGraduationAdapter.GraduationPlan memory plan =
            FortunePancakeV2TaxGraduationAdapter.GraduationPlan({
                maxDustBps: 100,
                deadline: uint64(block.timestamp + 20 minutes)
            });

        require(
            taxFactory.finalizeGraduation(
                info.curve,
                abi.encode(plan)
            ),
            "TAX_GRADUATION_FALSE"
        );
        require(
            launchCurve.graduated(),
            "TAX_NOT_GRADUATED"
        );

        FortuneTaxToken token =
            FortuneTaxToken(info.token);
        address pool =
            token.officialPool();

        require(
            pool != address(0) &&
                pool.code.length > 0,
            "OFFICIAL_POOL_MISSING"
        );
        require(
            token.antiFarmerActive(),
            "ANTI_FARMER_NOT_ACTIVE"
        );
        require(
            poolRegistry.isRecognizedPool(pool),
            "POOL_NOT_RECOGNIZED"
        );

        FortunePermanentV2LiquidityLocker.LockedPair memory locked =
            locker.lockedPair(pool);

        require(
            locked.registered &&
                locked.launchToken == info.token &&
                locked.quoteAsset == mockQuote_ &&
                locked.lpAmount > 0,
            "BAD_V2_LOCK"
        );

        uint256 sellAmount =
            token.balanceOf(address(this)) / 20;
        require(
            sellAmount > 0,
            "NO_POST_GRAD_TOKENS"
        );

        token.approve(
            pancakeV2Router_,
            sellAmount
        );

        address[] memory path =
            new address[](2);
        path[0] = info.token;
        path[1] = mockQuote_;

        IPancakeV2SwapRouterHarness(pancakeV2Router_)
            .swapExactTokensForTokensSupportingFeeOnTransferTokens(
                sellAmount,
                0,
                path,
                address(this),
                block.timestamp + 20 minutes
            );

        require(
            IERC20(info.token).balanceOf(info.taxProcessor) > 0,
            "DEX_TAX_NOT_CAPTURED"
        );

        processor.processDexTaxTokens(
            0,
            block.timestamp + 20 minutes
        );

        require(
            processor.totalDexTaxTokensProcessed() > 0,
            "DEX_TAX_NOT_PROCESSED"
        );
        require(
            processor.totalTokensBurned() > 0,
            "BURN_NOT_PROCESSED"
        );

        processor.dispatchNonMarket();

        require(
            FortuneDividendVault(info.dividendVault)
                .epochCount() > 0,
            "DIVIDEND_EPOCH_MISSING"
        );

        launchToken = info.token;
        curve = info.curve;
        officialPool = pool;
        taxProcessor = info.taxProcessor;
        dividendVault = info.dividendVault;
        lockedLpAmount = locked.lpAmount;
        curveTaxRecorded =
            processor.totalCurveTaxRecorded();
        dexTaxTokensProcessed =
            processor.totalDexTaxTokensProcessed();
        tokensBurned =
            processor.totalTokensBurned();
        passed = true;
    }
}
