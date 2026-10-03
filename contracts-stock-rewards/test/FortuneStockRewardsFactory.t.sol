// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {FortuneAssetRegistry} from "fortune/FortuneAssetRegistry.sol";
import {FortuneCurve} from "fortune/FortuneCurve.sol";
import {FortuneFeeRouter} from "fortune/FortuneFeeRouter.sol";
import {FortunePancakeV3GraduationAdapter} from "fortune/FortunePancakeV3GraduationAdapter.sol";
import {FortunePermanentLiquidityLocker} from "fortune/FortunePermanentLiquidityLocker.sol";
import {FortuneCurveDeployer} from "fortune/deployers/FortuneCurveDeployer.sol";
import {FortuneFeeRouterDeployer} from "fortune/deployers/FortuneFeeRouterDeployer.sol";
import {FortuneStockRewardsFactory} from "../src/FortuneStockRewardsFactory.sol";
import {FortuneStockRewardsToken} from "../src/FortuneStockRewardsToken.sol";
import {FortuneStockRewardsTokenDeployer} from "../src/FortuneStockRewardsTokenDeployer.sol";
import {FortuneTestStock} from "../src/testnet/FortuneTestStock.sol";
import {MockV3Pool} from "./mocks/MockPancake.sol";
import {StockRewardsBase} from "./StockRewardsBase.sol";

