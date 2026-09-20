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

interface IPancakeV2SwapRouterOperator {
    function swapExactTokensForTokensSupportingFeeOnTransferTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external;
}

/// @notice Stateful BSC-testnet-only lifecycle operator.
/// @dev Each lifecycle stage is a separate transaction so every real test stays
///      below BSC's per-transaction gas cap. It is only for public-alpha proof.
contract FortunePublicLifecycleOperator {
    FortuneFactory public immutable standardFactory;
    FortuneTaxFactory public immutable taxFactory;
    MockQuoteToken public immutable mockQuote;
    FortunePoolRegistry public immutable poolRegistry;
    FortunePermanentLiquidityLocker public immutable v3Locker;
    FortunePermanentV2LiquidityLocker public immutable v2Locker;
    address public immutable v3Adapter;
    address public immutable v2Adapter;
    address public immutable pancakeV3PositionManager;
    address public immutable pancakeV2Router;

    address public standardToken;
    address public standardCurve;
    uint256 public standardLockIndex;
    uint256 public standardLpTokenId;
    uint256 public standardAnchor;
    bool public standardLaunchPassed;
    bool public standardGraduationPassed;

    address public taxToken;
    address public taxCurve;
    address public taxProcessor;
    address public taxDividendVault;
    address public taxPool;
    uint256 public taxLockedLp;
    bool public taxLaunchPassed;
    bool public taxFirstBuyPassed;
    bool public taxGraduationPassed;
    bool public taxSellPassed;

    constructor(
        address standardFactory_,
        address taxFactory_,
        address mockQuote_,
        address poolRegistry_,
        address v3Locker_,
        address v3Adapter_,
        address v2Locker_,
        address v2Adapter_,
        address pancakeV3PositionManager_,
        address pancakeV2Router_
    ) {
        require(block.chainid == 97, "BSC_TESTNET_ONLY");

        standardFactory = FortuneFactory(standardFactory_);
        taxFactory = FortuneTaxFactory(taxFactory_);
        mockQuote = MockQuoteToken(mockQuote_);
        poolRegistry = FortunePoolRegistry(poolRegistry_);
        v3Locker = FortunePermanentLiquidityLocker(v3Locker_);
        v2Locker = FortunePermanentV2LiquidityLocker(v2Locker_);
        v3Adapter = v3Adapter_;
        v2Adapter = v2Adapter_;
        pancakeV3PositionManager = pancakeV3PositionManager_;
        pancakeV2Router = pancakeV2Router_;

        require(
            standardFactory_.code.length > 0 &&
                taxFactory_.code.length > 0 &&
                mockQuote_.code.length > 0 &&
                poolRegistry_.code.length > 0 &&
                v3Locker_.code.length > 0 &&
                v3Adapter_.code.length > 0 &&
                v2Locker_.code.length > 0 &&
                v2Adapter_.code.length > 0 &&
                pancakeV3PositionManager_.code.length > 0 &&
                pancakeV2Router_.code.length > 0,
            "MISSING_CODE"
        );
        require(
            standardFactory.graduationAdapter() == v3Adapter_,
            "WRONG_V3_ADAPTER"
        );
        require(
            taxFactory.graduationAdapter() == v2Adapter_ &&
                !taxFactory.launchesPaused(),
            "WRONG_TAX_STACK"
        );
    }

    function runStandardLaunch()
        external
        returns (address token, address curve)
    {
        require(!standardLaunchPassed, "STANDARD_ALREADY_RUN");

        mockQuote.faucet(500e18);

        address[] memory quoteAssets = new address[](1);
        quoteAssets[0] = address(mockQuote);

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

        FortuneFactory.LaunchParams memory p =
            FortuneFactory.LaunchParams({
                name: "Fortune Standard Public Alpha",
                symbol: "FSTD",
                totalSupply: 1_000_000_000e18,
                quoteAssets: quoteAssets,
                weightsBps: weights,
                primaryQuote: address(mockQuote),
                basePriceUsd1e18: 1e15,
                slopeUsd1e18: 1e6,
                graduationUsd1e18: 1e18,
                adaptiveGraduation: true,
                feeBps: fees,
                treasury: address(this),
                metadataEditable: false,
                description: "Fortune real BSC testnet standard lifecycle proof",
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
        ) = standardFactory.previewPreparedVanity(address(this), p);

        standardLockIndex = v3Locker.lockedPositionCount();

        mockQuote.approve(address(standardFactory), 250e18);

        (
            FortuneFactory.LaunchInfo memory info,
            uint256 tokensOut
        ) = standardFactory.createLaunchPreparedAndBuy(
            p,
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
        require(
            FortuneCurve(info.curve).graduationReady(),
            "STANDARD_NOT_READY"
        );

        standardToken = info.token;
        standardCurve = info.curve;
        standardLaunchPassed = true;

        return (info.token, info.curve);
    }

    function runStandardGraduation()
        external
        returns (uint256 tokenId)
    {
        require(standardLaunchPassed, "STANDARD_LAUNCH_FIRST");
        require(!standardGraduationPassed, "STANDARD_GRAD_ALREADY_RUN");

        uint24[] memory fees = new uint24[](1);
        fees[0] = 500;

        FortunePancakeV3GraduationAdapter.GraduationPlan memory plan =
            FortunePancakeV3GraduationAdapter.GraduationPlan({
                fees: fees,
                maxSqrtPriceDeviationBps: 100,
                maxDustBps: 100,
                deadline: uint64(block.timestamp + 20 minutes)
            });

        require(
            standardFactory.finalizeGraduation(
                standardCurve,
                abi.encode(plan)
            ),
            "STANDARD_GRADUATION_FALSE"
        );

        FortuneCurve curve = FortuneCurve(standardCurve);

        require(curve.graduated(), "STANDARD_NOT_GRADUATED");
        require(
            v3Locker.lockedPositionCount() == standardLockIndex + 1,
            "STANDARD_LP_NOT_LOCKED"
        );

        tokenId = v3Locker.lockedTokenIds(standardLockIndex);

        require(
            IPancakeV3PositionManagerLike(pancakeV3PositionManager)
                .ownerOf(tokenId) == address(v3Locker),
            "STANDARD_LOCKER_NOT_OWNER"
        );
        require(
            FortuneToken(standardToken).balanceOf(standardCurve) == 0 &&
                mockQuote.balanceOf(standardCurve) == 0,
            "STANDARD_CURVE_DUST"
        );

        standardLpTokenId = tokenId;
        standardAnchor = curve.graduationAnchorPriceUsd1e18();
        standardGraduationPassed = true;
    }

    function runTaxLaunch()
        external
        returns (address token, address curve)
    {
        require(!taxLaunchPassed, "TAX_ALREADY_RUN");

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

        FortuneTaxFactory.TaxLaunchParams memory p =
            FortuneTaxFactory.TaxLaunchParams({
                name: "Fortune Tax Public Alpha",
                symbol: "FTAX",
                totalSupply: 1_000_000_000e18,
                quoteAsset: address(mockQuote),
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
                description: "Fortune real BSC testnet tax lifecycle proof",
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
        ) = taxFactory.previewPreparedVanity(address(this), p);

        FortuneTaxFactory.LaunchInfo memory info =
            taxFactory.createLaunchPrepared(
                p,
                salt
            );

        require(
            info.token == predictedToken &&
                uint8(uint160(info.token)) == uint8(0xfe),
            "BAD_TAX_TOKEN"
        );

        taxToken = info.token;
        taxCurve = info.curve;
        taxProcessor = info.taxProcessor;
        taxDividendVault = info.dividendVault;
        taxLaunchPassed = true;

        return (info.token, info.curve);
    }

    function runTaxFirstBuy()
        external
        returns (uint256 tokensOut)
    {
        require(taxFirstBuyPassed, "TAX_FIRST_BUY_FIRST");
        require(!taxFirstBuyPassed, "TAX_FIRST_BUY_ALREADY_RUN");

        mockQuote.faucet(500e18);
        mockQuote.approve(taxCurve, 250e18);

        uint256 beforeTokens =
            FortuneTaxToken(taxToken).balanceOf(address(this));

        tokensOut =
            FortuneCurve(taxCurve).buy(
                address(mockQuote),
                250e18,
                1
            );

        require(
            tokensOut > 0 &&
                FortuneTaxToken(taxToken).balanceOf(address(this)) >
                    beforeTokens,
            "TAX_FIRST_BUY_FAILED"
        );

        require(
            FortuneCurve(taxCurve).graduationReady(),
            "TAX_NOT_READY"
        );

        require(
            FortuneTaxProcessor(taxProcessor)
                .totalCurveTaxRecorded() > 0,
            "CURVE_TAX_MISSING"
        );

        taxFirstBuyPassed = true;
    }

    function runTaxGraduation()
        external
        returns (address pool)
    {
        require(taxLaunchPassed, "TAX_LAUNCH_FIRST");
        require(!taxGraduationPassed, "TAX_GRAD_ALREADY_RUN");

        FortunePancakeV2TaxGraduationAdapter.GraduationPlan memory plan =
            FortunePancakeV2TaxGraduationAdapter.GraduationPlan({
                maxDustBps: 100,
                deadline: uint64(block.timestamp + 20 minutes)
            });

        require(
            taxFactory.finalizeGraduation(
                taxCurve,
                abi.encode(plan)
            ),
            "TAX_GRADUATION_FALSE"
        );

        FortuneCurve curve = FortuneCurve(taxCurve);
        FortuneTaxToken token = FortuneTaxToken(taxToken);

        require(curve.graduated(), "TAX_NOT_GRADUATED");

        pool = token.officialPool();

        require(
            pool != address(0) && pool.code.length > 0,
            "OFFICIAL_POOL_MISSING"
        );
        require(token.antiFarmerActive(), "ANTI_FARMER_NOT_ACTIVE");
        require(poolRegistry.isRecognizedPool(pool), "POOL_NOT_RECOGNIZED");

        FortunePermanentV2LiquidityLocker.LockedPair memory locked =
            v2Locker.lockedPair(pool);

        require(
            locked.registered &&
                locked.launchToken == taxToken &&
                locked.quoteAsset == address(mockQuote) &&
                locked.lpAmount > 0,
            "BAD_V2_LOCK"
        );

        taxPool = pool;
        taxLockedLp = locked.lpAmount;
        taxGraduationPassed = true;
    }

    function runTaxOfficialPoolSell()
        external
        returns (uint256 sellAmount)
    {
        require(taxGraduationPassed, "TAX_GRAD_FIRST");
        require(!taxSellPassed, "TAX_SELL_ALREADY_RUN");

        FortuneTaxToken token = FortuneTaxToken(taxToken);
        sellAmount = token.balanceOf(address(this)) / 20;

        require(sellAmount > 0, "NO_POST_GRAD_TOKENS");

        token.approve(pancakeV2Router, sellAmount);

        address[] memory path = new address[](2);
        path[0] = taxToken;
        path[1] = address(mockQuote);

        IPancakeV2SwapRouterOperator(pancakeV2Router)
            .swapExactTokensForTokensSupportingFeeOnTransferTokens(
                sellAmount,
                0,
                path,
                address(this),
                block.timestamp + 20 minutes
            );

        require(
            IERC20(taxToken).balanceOf(taxProcessor) > 0,
            "DEX_TAX_NOT_CAPTURED"
        );

        taxSellPassed = true;
    }

    function verifyTaxProcessing()
        external
        view
        returns (
            uint256 curveTax,
            uint256 dexProcessed,
            uint256 burned,
            uint256 dividendEpochs
        )
    {
        FortuneTaxProcessor processor =
            FortuneTaxProcessor(taxProcessor);

        curveTax = processor.totalCurveTaxRecorded();
        dexProcessed = processor.totalDexTaxTokensProcessed();
        burned = processor.totalTokensBurned();
        dividendEpochs =
            FortuneDividendVault(taxDividendVault).epochCount();

        require(curveTax > 0, "NO_CURVE_TAX");
        require(dexProcessed > 0, "NO_DEX_PROCESSING");
        require(burned > 0, "NO_BURN");
        require(dividendEpochs > 0, "NO_DIVIDEND_EPOCH");
    }
}
