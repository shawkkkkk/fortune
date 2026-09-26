// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {CustomPairBase} from "./CustomPairBase.sol";
import {FortuneCustomPairFactory} from "../src/FortuneCustomPairFactory.sol";
import {FortuneCustomPairCurve} from "../src/FortuneCustomPairCurve.sol";
import {FortuneCustomPairToken} from "../src/FortuneCustomPairToken.sol";
import {MockPancakeV2Pair, MockPancakeV2PairLike, PairSwap} from "./mocks/MockPancakeV2.sol";
import {
    PlainToken,
    TaxToken,
    TaxOnTopToken,
    RebasingToken,
    PausableBlacklistToken,
    NoReturnToken,
    ReentrantToken,
    MaxWalletToken,
    PoolHijackToken
} from "./mocks/PairTokens.sol";

contract PoolTrader {
    function swapExactIn(address pool, address tokenIn, uint256 amountIn, address to) external returns (uint256) {
        return PairSwap.swapExactIn(MockPancakeV2PairLike(pool), tokenIn, amountIn, to);
    }
}

contract FortuneCustomPairTest is CustomPairBase {
    uint256 internal constant TARGET = 30e18;

    // ------------------------------------------------------------ creation

    function testLaunchCreatesPoolCatalogAndFullInventory() public {
        PlainToken pair = new PlainToken("STOCKB", 18);
        (FortuneCustomPairCurve curve, FortuneCustomPairToken token) = launch(address(pair), TARGET);

        assertEq(token.totalSupply(), SUPPLY);
        assertEq(token.balanceOf(address(curve)), SUPPLY);
        assertEq(token.curve(), address(curve));
        assertEq(token.pool(), pancake.getPair(address(token), address(pair)));
        assertEq(curve.pool(), token.pool());
        assertFalse(token.poolOpen());
        assertEq(curve.creator(), creator);
        assertEq(curve.creatorFeeRecipient(), creator);
        assertEq(curve.protocolFeeBps(), PROTOCOL_FEE_BPS);
        assertEq(curve.creatorFeeBps(), CREATOR_FEE_BPS);
        assertEq(curve.pairDecimals(), 18);
        assertEq(curve.virtualReserve(), TARGET / 3);
        assertEq(uint8(curve.phase()), uint8(FortuneCustomPairCurve.Phase.CurveActive));

        assertEq(factory.launchCount(), 1);
        FortuneCustomPairFactory.Launch memory record = factory.launchAt(0);
        assertEq(record.creator, creator);
        assertEq(record.token, address(token));
        assertEq(record.curve, address(curve));
        assertEq(record.pairToken, address(pair));
        assertEq(record.pool, curve.pool());
        assertEq(factory.curveIndexPlusOne(address(curve)), 1);
        assertEq(factory.curveForToken(address(token)), address(curve));
        assertEq(factory.pairLaunchCount(address(pair)), 1);
        assertEq(factory.launchIdsForCreator(creator, 0, 10)[0], 0);
        assertEq(factory.metadataOf(address(token)).description, "Paired with any BEP-20.");
    }

    function testCatalogPagesNewestFirst() public {
        PlainToken pair = new PlainToken("PAIR", 18);
        for (uint256 i; i < 5; ++i) launch(address(pair), TARGET);
        uint256[] memory page = factory.launchIdsForPair(address(pair), 1, 2);
        assertEq(page.length, 2);
        assertEq(page[0], 3);
        assertEq(page[1], 2);
        assertEq(factory.launchIdsForPair(address(pair), 5, 2).length, 0);
        assertEq(factory.launchIdsForPair(address(pair), 4, 10).length, 1);
    }

    function testPreflightReasons() public {
        PlainToken pair = new PlainToken("PAIR", 18);
        FortuneCustomPairFactory.LaunchParams memory p = params(address(pair), TARGET);
        bytes32 reason;

        (, reason) = factory.preflight(p);
        assertEq(reason, bytes32("OK"));

        p.supply = 1e18;
        (, reason) = factory.preflight(p);
        assertEq(reason, bytes32("SUPPLY_RANGE"));
        p.supply = SUPPLY;

        p.graduationTarget = 999;
        (, reason) = factory.preflight(p);
        assertEq(reason, bytes32("TARGET_RANGE"));
        p.graduationTarget = 2 ** 100 + 1;
        (, reason) = factory.preflight(p);
        assertEq(reason, bytes32("TARGET_RANGE"));
        p.graduationTarget = TARGET;

        p.creatorFeeBps = 101;
        (, reason) = factory.preflight(p);
        assertEq(reason, bytes32("CREATOR_FEE_TOO_HIGH"));
        p.creatorFeeBps = 0;

        p.symbol = "";
        (, reason) = factory.preflight(p);
        assertEq(reason, bytes32("BAD_SYMBOL_LENGTH"));
        p.symbol = "STONK";

        p.pairToken = alice;
        (, reason) = factory.preflight(p);
        assertEq(reason, bytes32("PAIR_NO_CODE"));

        p.pairToken = address(new NotAToken());
        (, reason) = factory.preflight(p);
        assertEq(reason, bytes32("PAIR_DECIMALS"));

        p.pairToken = address(new PlainToken("HUGE", 37));
        (, reason) = factory.preflight(p);
        assertEq(reason, bytes32("PAIR_DECIMALS"));
        p.pairToken = address(pair);

        vm.prank(owner);
        factory.setLaunchesPaused(true);
        (, reason) = factory.preflight(p);
        assertEq(reason, bytes32("LAUNCHES_PAUSED"));
        vm.prank(creator);
        vm.expectRevert(abi.encodeWithSelector(FortuneCustomPairFactory.LaunchPreflightFailed.selector, bytes32("LAUNCHES_PAUSED")));
        factory.createLaunch(p);
    }

    function testCannotPairWithACurve() public {
        PlainToken pair = new PlainToken("PAIR", 18);
        (FortuneCustomPairCurve curve,) = launch(address(pair), TARGET);
        (bool ok, bytes32 reason,) = factory.checkPairToken(address(curve));
        assertFalse(ok);
        assertEq(reason, bytes32("PAIR_IS_CURVE"));
    }

    function testProtocolFeeChangesOnlyAffectNewLaunches() public {
        PlainToken pair = new PlainToken("PAIR", 18);
        (FortuneCustomPairCurve first,) = launch(address(pair), TARGET);
        vm.prank(owner);
        factory.setProtocolFee(100, bob);
        (FortuneCustomPairCurve second,) = launch(address(pair), TARGET);
        assertEq(first.protocolFeeBps(), PROTOCOL_FEE_BPS);
        assertEq(second.protocolFeeBps(), 100);

        vm.prank(owner);
        vm.expectRevert(bytes("FEE_TOO_HIGH"));
        factory.setProtocolFee(101, bob);

        vm.prank(alice);
        vm.expectRevert();
        factory.setProtocolFee(0, alice);
    }

    // ------------------------------------------------------------- trading

    function testBuyMatchesPreviewAndPricingFormula() public {
        PlainToken pair = new PlainToken("PAIR", 18);
        (FortuneCustomPairCurve curve, FortuneCustomPairToken token) = launchOpen(address(pair), TARGET);
        fund(address(pair), alice, 5e18);

        (uint256 used, uint256 refund, uint256 shield, uint256 fee, uint256 net, uint256 expectedOut) = curve.previewBuy(1e18);
        assertEq(used, 1e18);
        assertEq(refund, 0);
        assertEq(shield, 0);
        assertEq(fee, 1e18 * uint256(PROTOCOL_FEE_BPS + CREATOR_FEE_BPS) / 10_000);
        assertEq(net, 1e18 - fee);

        uint256 out = buyAs(alice, curve, 1e18);
        assertEq(out, expectedOut);
        assertEq(token.balanceOf(alice), out);
        assertEq(curve.reserve(), net);
        assertEq(curve.circulating(), out);

        // sold(R) = S * R / (a0 + R), rounded down.
        uint256 a0 = curve.virtualReserve();
        assertApproxEqAbs(out, SUPPLY * net / (a0 + net), 1);
        assertEq(pair.balanceOf(address(curve)), liabilities(curve));
    }

    function testTransferTaxOnTheWayInIsNeverCountedAsReserve() public {
        TaxToken pair = new TaxToken("TAX5", 18, 500);
        (FortuneCustomPairCurve curve,) = launchOpen(address(pair), TARGET);
        fund(address(pair), alice, 10e18);

        buyAs(alice, curve, 10e18);
        uint256 received = 9.5e18;
        uint256 fee = received * 50 / 10_000;
        assertEq(curve.reserve(), received - 2 * fee);
        assertEq(curve.protocolFeesOwed(), fee);
        assertEq(curve.creatorFeesOwed(), fee);
        assertEq(pair.balanceOf(address(curve)), received);
        assertEq(pair.balanceOf(pair.collector()), 0.5e18);
    }

    function testSellSlippageUsesAmountThatReachesTheSeller() public {
        TaxToken pair = new TaxToken("TAX10", 18, 1_000);
        (FortuneCustomPairCurve curve, FortuneCustomPairToken token) = launchOpen(address(pair), TARGET);
        fund(address(pair), alice, 10e18);
        uint256 tokens = buyAs(alice, curve, 10e18);

        (,, uint256 pairSent) = curve.previewSell(tokens);
        uint256 expectedDelivered = pairSent - pairSent * 1_000 / 10_000;

        vm.startPrank(alice);
        token.approve(address(curve), tokens);
        vm.expectRevert(FortuneCustomPairCurve.Slippage.selector);
        curve.sell(tokens, expectedDelivered + 1);
        uint256 delivered = curve.sell(tokens, expectedDelivered);
        vm.stopPrank();

        assertEq(delivered, expectedDelivered);
        assertEq(pair.balanceOf(alice), delivered);
        assertEq(curve.circulating(), 0);
        assertLe(curve.reserve(), 2, "only rounding dust remains");
        assertGe(pair.balanceOf(address(curve)), liabilities(curve));
    }

    function testRoundTripNeverProfits() public {
        PlainToken pair = new PlainToken("PAIR", 18);
        (FortuneCustomPairCurve curve,) = launchOpen(address(pair), TARGET);
        fund(address(pair), alice, 20e18);
        fund(address(pair), bob, 20e18);
        buyAs(bob, curve, 3e18);
        uint256 tokens = buyAs(alice, curve, 7e18);
        uint256 back = sellAs(alice, curve, tokens);
        assertLt(back, 7e18);
        assertEq(pair.balanceOf(alice), 20e18 - 7e18 + back);
    }

    function testCannotSellMoreThanCirculatingOrWhenClosed() public {
        PlainToken pair = new PlainToken("PAIR", 18);
        (FortuneCustomPairCurve curve,) = launchOpen(address(pair), TARGET);
        fund(address(pair), alice, 100e18);
        uint256 tokens = buyAs(alice, curve, 1e18);
        vm.prank(alice);
        vm.expectRevert(bytes("BAD_TOKEN_AMOUNT"));
        curve.sell(tokens + 1, 0);

        buyAs(alice, curve, 99e18);
        assertTrue(curve.graduationReady());
        vm.prank(alice);
        vm.expectRevert(FortuneCustomPairCurve.TradingClosed.selector);
        curve.sell(1, 0);
        vm.prank(alice);
        vm.expectRevert(FortuneCustomPairCurve.TradingClosed.selector);
        curve.buy(1, 0);
    }

    // -------------------------------------------------------- Launch Shield

    function testLaunchShieldDecayMatchesStandardCurve() public {
        PlainToken pair = new PlainToken("PAIR", 18);
        (FortuneCustomPairCurve curve,) = launch(address(pair), TARGET);
        // vm.getBlockTimestamp avoids via-ir re-reading TIMESTAMP after each warp.
        uint256 start = vm.getBlockTimestamp();
        uint16[6] memory expected = [uint16(9_900), 2_475, 309, 38, 4, 0];
        for (uint256 i; i < expected.length; ++i) {
            vm.warp(start + i);
            assertEq(curve.currentSnipeTaxBps(), expected[i]);
        }
    }

    function testShieldTaxStaysInCurveAndNeverMovesThePrice() public {
        PlainToken pair = new PlainToken("PAIR", 18);
        (FortuneCustomPairCurve curve,) = launch(address(pair), TARGET);
        fund(address(pair), alice, 1e18);
        uint256 priceBefore = curve.spotPriceX18();

        buyAs(alice, curve, 1e18);
        uint256 shield = 1e18 * 9_900 / 10_000;
        uint256 afterShield = 1e18 - shield;
        uint256 fee = afterShield * 50 / 10_000;
        assertEq(curve.shieldReserve(), shield);
        assertEq(curve.reserve(), afterShield - 2 * fee);
        assertEq(curve.creatorFeesOwed(), fee, "creator earns only the normal fee on the post-shield amount");
        assertGt(curve.spotPriceX18(), priceBefore);
        // Only the net 1% moved the curve.
        uint256 a0 = curve.virtualReserve();
        uint256 d = a0 + curve.reserve();
        assertEq(curve.spotPriceX18(), d * d * 1e36 / (SUPPLY * a0));
    }

    function testEarlyWalletCapForFifteenSeconds() public {
        PlainToken pair = new PlainToken("PAIR", 18);
        (FortuneCustomPairCurve curve,) = launch(address(pair), TARGET);
        vm.warp(block.timestamp + 6); // shield tax is zero, wallet cap still on
        fund(address(pair), alice, 10e18);
        vm.startPrank(alice);
        pair.approve(address(curve), 10e18);
        vm.expectRevert(bytes("LAUNCH_SHIELD_WALLET_CAP"));
        curve.buy(1e18, 0);
        curve.buy(0.1e18, 0);
        vm.warp(block.timestamp + 10);
        curve.buy(1e18, 0);
        vm.stopPrank();
        assertLe(curve.shieldPurchased(alice), SUPPLY * 200 / 10_000);
    }

    function testCreatorFirstBuyIsTaxedOnceAndShielded() public {
        TaxToken pair = new TaxToken("TAX10", 18, 1_000);
        fund(address(pair), creator, 10e18);
        vm.startPrank(creator);
        pair.approve(address(factory), 10e18);
        (address tokenAddress, address curveAddress, uint256 tokensOut) =
            factory.createLaunchAndBuy(params(address(pair), TARGET), 10e18, 1);
        vm.stopPrank();

        FortuneCustomPairCurve curve = FortuneCustomPairCurve(curveAddress);
        assertEq(pair.balanceOf(pair.collector()), 1e18, "one transfer tax, not two");
        assertEq(pair.balanceOf(curveAddress), 9e18);
        assertEq(IERC20(tokenAddress).balanceOf(creator), tokensOut);
        assertEq(curve.shieldReserve(), 9e18 * 9_900 / 10_000, "no creator exemption");
        assertEq(curve.tradeCount(), 1);

        vm.prank(address(factory));
        vm.expectRevert(bytes("ALREADY_TRADED"));
        curve.initialBuy(creator, 0);
        vm.prank(alice);
        vm.expectRevert(FortuneCustomPairCurve.OnlyFactory.selector);
        curve.initialBuy(alice, 0);
    }

    // ----------------------------------------------------------- graduation

    function testFinalBuyIsClampedAndRefunded() public {
        PlainToken pair = new PlainToken("PAIR", 18);
        (FortuneCustomPairCurve curve,) = launchOpen(address(pair), TARGET);
        fund(address(pair), alice, 100e18);
        buyAs(alice, curve, 100e18);

        assertTrue(curve.graduationReady());
        assertGe(curve.reserve(), TARGET);
        assertLe(curve.reserve() - TARGET, 2);
        uint256 spent = 100e18 - pair.balanceOf(alice);
        assertEq(spent, pair.balanceOf(address(curve)));
        assertApproxEqAbs(spent, TARGET * 10_000 / 9_900, 3);
    }

    function testGraduationSeedsPoolAtFinalCurvePriceAndBurnsLp() public {
        PlainToken pair = new PlainToken("PAIR", 18);
        (FortuneCustomPairCurve curve, FortuneCustomPairToken token) = launchOpen(address(pair), TARGET);
        fund(address(pair), alice, 100e18);
        buyAs(alice, curve, 100e18);
        uint256 finalPrice = curve.spotPriceX18();
        uint256 fees = curve.protocolFeesOwed() + curve.creatorFeesOwed();

        vm.prank(carol);
        uint256 liquidity = curve.graduate();

        MockPancakeV2Pair pool = MockPancakeV2Pair(curve.pool());
        assertTrue(token.poolOpen());
        assertEq(uint8(curve.phase()), uint8(FortuneCustomPairCurve.Phase.Graduated));
        assertEq(pool.balanceOf(curve.DEAD()), liquidity);
        assertEq(pool.balanceOf(address(curve)), 0);
        assertRelApprox(poolPriceX18(curve), finalPrice, 1, "pool opens at the curve price");
        assertEq(token.balanceOf(address(curve)), 0, "unsold inventory burned");
        assertEq(token.totalSupply(), curve.circulating() + token.balanceOf(address(pool)));
        assertEq(pair.balanceOf(address(curve)), fees, "only fees stay behind");
        assertEq(curve.reserve(), 0);

        // 75% of supply is sold at the target and the pool gets about 18.75%.
        assertApproxEqRel(curve.circulating(), SUPPLY * 3 / 4, 0.001e18);
        assertApproxEqRel(token.balanceOf(address(pool)), SUPPLY * 3 / 16, 0.001e18);

        vm.expectRevert(bytes("NOT_READY"));
        curve.graduate();
    }

    function testGraduationWithTaxedPairMatchesWhatThePoolReceived() public {
        TaxToken pair = new TaxToken("TAX7", 18, 700);
        (FortuneCustomPairCurve curve,) = launchOpen(address(pair), TARGET);
        fund(address(pair), alice, 100e18);
        buyAs(alice, curve, 100e18);
        uint256 finalPrice = curve.spotPriceX18();

        curve.graduate();
        assertRelApprox(poolPriceX18(curve), finalPrice, 1, "price continuity after the pool's own tax");
        assertEq(curve.graduationPairDelivered(), curve.graduationPairDelivered());
        assertGe(pair.balanceOf(address(curve)), curve.protocolFeesOwed() + curve.creatorFeesOwed());
    }

    function testShieldReserveBecomesExtraPoolDepthAtTheSamePrice() public {
        PlainToken pair = new PlainToken("PAIR", 18);
        (FortuneCustomPairCurve curve,) = launch(address(pair), TARGET);
        fund(address(pair), bob, 2e18);
        buyAs(bob, curve, 2e18); // 99% shield at second zero
        uint256 shield = curve.shieldReserve();
        assertGt(shield, 1.9e18);

        vm.warp(block.timestamp + 16);
        fund(address(pair), alice, 100e18);
        buyAs(alice, curve, 100e18);
        uint256 finalPrice = curve.spotPriceX18();
        curve.graduate();

        assertRelApprox(poolPriceX18(curve), finalPrice, 1, "shield adds depth, not a price jump");
        assertApproxEqAbs(curve.graduationPairDelivered(), curve.graduationPairDelivered(), 0);
        assertGe(curve.graduationPairDelivered(), TARGET + shield);
    }

    function testPoolIsLockedUntilGraduation() public {
        PlainToken pair = new PlainToken("PAIR", 18);
        (FortuneCustomPairCurve curve, FortuneCustomPairToken token) = launchOpen(address(pair), TARGET);
        fund(address(pair), alice, 11e18);
        uint256 tokens = buyAs(alice, curve, 10e18);
        address pool = curve.pool();

        vm.prank(alice);
        vm.expectRevert(FortuneCustomPairToken.PoolLockedUntilGraduation.selector);
        token.transfer(pool, tokens);

        vm.prank(alice);
        token.approve(bob, tokens);
        vm.prank(bob);
        vm.expectRevert(FortuneCustomPairToken.PoolLockedUntilGraduation.selector);
        token.transferFrom(alice, pool, tokens);

        vm.prank(alice);
        vm.expectRevert(FortuneCustomPairToken.OnlyCurve.selector);
        token.openPool();

        // Pair tokens alone cannot mint LP.
        vm.prank(alice);
        pair.transfer(pool, 1e18);
        vm.expectRevert();
        MockPancakeV2Pair(pool).mint(alice);
    }

    function testDonatedAndSyncedPoolCannotBlockGraduation() public {
        PlainToken pair = new PlainToken("PAIR", 18);
        (FortuneCustomPairCurve curve,) = launchOpen(address(pair), TARGET);
        address pool = curve.pool();
        fund(address(pair), carol, 5e18);
        vm.prank(carol);
        pair.transfer(pool, 5e18);
        MockPancakeV2Pair(pool).sync();

        fund(address(pair), alice, 100e18);
        buyAs(alice, curve, 100e18);
        uint256 finalPrice = curve.spotPriceX18();
        uint256 liquidity = curve.graduate();
        assertGt(liquidity, 0);
        // The donation stays in the pool as a gift to permanently burned LP.
        assertGt(poolPriceX18(curve), finalPrice);
    }

    function testPositiveRebaseAndDonationsJoinGraduationLiquidity() public {
        RebasingToken pair = new RebasingToken();
        (FortuneCustomPairCurve curve,) = launchOpen(address(pair), TARGET);
        pair.mint(alice, 100e18);
        buyAs(alice, curve, 100e18);
        uint256 finalPrice = curve.spotPriceX18();
        uint256 balanceBefore = pair.balanceOf(address(curve));
        pair.rebase(1.1e18);
        assertApproxEqRel(pair.balanceOf(address(curve)), balanceBefore * 11 / 10, 1e9);

        curve.graduate();
        assertRelApprox(poolPriceX18(curve), finalPrice, 1, "extra pair tokens add depth at the same price");
        assertApproxEqRel(curve.graduationPairDelivered(), (balanceBefore * 11 / 10) - (curve.protocolFeesOwed() + curve.creatorFeesOwed()), 1e12);
    }

    function testPostGraduationTradingWorksWithFeeOnTransferPair() public {
        TaxToken pair = new TaxToken("TAX5", 18, 500);
        (FortuneCustomPairCurve curve, FortuneCustomPairToken token) = launchOpen(address(pair), TARGET);
        fund(address(pair), alice, 100e18);
        buyAs(alice, curve, 100e18);
        curve.graduate();

        PoolTrader trader = new PoolTrader();
        fund(address(pair), address(trader), 1e18);
        uint256 out = trader.swapExactIn(curve.pool(), address(pair), 1e18, bob);
        assertGt(out, 0);
        assertEq(token.balanceOf(bob), out);

        vm.prank(bob);
        token.transfer(address(trader), out);
        uint256 back = trader.swapExactIn(curve.pool(), address(token), out, bob);
        assertGt(back, 0);
    }

    function testExcessAfterGraduationIsSweptIntoPool() public {
        PlainToken pair = new PlainToken("PAIR", 18);
        (FortuneCustomPairCurve curve,) = launchOpen(address(pair), TARGET);
        fund(address(pair), alice, 100e18);
        buyAs(alice, curve, 100e18);
        vm.expectRevert(bytes("NOT_GRADUATED"));
        curve.sweepExcessToPool();
        curve.graduate();

        vm.expectRevert(bytes("NO_EXCESS"));
        curve.sweepExcessToPool();
        fund(address(pair), address(curve), 1e18);
        uint256 priceBefore = poolPriceX18(curve);
        assertEq(curve.sweepExcessToPool(), 1e18);
        assertGt(poolPriceX18(curve), priceBefore);
        assertEq(pair.balanceOf(address(curve)), curve.protocolFeesOwed() + curve.creatorFeesOwed());
    }

    // ----------------------------------------------------------------- fees

    function testFeesArePulledAndBlacklistedRecipientCannotBlockTrading() public {
        PausableBlacklistToken pair = new PausableBlacklistToken();
        (FortuneCustomPairCurve curve, FortuneCustomPairToken token) = launchOpen(address(pair), TARGET);
        pair.mint(alice, 20e18);
        pair.setBlacklisted(creator, true);

        uint256 tokens = buyAs(alice, curve, 10e18);
        sellAs(alice, curve, tokens / 2);
        assertGt(curve.creatorFeesOwed(), 0);
        assertGt(token.balanceOf(alice), 0);

        vm.prank(creator);
        vm.expectRevert(bytes("BLACKLISTED"));
        curve.claimCreatorFees();

        address safe = makeAddr("creator-safe");
        vm.prank(alice);
        vm.expectRevert(bytes("ONLY_FEE_RECIPIENT"));
        curve.setCreatorFeeRecipient(alice);
        vm.prank(creator);
        curve.setCreatorFeeRecipient(safe);

        uint256 owed = curve.creatorFeesOwed();
        vm.prank(safe);
        assertEq(curve.claimCreatorFees(), owed);
        assertEq(pair.balanceOf(safe), owed);

        uint256 protocolOwed = curve.protocolFeesOwed();
        vm.prank(carol); // anyone can push protocol fees to the configured recipient
        curve.claimProtocolFees();
        assertEq(pair.balanceOf(treasury), protocolOwed);
        assertEq(pair.balanceOf(address(curve)), curve.reserve());
    }

    // --------------------------------------------------------------- rescue

    function testRescueAfterGraduationIsBlockedForSevenDays() public {
        PausableBlacklistToken pair = new PausableBlacklistToken();
        (FortuneCustomPairCurve curve, FortuneCustomPairToken token) = launchOpen(address(pair), TARGET);
        pair.mint(alice, 100e18);
        pair.mint(bob, 5e18);
        uint256 bobTokens = buyAs(bob, curve, 5e18);
        buyAs(alice, curve, 100e18);
        uint256 aliceTokens = token.balanceOf(alice);
        assertTrue(curve.graduationReady());

        pair.setPaused(true);
        vm.expectRevert(bytes("PAUSED"));
        curve.graduate();
        vm.expectRevert(bytes("NOT_RESCUABLE"));
        curve.activateRescue();

        vm.warp(block.timestamp + 7 days);
        curve.activateRescue();
        assertEq(uint8(curve.phase()), uint8(FortuneCustomPairCurve.Phase.Rescued));
        assertEq(token.balanceOf(address(curve)), 0, "inventory burned");
        pair.setPaused(false);

        uint256 pool = pair.balanceOf(address(curve));
        uint256 claims = curve.rescueHolderClaims() + curve.rescueProtocolClaims() + curve.rescueCreatorClaims();
        uint256 expectedBob = pool * (curve.rescueHolderClaims() * bobTokens / (bobTokens + aliceTokens)) / claims;

        vm.startPrank(bob);
        token.approve(address(curve), bobTokens);
        assertEq(curve.rescueRedeem(bobTokens, 0), expectedBob);
        vm.stopPrank();

        vm.startPrank(alice);
        token.approve(address(curve), aliceTokens);
        curve.rescueRedeem(aliceTokens, 0);
        vm.stopPrank();

        vm.prank(creator);
        curve.claimCreatorFees();
        curve.claimProtocolFees();
        assertLe(pair.balanceOf(address(curve)), 3, "everything paid out");
        assertEq(token.totalSupply(), 0);
    }

    function testNegativeRebaseHaltsTradingAndHoldersExitProRata() public {
        RebasingToken pair = new RebasingToken();
        (FortuneCustomPairCurve curve, FortuneCustomPairToken token) = launchOpen(address(pair), TARGET);
        pair.mint(alice, 10e18);
        pair.mint(bob, 10e18);
        uint256 aliceTokens = buyAs(alice, curve, 10e18);
        uint256 bobTokens = buyAs(bob, curve, 10e18);

        vm.expectRevert(bytes("NOT_RESCUABLE"));
        curve.activateRescue();

        pair.rebase(0.8e18);
        vm.startPrank(alice);
        token.approve(address(curve), aliceTokens);
        vm.expectRevert(bytes("PAIR_RESERVE_SHORTFALL"));
        curve.sell(aliceTokens, 0);
        vm.stopPrank();

        curve.activateRescue();
        assertEq(curve.protocolFeesOwed() + curve.creatorFeesOwed(), 0, "fees absorbed the loss first");
        assertEq(curve.rescueProtocolClaims() + curve.rescueCreatorClaims(), 0);

        uint256 held = pair.balanceOf(address(curve));
        vm.prank(alice);
        uint256 aliceOut = curve.rescueRedeem(aliceTokens, 0);
        vm.startPrank(bob);
        token.approve(address(curve), bobTokens);
        uint256 bobOut = curve.rescueRedeem(bobTokens, 0);
        vm.stopPrank();

        assertApproxEqAbs(aliceOut + bobOut, held, 2);
        assertApproxEqRel(aliceOut * bobTokens, bobOut * aliceTokens, 1e12, "pro rata by tokens");
    }

    function testSmallShortfallIsAbsorbedByShieldAndFeesFirst() public {
        RebasingToken pair = new RebasingToken();
        (FortuneCustomPairCurve curve,) = launch(address(pair), TARGET);
        pair.mint(bob, 1e18);
        buyAs(bob, curve, 1e18); // mostly Launch Shield
        vm.warp(block.timestamp + 16);
        pair.mint(alice, 10e18);
        buyAs(alice, curve, 10e18);

        uint256 reserve = curve.reserve();
        uint256 shield = curve.shieldReserve();
        pair.rebase(0.95e18);
        uint256 balance = pair.balanceOf(address(curve));
        assertGt(balance, reserve);

        pair.mint(carol, 1e18);
        buyAs(carol, curve, 1e18);
        assertLt(curve.shieldReserve(), shield, "shield absorbed the loss");
        assertGe(pair.balanceOf(address(curve)), liabilities(curve));
    }

    function testTaxOnTopTokenCanNeverDrainTheReserve() public {
        TaxOnTopToken pair = new TaxOnTopToken(500);
        (FortuneCustomPairCurve curve, FortuneCustomPairToken token) = launchOpen(address(pair), TARGET);
        pair.mint(alice, 50e18);
        pair.mint(bob, 50e18);
        buyAs(alice, curve, 10e18);
        buyAs(bob, curve, 10e18);

        uint256 aliceTokens = token.balanceOf(alice);
        vm.startPrank(alice);
        token.approve(address(curve), aliceTokens);
        // Each sell costs the curve 5% on top, taken from fees until they run out.
        bool reverted;
        for (uint256 i; i < 10; ++i) {
            try curve.sell(aliceTokens / 10, 0) {} catch { reverted = true; break; }
            assertGe(pair.balanceOf(address(curve)), curve.reserve(), "reserve intact after every sell");
        }
        vm.stopPrank();
        assertTrue(reverted, "sells stop once fees can no longer cover the extra tax");
        assertGe(pair.balanceOf(address(curve)), curve.reserve());
    }

    // ------------------------------------------------------- hostile tokens

    function testReentrancyFromPairTokenIsBlocked() public {
        for (uint8 mode = 1; mode <= 4; ++mode) {
            ReentrantToken pair = new ReentrantToken();
            (FortuneCustomPairCurve curve,) = launchOpen(address(pair), TARGET);
            pair.mint(alice, 10e18);
            pair.arm(address(curve), mode);
            buyAs(alice, curve, 5e18);
            assertTrue(pair.attempted());
            assertFalse(pair.reentered());
        }
    }

    function testPairTokenHookCannotHijackGraduationLiquidity() public {
        PoolHijackToken pair = new PoolHijackToken();
        (FortuneCustomPairCurve curve, FortuneCustomPairToken token) = launchOpen(address(pair), TARGET);
        // The token contract itself buys launch tokens, then arms its hook.
        pair.mint(address(pair), 5e18);
        vm.startPrank(address(pair));
        pair.approve(address(curve), 5e18);
        curve.buy(5e18, 0);
        vm.stopPrank();
        pair.mint(address(pair), 1);
        pair.arm(curve.pool(), address(token));

        pair.mint(alice, 100e18);
        buyAs(alice, curve, 100e18);
        vm.expectRevert(bytes("POOL_MINT_INTERLEAVED"));
        curve.graduate();
        assertFalse(curve.graduated());
        assertEq(MockPancakeV2Pair(curve.pool()).totalSupply(), 0);
    }

    function testUsdtStyleTokenWithoutReturnValues() public {
        NoReturnToken pair = new NoReturnToken();
        (FortuneCustomPairCurve curve, FortuneCustomPairToken token) = launchOpen(address(pair), 30_000e6);
        assertEq(curve.pairDecimals(), 6);
        pair.mint(alice, 100_000e6);
        vm.startPrank(alice);
        pair.approve(address(curve), type(uint256).max);
        uint256 tokens = curve.buy(1_000e6, 0);
        token.approve(address(curve), tokens);
        curve.sell(tokens / 2, 0);
        curve.buy(90_000e6, 0);
        vm.stopPrank();
        curve.graduate();
        assertEq(uint8(curve.phase()), uint8(FortuneCustomPairCurve.Phase.Graduated));
    }

    function testMaxWalletPairTokenOnlyBlocksBuysNeverExits() public {
        MaxWalletToken pair = new MaxWalletToken(12e18);
        (FortuneCustomPairCurve curve,) = launchOpen(address(pair), TARGET);
        pair.mint(alice, 10e18);
        pair.mint(bob, 10e18);
        uint256 aliceTokens = buyAs(alice, curve, 10e18);

        vm.startPrank(bob);
        pair.approve(address(curve), 10e18);
        vm.expectRevert(bytes("MAX_WALLET"));
        curve.buy(10e18, 0);
        vm.stopPrank();

        uint256 delivered = sellAs(alice, curve, aliceTokens);
        assertGt(delivered, 9.7e18);
    }

    function testLifecycleAcrossDecimals() public {
        uint8[5] memory decimalsList = [uint8(0), 6, 8, 18, 24];
        for (uint256 i; i < decimalsList.length; ++i) {
            uint8 decimals = decimalsList[i];
            PlainToken pair = new PlainToken("DEC", decimals);
            uint256 unit = 10 ** decimals;
            uint256 target = 3_000 * unit;
            (FortuneCustomPairCurve curve, FortuneCustomPairToken token) = launchOpen(address(pair), target);
            fund(address(pair), alice, 10_000 * unit);
            uint256 tokens = buyAs(alice, curve, 100 * unit);
            sellAs(alice, curve, tokens / 3);
            buyAs(alice, curve, 9_000 * unit);
            uint256 finalPrice = curve.spotPriceX18();
            curve.graduate();
            assertRelApprox(poolPriceX18(curve), finalPrice, 2, "price continuity at every decimals");
            assertEq(token.balanceOf(address(curve)), 0);
        }
    }

    function testLossesHitShieldAndFeesBeforeTheCurveStops() public {
        RebasingToken pair = new RebasingToken();
        (FortuneCustomPairCurve curve,) = launch(address(pair), TARGET);
        pair.mint(bob, 1e18);
        uint256 tokens = buyAs(bob, curve, 1e18);
        vm.warp(vm.getBlockTimestamp() + 16);
        sellAs(bob, curve, tokens);
        assertEq(curve.circulating(), 0);
        uint256 shield = curve.shieldReserve();

        // Half of every balance disappears. Shield and fees cover the curve.
        pair.rebase(0.5e18);
        vm.expectRevert(bytes("NOT_RESCUABLE"));
        curve.activateRescue();
        pair.mint(carol, 1e18);
        buyAs(carol, curve, 1e18);
        assertLt(curve.shieldReserve(), shield);
        assertGe(pair.balanceOf(address(curve)), liabilities(curve));
    }

    function testRescueWithNoHoldersLeavesNothingStranded() public {
        RebasingToken pair = new RebasingToken();
        (FortuneCustomPairCurve curve,) = launchOpen(address(pair), TARGET);
        pair.mint(bob, 1e18);
        uint256 tokens = buyAs(bob, curve, 1e18);
        sellAs(bob, curve, tokens);
        assertEq(curve.circulating(), 0);
        assertGt(curve.reserve(), 0, "rounding leaves dust in the reserve");

        // Every balance is wiped out: shield and fees absorb what they can, the
        // reserve dust is impaired, and rescue opens with no holders to pay.
        pair.rebase(0);
        curve.activateRescue();
        assertEq(curve.rescueHolderClaims(), 0, "no holders: nothing reserved for them");
        assertEq(curve.rescueCreatorClaims(), 0);
        assertGt(curve.rescueProtocolClaims(), 0);

        // Whatever the token restores later is claimable, not stranded.
        pair.rebase(1e18);
        pair.mint(address(curve), 1e18);
        curve.claimProtocolFees();
        assertEq(pair.balanceOf(address(curve)), 0);
        assertGe(pair.balanceOf(treasury), 1e18);
    }
}

contract NotAToken {
    function totalSupply() external pure returns (uint256) {
        return 1;
    }
}