contract FortuneStockRewardsFactoryTest is StockRewardsBase {
    // ------------------------------------------------------------- launch

    function testLaunchWiresTheStandardStackToTheRewardsToken() public {
        address[] memory stocks = stocks3(tsla, nvda, aapl);
        FortuneStockRewardsFactory.LaunchParams memory p = params(stocks);
        (FortuneStockRewardsToken token, FortuneCurve curve) = launch(p);

        FortuneStockRewardsFactory.Launch memory l = factory.launchAt(0);
        assertEq(l.creator, creator);
        assertEq(l.token, address(token));
        assertEq(l.curve, address(curve));
        assertEq(l.graduationUsd1e18, TARGET);
        assertEq(l.creatorFeeBps, 50);
        assertEq(l.holderFeeBps, 75);
        assertEq(l.poolFee, 10_000);
        assertEq(factory.launchCount(), 1);
        assertEq(factory.curveIndexPlusOne(address(curve)), 1);
        assertEq(factory.curveForToken(address(token)), address(curve));
        assertEq(factory.launchForToken(address(token)).curve, address(curve));
        assertEq(factory.liquidityVaultForCurve(address(curve)), address(token));
        assertEq(factory.metadataOf(address(token)).imageURI, p.imageURI);

        // The whole supply sits in the curve, which earns nothing.
        assertEq(token.totalSupply(), factory.TOTAL_SUPPLY());
        assertEq(token.balanceOf(address(curve)), factory.TOTAL_SUPPLY());
        assertEq(token.eligibleSupply(), 0);
        assertTrue(token.isExcluded(address(curve)));
        assertTrue(token.isExcluded(address(factory)));
        assertTrue(token.isExcluded(address(adapter)));
        assertEq(token.factory(), address(factory));
        assertEq(token.pancakeV3Factory(), address(v3));
        assertEq(token.pancakeV2Factory(), address(v2));
        address[] memory rewards = token.rewardAssets();
        for (uint256 i; i < 3; ++i) {
            assertEq(rewards[i], stocks[i]);
        }

        FortuneFeeRouter router = FortuneFeeRouter(l.feeRouter);
        assertEq(router.curve(), address(curve));
        assertEq(router.creator(), creator);
        assertEq(router.holderVault(), address(token));
        assertEq(router.protocolTreasury(), treasury);
        assertEq(router.creatorBps(), 50);
        assertEq(router.holderBps(), 75);
        assertEq(router.protocolBps(), 50);
        assertEq(router.totalFeeBps(), 175);

        (uint256 base, uint256 slope, bool ok) = factory.curveEconomics(TARGET);
        assertTrue(ok);
        assertEq(curve.factory(), address(factory));
        assertEq(address(curve.launchToken()), address(token));
        assertEq(address(curve.feeRouter()), address(router));
        assertEq(curve.shieldVault(), treasury);
        assertEq(curve.basePriceUsd1e18(), base);
        assertEq(curve.slopeUsd1e18(), slope);
        assertEq(curve.graduationUsd1e18(), TARGET);
        // Always a fixed basket: every stock gets its share and its own pool.
        assertFalse(curve.adaptiveGraduation());
        assertEq(curve.fixedWeightBps(stocks[0]), 3_333);
        assertEq(curve.fixedWeightBps(stocks[2]), 3_334);
        assertEq(curve.quoteAssetCount(), 3);
        for (uint256 i; i < 3; ++i) {
            assertEq(curve.quoteAssets(i), stocks[i]);
        }
    }

    function testCurveShapeAtTheTarget() public view {
        (uint256 base, uint256 slope, bool ok) = factory.curveEconomics(10_000e18);
        assertTrue(ok);
        // At a $10,000 target: opening fully diluted value about $3,306, ten times that at the target.
        assertApproxEqRel(base * 1e9, 3_305.785e18, 1e15);
        uint256 endPrice = base + slope * factory.CURVE_SALE() / 1e18;
        assertApproxEqRel(endPrice, base * 10, 1e15);
    }

    function testCurveEconomicsFitEveryTarget(uint256 target) public view {
        target = bound(target, factory.MIN_GRADUATION_USD(), factory.MAX_GRADUATION_USD());
        (uint256 base, uint256 slope, bool ok) = factory.curveEconomics(target);
        assertTrue(ok);
        assertGt(base, 0);
        assertGt(slope, 0);
    }

    function testPoolPriceRangeNeedsHigherTargetsForLowDecimalStocks() public view {
        (uint256 base, uint256 slope,) = factory.curveEconomics(10_000e18);
        uint256 price10k = base + slope * factory.CURVE_SALE() / 1e18;
        (base, slope,) = factory.curveEconomics(50_000e18);
        uint256 price50k = base + slope * factory.CURVE_SALE() / 1e18;
        // An 18-decimal stock fits anywhere; a 6-decimal $230 stock needs about $15,000.
        assertTrue(factory.poolPriceFits(230e18, 18, price10k));
        assertFalse(factory.poolPriceFits(230e18, 6, price10k));
        assertTrue(factory.poolPriceFits(230e18, 6, price50k));
        assertTrue(factory.poolPriceFits(190e18, 8, price10k));
        assertFalse(factory.poolPriceFits(0, 18, price10k));
        assertFalse(factory.poolPriceFits(230e18, 37, price10k));
    }

    function testPreflightReasons() public {
        address[] memory stocks = stocks2(tsla, aapl);
        FortuneStockRewardsFactory.LaunchParams memory p = params(stocks);
        expectReason(p, "OK");

        vm.prank(owner);
        factory.setLaunchesPaused(true);
        expectReason(p, "LAUNCHES_PAUSED");
        vm.prank(owner);
        factory.setLaunchesPaused(false);

        p = params(stocks);
        p.name = "";
        expectReason(p, "BAD_NAME_LENGTH");
        p = params(stocks);
        p.symbol = "SEVENTEEN_LETTERS";
        expectReason(p, "BAD_SYMBOL_LENGTH");
        p = params(stocks);
        p.description = string(new bytes(1025));
        expectReason(p, "DESCRIPTION_TOO_LONG");
        p = params(stocks);
        p.website = string(new bytes(257));
        expectReason(p, "METADATA_TOO_LONG");

        expectReason(params(new address[](0)), "BAD_STOCK_COUNT");
        address[] memory six = new address[](6);
        expectReason(params(six), "BAD_STOCK_COUNT");
        p = params(stocks);
        p.weightsBps = equalWeights(3);
        expectReason(p, "BAD_WEIGHT_LENGTH");
        expectReason(params(stocks2(tsla, FortuneTestStock(address(0)))), "ZERO_STOCK");
        expectReason(params(stocks2(tsla, tsla)), "DUPLICATE_STOCK");

        FortuneTestStock unlisted = new FortuneTestStock("Unlisted", "UNL", 18, 1);
        expectReason(params(stocks2(tsla, unlisted)), "STOCK_NOT_APPROVED");
        configure(unlisted, true, false, true);
        expectReason(params(stocks2(tsla, unlisted)), "REWARDS_DISABLED");
        configure(unlisted, true, true, false);
        expectReason(params(stocks2(tsla, unlisted)), "GRADUATION_DISABLED");
        // Listed and enabled, but its oracle has no price.
        configure(unlisted, true, true, true);
        expectReason(params(stocks2(tsla, unlisted)), "ORACLE_REVERT");

        p = params(stocks);
        p.weightsBps[0] = 999;
        p.weightsBps[1] = 9_001;
        expectReason(p, "WEIGHT_TOO_LOW");
        // A 6-decimal stock needs a target high enough for its pool to be priced.
        p = params(stocks);
        p.graduationUsd1e18 = 10_000e18;
        expectReason(p, "POOL_PRICE_RANGE");
        p = params(stocks);
        p.weightsBps[0] = 5_001;
        expectReason(p, "BAD_WEIGHTS");
        p = params(stocks);
        p.graduationUsd1e18 = factory.MIN_GRADUATION_USD() - 1;
        expectReason(p, "TARGET_RANGE");
        p.graduationUsd1e18 = factory.MAX_GRADUATION_USD() + 1;
        expectReason(p, "TARGET_RANGE");
        p = params(stocks);
        p.creatorFeeBps = 101;
        expectReason(p, "CREATOR_FEE_TOO_HIGH");
        p = params(stocks);
        p.holderFeeBps = 24;
        expectReason(p, "HOLDER_FEE_RANGE");
        p.holderFeeBps = 251;
        expectReason(p, "HOLDER_FEE_RANGE");
        p = params(stocks);
        p.poolFee = 500;
        expectReason(p, "BAD_POOL_FEE");
    }

    function testUninitializedFactoryRefusesLaunches() public {
        FortuneStockRewardsFactory fresh = newFactory();
        (bool ready, bytes32 reason) = fresh.preflight(params(stocks2(tsla, aapl)));
        assertFalse(ready);
        assertEq(reason, bytes32("NOT_INITIALIZED"));
    }

    function testRefusesBscMainnet() public {
        vm.chainId(56);
        FortuneCurveDeployer curveDeployer = new FortuneCurveDeployer();
        FortuneFeeRouterDeployer routerDeployer = new FortuneFeeRouterDeployer();
        FortuneStockRewardsTokenDeployer tokenDeployer = new FortuneStockRewardsTokenDeployer();
        vm.expectRevert("TESTNET_ONLY");
        new FortuneStockRewardsFactory(
            owner,
            address(registry),
            address(curveDeployer),
            address(routerDeployer),
            address(tokenDeployer),
            address(v3),
            address(v2),
            treasury
        );
    }

    // -------------------------------------------------------------- trading

    function testBuysAndSellsInEveryStockPayHoldersInThatStock() public {
        address[] memory stocks = stocks3(tsla, nvda, aapl);
        (FortuneStockRewardsToken token, FortuneCurve curve) = launchOpen(stocks);

        uint256 tslaIn = amountForUsd(tsla, 1_000e18);
        uint256 aaplIn = amountForUsd(aapl, 600e18);
        uint256 nvdaIn = amountForUsd(nvda, 400e18);
        uint256 aliceTokens = buy(alice, curve, tsla, tslaIn);
        buy(bob, curve, aapl, aaplIn);
        buy(carol, curve, nvda, nvdaIn);

        // Each buy's 1.75% fee is split 50/75/50 in the stock it used.
        assertFeeSplit(token, tsla, tslaIn);
        assertFeeSplit(token, aapl, aaplIn);
        assertFeeSplit(token, nvda, nvdaIn);

        // A sell pays the same fee in the stock it is paid out in.
        uint256 tslaBefore = tsla.balanceOf(address(token));
        uint256 gross = sellGross(curve, tsla, aliceTokens / 2);
        sell(alice, curve, tsla, aliceTokens / 2);
        assertEq(tsla.balanceOf(address(token)) - tslaBefore, gross * 75 / 10_000);
        // The sell's fee arrived after its token transfer; it streams from the next sync.
        token.sync();

        skip(STREAM);
        address[3] memory holders = [alice, bob, carol];
        for (uint256 i; i < 3; ++i) {
            FortuneTestStock stock = FortuneTestStock(stocks[i]);
            uint256 total;
            for (uint256 h; h < 3; ++h) {
                total += token.claimableOf(address(stock), holders[h]);
            }
            // Everything the token received has been released, less rounding.
            assertApproxEqAbs(total, stock.balanceOf(address(token)), 3);
            assertGt(total, 0);
        }
        // Every holder earns all three stocks, whichever one they bought with.
        for (uint256 h; h < 3; ++h) {
            vm.prank(holders[h]);
            uint256[] memory paid = token.claim();
            for (uint256 i; i < 3; ++i) {
                assertGt(paid[i], 0);
            }
        }
    }

    function testLaunchShieldTaxGoesToTheProtocolNotHolders() public {
        (FortuneStockRewardsToken token, FortuneCurve curve) = launch(params(stocks2(tsla, aapl)));
        uint256 amountIn = amountForUsd(tsla, 50e18);
        buy(alice, curve, tsla, amountIn);
        // 99% at launch, then the 1.75% fee on what is left.
        uint256 shieldTax = amountIn * 9_900 / 10_000;
        uint256 fee = (amountIn - shieldTax) * 175 / 10_000;
        assertEq(tsla.balanceOf(address(token)), (amountIn - shieldTax) * 75 / 10_000);
        assertApproxEqAbs(tsla.balanceOf(treasury), shieldTax + fee * 50 / 175, 2);
    }

    function testCreatorCanHandTheirFeeToHolders() public {
        (FortuneStockRewardsToken token, FortuneCurve curve) = launchOpen(stocks2(tsla, aapl));
        FortuneFeeRouter router = FortuneFeeRouter(factory.launchAt(0).feeRouter);
        vm.prank(creator);
        router.surrenderCreatorFeesToHolders();
        uint256 amountIn = amountForUsd(tsla, 1_000e18);
        buy(alice, curve, tsla, amountIn);
        uint256 fee = amountIn * 175 / 10_000;
        assertEq(tsla.balanceOf(creator), 0);
        assertApproxEqAbs(tsla.balanceOf(address(token)), fee * 125 / 175, 2);
    }

    // ----------------------------------------------------------- graduation

    function testGraduationLocksOnePoolPerStockAndExcludesThem() public {
        address[] memory stocks = stocks2(tsla, aapl);
        (FortuneStockRewardsToken token, FortuneCurve curve) = launchOpen(stocks);
        fillToGraduation(curve, stocks, alice);
        uint256 supplyBefore = token.totalSupply();

        bytes memory wrongFee = plan(2, 2_500);
        vm.expectRevert(FortuneStockRewardsFactory.BadGraduationPlan.selector);
        factory.graduate(address(curve), wrongFee);
        bytes memory wrongLength = plan(1, 10_000);
        vm.expectRevert(FortuneStockRewardsFactory.BadGraduationPlan.selector);
        factory.graduate(address(curve), wrongLength);

        vm.prank(carol);
        assertTrue(graduate(curve));
        assertTrue(curve.graduated());
        (,,,, bool completed) = factory.graduationStatus(address(curve));
        assertTrue(completed);
        bytes memory again = plan(2, 10_000);
        vm.expectRevert(FortuneStockRewardsFactory.AlreadyGraduated.selector);
        factory.graduate(address(curve), again);

        uint256[] memory ids = factory.positionIds(address(token));
        assertEq(ids.length, 2);
        for (uint256 i; i < 2; ++i) {
            address pool = v3.getPool(address(token), stocks[i], 10_000);
            assertTrue(pool != address(0));
            assertTrue(token.isExcluded(pool));
            assertGt(token.balanceOf(pool), 0);
            assertGt(IERC20(stocks[i]).balanceOf(pool), 0);
            FortunePermanentLiquidityLocker.LockedPosition memory position = locker.position(ids[i]);
            assertTrue(position.registered);
            assertEq(position.feeRecipient, address(token));
            assertEq(npm.ownerOf(ids[i]), address(locker));
        }
        // Unsold inventory beyond the pools' share was burned, and only Alice earns.
        assertLt(token.totalSupply(), supplyBefore);
        assertEq(token.balanceOf(address(curve)), 0);
        assertEq(token.eligibleSupply(), token.balanceOf(alice));
    }

    function testGraduationDustIsStreamedOrBurned() public {
        address[] memory stocks = stocks2(tsla, aapl);
        (FortuneStockRewardsToken token, FortuneCurve curve) = launchOpen(stocks);
        fillToGraduation(curve, stocks, alice);
        // The position manager uses 99.9%, leaving 0.1% of each side with the adapter.
        npm.setUseBps(9_990);
        uint256 tslaBefore = tsla.balanceOf(address(token));
        (uint256 tokensForPools,) = curve.graduationSnapshot();
        uint256 supplyBefore = token.totalSupply();
        uint256 inventory = token.balanceOf(address(curve));
        assertTrue(graduate(curve));

        assertGt(tsla.balanceOf(address(token)), tslaBefore);
        assertEq(token.balanceOf(address(token)), 0);
        uint256 burned = supplyBefore - token.totalSupply();
        // The unsold excess plus the launch-token dust.
        assertGt(burned, inventory - tokensForPools);
        assertEq(token.balanceOf(address(adapter)), 0);
        assertEq(tsla.balanceOf(address(adapter)), 0);
        assertEq(aapl.balanceOf(address(adapter)), 0);
    }

    function testPoolFeesStreamToHoldersAndBurnTheTokenSide() public {
        address[] memory stocks = stocks2(tsla, aapl);
        (FortuneStockRewardsToken token, FortuneCurve curve) = launchOpen(stocks);
        buyUsd(bob, curve, tsla, 1_000e18);
        fillToGraduation(curve, stocks, alice);
        assertTrue(graduate(curve));
        skip(STREAM);
        vm.prank(alice);
        token.claim();
        vm.prank(bob);
        token.claim();

        // Swaps in the TSLA pool earned 10 TSLA and 1,000 launch tokens in fees.
        uint256 id = factory.positionIds(address(token))[0];
        MockV3Pool pool = MockV3Pool(v3.getPool(address(token), address(tsla), 10_000));
        deal(address(tsla), address(pool), tsla.balanceOf(address(pool)) + 10e18);
        vm.prank(alice);
        token.transfer(address(pool), 1_000e18);
        (uint256 fees0, uint256 fees1) =
            pool.token0() == address(tsla) ? (uint256(10e18), uint256(1_000e18)) : (uint256(1_000e18), uint256(10e18));
        npm.addFees(id, fees0, fees1);

        uint256 supplyBefore = token.totalSupply();
        vm.prank(carol);
        assertEq(factory.collectPoolFees(address(token)), 2);
        assertEq(token.totalSupply(), supplyBefore - 1_000e18);
        assertEq(token.previewRewardState(address(tsla)).streaming, 10e18);

        skip(STREAM);
        uint256 aliceShare = token.claimableOf(address(tsla), alice);
        uint256 bobShare = token.claimableOf(address(tsla), bob);
        assertApproxEqAbs(aliceShare + bobShare, 10e18, 2);
        assertApproxEqRel(
            aliceShare * token.balanceOf(bob), bobShare * token.balanceOf(alice), 1e12, "pro rata to balance"
        );
    }

    function testUnreadyGraduationAttemptsAreRecorded() public {
        (, FortuneCurve curve) = launchOpen(stocks2(tsla, aapl));
        buyUsd(alice, curve, tsla, 100e18);
        assertFalse(graduate(curve));
        (uint64 attempts, uint64 failures,, bytes32 code, bool completed) = factory.graduationStatus(address(curve));
        assertEq(attempts, 1);
        assertEq(failures, 1);
        assertTrue(code != bytes32(0));
        assertFalse(completed);
    }

    function testFixedBasketSplitsLiquidityByWeight() public {
        address[] memory stocks = stocks2(tsla, amzn);
        FortuneStockRewardsFactory.LaunchParams memory p = params(stocks);
        p.weightsBps[0] = 7_000;
        p.weightsBps[1] = 3_000;
        (FortuneStockRewardsToken token, FortuneCurve curve) = launch(p);
        skip(SHIELD_SECONDS);
        // TSLA alone cannot fill the target: its share caps at 70%, and the
        // rest of Alice's $45,000 comes back to her.
        uint256 tslaIn = amountForUsd(tsla, 45_000e18);
        buy(alice, curve, tsla, tslaIn);
        assertFalse(curve.graduationReady());
        // $35,000 net needs $35,623.41 gross at a 1.75% fee, so about $9,377 is refunded.
        assertApproxEqRel(tsla.balanceOf(alice), amountForUsd(tsla, 9_376.59e18), 1e14);
        // A full share takes no more.
        uint256 more = amountForUsd(tsla, 100e18);
        deal(address(tsla), bob, more);
        vm.startPrank(bob);
        tsla.approve(address(curve), more);
        vm.expectRevert("FIXED_ASSET_FILLED");
        curve.buy(address(tsla), more, 0);
        vm.stopPrank();
        buyUsd(bob, curve, amzn, 25_000e18);
        assertTrue(curve.graduationReady());
        assertTrue(graduate(curve));
        uint256[] memory ids = factory.positionIds(address(token));
        assertEq(ids.length, 2);
        uint256 tslaPoolTokens = token.balanceOf(v3.getPool(address(token), address(tsla), 10_000));
        uint256 amznPoolTokens = token.balanceOf(v3.getPool(address(token), address(amzn), 10_000));
        assertApproxEqRel(tslaPoolTokens * 3, amznPoolTokens * 7, 1e15);
    }

    function testRescueStillReturnsStocksIfGraduationNeverSucceeds() public {
        address[] memory stocks = stocks2(tsla, aapl);
        (FortuneStockRewardsToken token, FortuneCurve curve) = launchOpen(stocks);
        fillToGraduation(curve, stocks, alice);
        skip(7 days);
        curve.activateRescue();
        uint256 balance = token.balanceOf(alice);
        uint256[] memory minOut = new uint256[](2);
        vm.startPrank(alice);
        token.approve(address(curve), balance);
        uint256[] memory out = curve.rescueRedeem(balance, minOut);
        vm.stopPrank();
        assertGt(out[0], 0);
        assertGt(out[1], 0);
        // Holder rewards earned before the rescue are still Alice's to claim.
        vm.prank(alice);
        uint256[] memory paid = token.claim();
        assertGt(paid[0] + paid[1], 0);
    }

    // --------------------------------------------------------------- owner

    function testInitializeOnceWithMatchingContracts() public {
        vm.prank(owner);
        vm.expectRevert("ALREADY_INITIALIZED");
        factory.initialize(address(adapter), address(locker));

        FortuneStockRewardsFactory fresh = newFactory();
        vm.prank(alice);
        vm.expectRevert();
        fresh.initialize(address(adapter), address(locker));
        // An adapter bound to another factory is refused.
        vm.prank(owner);
        vm.expectRevert("ADAPTER_MISMATCH");
        fresh.initialize(address(adapter), address(locker));

        FortunePermanentLiquidityLocker otherLocker = new FortunePermanentLiquidityLocker(address(factory), address(npm));
        FortunePancakeV3GraduationAdapter freshAdapter = new FortunePancakeV3GraduationAdapter(
            address(fresh), address(registry), address(v3), address(npm), address(otherLocker)
        );
        vm.prank(owner);
        vm.expectRevert("LOCKER_MISMATCH");
        fresh.initialize(address(freshAdapter), address(otherLocker));
    }

    function testProtocolRecipientChangesApplyToNewLaunchesOnly() public {
        (, FortuneCurve first) = launchOpen(stocks2(tsla, aapl));
        address newTreasury = makeAddr("newTreasury");
        vm.prank(alice);
        vm.expectRevert();
        factory.setProtocolFeeRecipient(newTreasury);
        vm.prank(owner);
        factory.setProtocolFeeRecipient(newTreasury);
        (, FortuneCurve second) = launchOpen(stocks2(tsla, aapl));
        assertEq(FortuneFeeRouter(factory.launchAt(0).feeRouter).protocolTreasury(), treasury);
        assertEq(first.shieldVault(), treasury);
        assertEq(FortuneFeeRouter(factory.launchAt(1).feeRouter).protocolTreasury(), newTreasury);
        assertEq(second.shieldVault(), newTreasury);
    }

    function testUnknownCurvesAndTokens() public {
        vm.expectRevert(FortuneStockRewardsFactory.UnknownCurve.selector);
        factory.graduate(alice, plan(1, 10_000));
        vm.expectRevert(FortuneStockRewardsFactory.UnknownCurve.selector);
        factory.liquidityVaultForCurve(alice);
        vm.expectRevert(FortuneStockRewardsFactory.UnknownToken.selector);
        factory.collectPoolFees(alice);
        vm.expectRevert(FortuneStockRewardsFactory.UnknownToken.selector);
        factory.launchForToken(alice);
    }

    function testLaunchListsAreNewestFirst() public {
        launch(params(stocks2(tsla, aapl)));
        launch(params(stocks2(nvda, aapl)));
        launch(params(stocks2(tsla, msft)));
        assertEq(factory.creatorLaunchCount(creator), 3);
        assertEq(factory.stockLaunchCount(address(aapl)), 2);
        uint256[] memory tslaIds = factory.launchIdsForStock(address(tsla), 0, 10);
        assertEq(tslaIds.length, 2);
        assertEq(tslaIds[0], 2);
        assertEq(tslaIds[1], 0);
        uint256[] memory page = factory.launchIdsForCreator(creator, 1, 1);
        assertEq(page.length, 1);
        assertEq(page[0], 1);
        assertEq(factory.launchIdsForCreator(creator, 5, 1).length, 0);
    }

    // ------------------------------------------------------------- helpers

    function expectReason(FortuneStockRewardsFactory.LaunchParams memory p, bytes32 expected) internal {
        (bool ready, bytes32 reason) = factory.preflight(p);
        assertEq(reason, expected);
        assertEq(ready, expected == bytes32("OK"));
        if (!ready) {
            vm.prank(creator);
            vm.expectRevert(abi.encodeWithSelector(FortuneStockRewardsFactory.LaunchPreflightFailed.selector, expected));
            factory.createLaunch(p);
        }
    }

    function configure(FortuneTestStock stock, bool quote, bool rewards, bool graduation) internal {
        vm.prank(owner);
        registry.configureAsset(
            address(stock),
            FortuneAssetRegistry.AssetConfig({
                oracle: address(oracle),
                maxOracleAge: 3600,
                quoteEnabled: quote,
                rewardEnabled: rewards,
                graduationEnabled: graduation,
                active: true,
                category: "stock"
            })
        );
    }

    function newFactory() internal returns (FortuneStockRewardsFactory) {
        return new FortuneStockRewardsFactory(
            owner,
            address(registry),
            address(new FortuneCurveDeployer()),
            address(new FortuneFeeRouterDeployer()),
            address(new FortuneStockRewardsTokenDeployer()),
            address(v3),
            address(v2),
            treasury
        );
    }

    function sellGross(FortuneCurve curve, FortuneTestStock stock, uint256 tokenAmount) internal view returns (uint256 gross) {
        (gross,,,) = curve.previewSell(address(stock), tokenAmount);
    }

    function assertFeeSplit(FortuneStockRewardsToken token, FortuneTestStock stock, uint256 amountIn) internal view {
        uint256 fee = amountIn * 175 / 10_000;
        assertEq(stock.balanceOf(address(token)), fee * 75 / 175, "holders");
        assertEq(stock.balanceOf(creator), fee * 50 / 175, "creator");
        assertEq(stock.balanceOf(treasury), fee - fee * 75 / 175 - fee * 50 / 175, "protocol");
    }
}
