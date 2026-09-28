// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {CustomPairBase} from "./CustomPairBase.sol";
import {FortuneCustomPairFactory} from "../src/FortuneCustomPairFactory.sol";
import {FortuneCustomPairCurve} from "../src/FortuneCustomPairCurve.sol";
import {FortuneCustomPairToken} from "../src/FortuneCustomPairToken.sol";
import {FortuneLaunchRules} from "../src/FortuneLaunchRules.sol";
import {MockPancakeV2PairLike, PairSwap} from "./mocks/MockPancakeV2.sol";
import {PlainToken, RebasingToken} from "./mocks/PairTokens.sol";

/// A gate token that burns all the gas it is given.
contract GasBurnerToken {
    function balanceOf(address) external view returns (uint256) {
        uint256 x;
        while (gasleft() > 1_000) x += 1;
        return x;
    }
}

/// A gate token whose `balanceOf` reply is 100 KB long, which callers must not pay to copy.
contract ReturnBombToken {
    function balanceOf(address) external pure returns (uint256) {
        assembly {
            mstore(0, 1000000000000000000000)
            return(0, 100000)
        }
    }
}

contract RulesPoolTrader {
    function swapExactIn(address pool, address tokenIn, uint256 amountIn, address to) external returns (uint256) {
        return PairSwap.swapExactIn(MockPancakeV2PairLike(pool), tokenIn, amountIn, to);
    }
}

contract FortuneLaunchRulesTest is CustomPairBase {
    uint256 internal constant TARGET = 30e18;
    PlainToken internal pair;

    function setUp() public override {
        super.setUp();
        pair = new PlainToken("PAIR", 18);
    }

    function none() internal pure returns (FortuneLaunchRules.Rules memory r) {}

    function launchWithRules(FortuneLaunchRules.Rules memory r, uint256 firstBuy)
        internal
        returns (FortuneCustomPairCurve curve, FortuneCustomPairToken token)
    {
        if (firstBuy > 0) {
            fund(address(pair), creator, firstBuy);
            vm.prank(creator);
            pair.approve(address(factory), firstBuy);
        }
        vm.prank(creator);
        (address tokenAddress, address curveAddress,) =
            factory.createLaunchWithRules(params(address(pair), TARGET), abi.encode(r), firstBuy, 0);
        curve = FortuneCustomPairCurve(curveAddress);
        token = FortuneCustomPairToken(tokenAddress);
    }

    function buyFor(address who, FortuneCustomPairCurve curve, uint256 amountIn) internal returns (uint256) {
        fund(address(pair), who, amountIn);
        return buyAs(who, curve, amountIn);
    }

    function pct(uint256 bps) internal pure returns (uint256) {
        return SUPPLY * bps / 10_000;
    }

    /// Pair amount whose buy (after fees, past the shield) returns about `tokens` at the curve's current state.
    function pairFor(FortuneCustomPairCurve curve, uint256 tokens) internal view returns (uint256) {
        uint256 d = curve.virtualReserve() + curve.reserve();
        // sold(R + net) - sold(R) = S * net * a0 / (d * (d + net)) solved for net, then grossed up for 1% fees.
        uint256 k = SUPPLY * curve.virtualReserve();
        uint256 net = tokens * d * d / (k - tokens * d);
        return net * 10_000 / 9_900 + 1;
    }

    // ------------------------------------------------------------ validation

    function testCheckRulesBoundsAndEmpty() public {
        FortuneLaunchRules.Rules memory r = none();
        (bool ok, bytes32 reason) = launchRules.checkRules(r);
        assertFalse(ok);
        assertEq(reason, "RULES_EMPTY");

        r.maxWalletBps = 49;
        (, reason) = launchRules.checkRules(r);
        assertEq(reason, "RULES_MAX_WALLET");
        r.maxWalletBps = 1_001;
        (, reason) = launchRules.checkRules(r);
        assertEq(reason, "RULES_MAX_WALLET");
        r.maxWalletBps = 100;
        (ok, reason) = launchRules.checkRules(r);
        assertTrue(ok);

        r.maxBuyBps = 9;
        (, reason) = launchRules.checkRules(r);
        assertEq(reason, "RULES_MAX_BUY");
        r.maxBuyBps = 0;
        r.maxSellBps = 4;
        (, reason) = launchRules.checkRules(r);
        assertEq(reason, "RULES_MAX_SELL");
        r.maxSellBps = 0;
        r.sellCooldown = 1 days + 1;
        (, reason) = launchRules.checkRules(r);
        assertEq(reason, "RULES_COOLDOWN");
        r.sellCooldown = 0;

        r.vestingCliff = 1 hours;
        (, reason) = launchRules.checkRules(r);
        assertEq(reason, "RULES_VESTING", "a cliff needs a window");
        r.vestingWindow = 60;
        r.vestingDuration = 30 days;
        (, reason) = launchRules.checkRules(r);
        assertEq(reason, "RULES_VESTING", "cliff plus duration is at most 30 days");
        r.vestingDuration = 29 days;
        (ok,) = launchRules.checkRules(r);
        assertTrue(ok);
        r.vestingWindow = 1 days + 1;
        (, reason) = launchRules.checkRules(r);
        assertEq(reason, "RULES_VESTING");
        r.vestingWindow = 60;

        r.allowlistSeconds = 600;
        (, reason) = launchRules.checkRules(r);
        assertEq(reason, "RULES_ALLOWLIST", "a window needs a list");
        r.allowlist = new address[](201);
        for (uint256 i; i < 201; ++i) r.allowlist[i] = address(uint160(i + 1));
        (, reason) = launchRules.checkRules(r);
        assertEq(reason, "RULES_ALLOWLIST");
        r.allowlist = new address[](1);
        r.allowlist[0] = alice;
        r.allowlistSeconds = 1 hours + 1;
        (, reason) = launchRules.checkRules(r);
        assertEq(reason, "RULES_ALLOWLIST");
        r.allowlistSeconds = 600;

        r.gateSeconds = 600;
        (, reason) = launchRules.checkRules(r);
        assertEq(reason, "RULES_GATE", "a gate needs a token and a minimum");
        r.gateToken = address(pair);
        r.gateMinBalance = 1e18;
        (ok,) = launchRules.checkRules(r);
        assertTrue(ok);
        r.gateToken = makeAddr("not a contract");
        (, reason) = launchRules.checkRules(r);
        assertEq(reason, "RULES_GATE");
        r.gateToken = address(pair);

        r.exempt = new address[](2);
        r.exempt[0] = bob;
        r.exempt[1] = bob;
        (, reason) = launchRules.checkRules(r);
        assertEq(reason, "RULES_EXEMPT");
        r.exempt = new address[](11);
        for (uint256 i; i < 11; ++i) r.exempt[i] = address(uint160(i + 100));
        (, reason) = launchRules.checkRules(r);
        assertEq(reason, "RULES_EXEMPT");
    }

    function testPreflightAndCreationRefuseBadRules() public {
        (bool ok, bytes32 reason) = factory.preflightWithRules(params(address(pair), TARGET), hex"1234");
        assertFalse(ok);
        assertEq(reason, "RULES_ENCODING");
        (ok, reason) = factory.preflightWithRules(params(address(pair), TARGET), abi.encode(none()));
        assertEq(reason, "RULES_EMPTY");

        vm.prank(creator);
        vm.expectRevert(abi.encodeWithSelector(FortuneCustomPairFactory.LaunchPreflightFailed.selector, bytes32("RULES_EMPTY")));
        factory.createLaunchWithRules(params(address(pair), TARGET), abi.encode(none()), 0, 0);

        // A factory built without the rules contract does not offer rules.
        FortuneCustomPairFactory plain =
            new FortuneCustomPairFactory(owner, address(pancake), 50, treasury, FortuneLaunchRules(address(0)));
        FortuneLaunchRules.Rules memory r = none();
        r.curveOnly = true;
        (, reason) = plain.preflightWithRules(params(address(pair), TARGET), abi.encode(r));
        assertEq(reason, "RULES_DISABLED");

        // The rules contract must be bound to the factory that uses it.
        FortuneLaunchRules stray = new FortuneLaunchRules(makeAddr("someone else"));
        vm.expectRevert(bytes("BAD_LAUNCH_RULES"));
        new FortuneCustomPairFactory(owner, address(pancake), 50, treasury, stray);
    }

    function testRulesAreFixedAtLaunchAndPlainLaunchesHaveNone() public {
        FortuneLaunchRules.Rules memory r = none();
        r.maxWalletBps = 200;
        r.curveOnly = true;
        r.exempt = new address[](1);
        r.exempt[0] = carol;
        (FortuneCustomPairCurve curve, FortuneCustomPairToken token) = launchWithRules(r, 0);
        assertEq(token.rules(), address(launchRules));
        assertTrue(launchRules.active(address(token)));
        FortuneLaunchRules.Launch memory stored = launchRules.rulesOf(address(token));
        assertEq(stored.curve, address(curve));
        assertEq(stored.creator, creator);
        assertEq(stored.maxWalletBps, 200);
        assertTrue(stored.curveOnly);
        assertEq(stored.exemptList.length, 1);
        assertTrue(launchRules.isExempt(address(token), carol));
        (uint256 maxWallet, uint256 maxBuy, uint256 maxSell) = launchRules.capsOf(address(token));
        assertEq(maxWallet, pct(200));
        assertEq(maxBuy, 0);
        assertEq(maxSell, 0);

        // Nobody can register again or change anything.
        vm.expectRevert(FortuneLaunchRules.OnlyFactory.selector);
        launchRules.register(address(token), address(curve), creator, SUPPLY, abi.encode(r));
        vm.prank(address(factory));
        vm.expectRevert(FortuneLaunchRules.AlreadyRegistered.selector);
        launchRules.register(address(token), address(curve), creator, SUPPLY, abi.encode(r));

        (, FortuneCustomPairToken plainToken) = launchOpen(address(pair), TARGET);
        assertEq(plainToken.rules(), address(0));
    }

    function testAnyoneCallingTheHookOnlyTouchesTheirOwnNamespace() public {
        FortuneLaunchRules.Rules memory r = none();
        r.sellCooldown = 1 hours;
        (, FortuneCustomPairToken token) = launchWithRules(r, 0);
        vm.prank(alice);
        launchRules.onTransfer(alice, address(0xBEEF), 1, 0, 1);
        assertEq(launchRules.lastSellAt(address(token), alice), 0);
        assertEq(launchRules.lastSellAt(alice, alice), 0);
    }

    // -------------------------------------------------------------- caps

    function testMaxWalletAppliesToBuysAndTransfersButNotExemptWallets() public {
        FortuneLaunchRules.Rules memory r = none();
        r.maxWalletBps = 100;
        r.exempt = new address[](1);
        r.exempt[0] = carol;
        (FortuneCustomPairCurve curve, FortuneCustomPairToken token) = launchWithRules(r, 0);
        vm.warp(block.timestamp + 16);

        uint256 got = buyFor(alice, curve, pairFor(curve, pct(90)));
        assertLe(got, pct(100));
        uint256 tooMuch = pairFor(curve, pct(20));
        fund(address(pair), alice, tooMuch);
        vm.startPrank(alice);
        pair.approve(address(curve), tooMuch);
        vm.expectRevert(abi.encodeWithSelector(FortuneLaunchRules.RulesMaxWallet.selector, pct(100)));
        curve.buy(tooMuch, 0);
        vm.stopPrank();

        // A transfer that would push bob over the cap is refused too.
        buyFor(bob, curve, pairFor(curve, pct(90)));
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(FortuneLaunchRules.RulesMaxWallet.selector, pct(100)));
        token.transfer(bob, pct(20));

        // An exempt wallet may hold more.
        buyFor(carol, curve, pairFor(curve, pct(300)));
        assertGt(token.balanceOf(carol), pct(100));
    }

    function testMaxBuyCapsEachCurveBuy() public {
        FortuneLaunchRules.Rules memory r = none();
        r.maxBuyBps = 50;
        (FortuneCustomPairCurve curve,) = launchWithRules(r, 0);
        vm.warp(block.timestamp + 16);
        buyFor(alice, curve, pairFor(curve, pct(45)));
        uint256 amount = pairFor(curve, pct(60));
        fund(address(pair), alice, amount);
        vm.startPrank(alice);
        pair.approve(address(curve), amount);
        vm.expectRevert(abi.encodeWithSelector(FortuneLaunchRules.RulesMaxBuy.selector, pct(50)));
        curve.buy(amount, 0);
        vm.stopPrank();
        // Two buys under the cap are fine: the cap paces buys, it is not a wallet cap.
        buyFor(alice, curve, pairFor(curve, pct(45)));
    }

    function testMaxSellAndCooldownPaceEverySellerIncludingExemptWallets() public {
        FortuneLaunchRules.Rules memory r = none();
        r.maxSellBps = 25;
        r.sellCooldown = 60;
        r.exempt = new address[](1);
        r.exempt[0] = alice;
        (FortuneCustomPairCurve curve, FortuneCustomPairToken token) = launchWithRules(r, 0);
        vm.warp(block.timestamp + 16);
        uint256 bought = buyFor(alice, curve, pairFor(curve, pct(200)));

        vm.startPrank(alice);
        token.approve(address(curve), type(uint256).max);
        vm.expectRevert(abi.encodeWithSelector(FortuneLaunchRules.RulesMaxSell.selector, pct(25)));
        curve.sell(pct(30), 0);
        curve.sell(pct(25), 0);
        uint256 readyAt = block.timestamp + 60;
        assertEq(launchRules.sellReadyAt(address(token), alice), readyAt);
        vm.expectRevert(abi.encodeWithSelector(FortuneLaunchRules.RulesSellCooldown.selector, readyAt));
        curve.sell(pct(10), 0);
        vm.warp(readyAt);
        curve.sell(pct(10), 0);
        vm.stopPrank();
        assertEq(token.balanceOf(alice), bought - pct(35));
    }

    // ---------------------------------------------------- curve-only transfers

    function testCurveOnlyBlocksWalletTransfersExceptThroughExemptWallets() public {
        FortuneLaunchRules.Rules memory r = none();
        r.curveOnly = true;
        r.exempt = new address[](1);
        r.exempt[0] = carol;
        (FortuneCustomPairCurve curve, FortuneCustomPairToken token) = launchWithRules(r, 0);
        vm.warp(block.timestamp + 16);
        buyFor(alice, curve, 1e18);

        vm.prank(alice);
        vm.expectRevert(FortuneLaunchRules.RulesCurveOnly.selector);
        token.transfer(bob, 1e18);
        // Through an exempt wallet (airdrop, team) it works both ways.
        vm.prank(alice);
        token.transfer(carol, 2e18);
        vm.prank(carol);
        token.transfer(bob, 1e18);
        // Selling back to the curve is never blocked by curve-only.
        sellAs(bob, curve, 1e18);
    }

    // ----------------------------------------------------------------- vesting

    function testEarlyBuysVestWithCliffThenLinearUnlockIncludingTheCreatorsFirstBuy() public {
        FortuneLaunchRules.Rules memory r = none();
        r.vestingWindow = 60;
        r.vestingCliff = 1 hours;
        r.vestingDuration = 10 hours;
        (FortuneCustomPairCurve curve, FortuneCustomPairToken token) = launchWithRules(r, 0.02e18);
        uint256 creatorVested = launchRules.vestedOf(address(token), creator);
        assertGt(creatorVested, 0, "the creator's first buy vests");
        assertEq(creatorVested, token.balanceOf(creator));

        vm.warp(block.timestamp + 20);
        uint256 early = buyFor(alice, curve, 1e18);
        assertEq(launchRules.vestedOf(address(token), alice), early);
        vm.warp(block.timestamp + 60);
        uint256 late = buyFor(alice, curve, 1e18);
        assertEq(launchRules.vestedOf(address(token), alice), early, "buys after the window are free");

        // Before the cliff only the late tokens can move.
        vm.startPrank(alice);
        token.approve(address(curve), type(uint256).max);
        vm.expectRevert(abi.encodeWithSelector(FortuneLaunchRules.RulesVestingLocked.selector, early));
        curve.sell(late + 1, 0);
        curve.sell(late, 0);
        vm.stopPrank();

        // Halfway through the unlock half is free; sending to an exempt or any wallet counts too.
        uint64 start = uint64(launchRules.rulesOf(address(token)).launchTimestamp) + 1 hours;
        vm.warp(start + 5 hours);
        (uint256 locked,,,) = launchRules.lockOf(address(token), alice);
        assertEq(locked, early / 2);
        uint256 free = token.balanceOf(alice) - locked;
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(FortuneLaunchRules.RulesVestingLocked.selector, locked));
        token.transfer(bob, free + 1);
        vm.prank(alice);
        token.transfer(bob, free);

        vm.warp(start + 10 hours);
        (locked,,,) = launchRules.lockOf(address(token), alice);
        assertEq(locked, 0);
        sellAs(alice, curve, token.balanceOf(alice));
        vm.startPrank(creator);
        token.approve(address(curve), creatorVested);
        curve.sell(creatorVested, 0);
        vm.stopPrank();
    }

    function testFuzzVestingNeverLocksMoreThanBoughtAndOnlyEverUnlocks(uint32 cliff, uint32 duration, uint64 t1, uint64 t2)
        public
    {
        cliff = uint32(bound(cliff, 0, 15 days));
        duration = uint32(bound(duration, cliff == 0 ? 1 : 0, 30 days - cliff));
        FortuneLaunchRules.Rules memory r = none();
        r.vestingWindow = 60;
        r.vestingCliff = cliff;
        r.vestingDuration = duration;
        (FortuneCustomPairCurve curve, FortuneCustomPairToken token) = launchWithRules(r, 0);
        vm.warp(block.timestamp + 20);
        uint256 early = buyFor(alice, curve, 1e18);
        uint256 launched = launchRules.rulesOf(address(token)).launchTimestamp;
        t1 = uint64(bound(t1, block.timestamp, launched + 40 days));
        t2 = uint64(bound(t2, t1, launched + 40 days));
        vm.warp(t1);
        (uint256 lockedAt1,,,) = launchRules.lockOf(address(token), alice);
        vm.warp(t2);
        (uint256 lockedAt2,,,) = launchRules.lockOf(address(token), alice);
        assertLe(lockedAt1, early);
        assertLe(lockedAt2, lockedAt1, "never locks more later");
        if (t2 >= launched + uint256(cliff) + duration) assertEq(lockedAt2, 0, "free by the end");
        // Whatever is not locked can always be sold.
        uint256 free = token.balanceOf(alice) - lockedAt2;
        vm.assume(free > 0 && free <= curve.circulating());
        vm.warp(t2);
        sellAs(alice, curve, free);
    }

    // ------------------------------------------------------------ access windows

    function testAllowlistWindowThenOpenToEveryone() public {
        FortuneLaunchRules.Rules memory r = none();
        r.allowlistSeconds = 600;
        r.allowlist = new address[](1);
        r.allowlist[0] = alice;
        r.exempt = new address[](1);
        r.exempt[0] = carol;
        (FortuneCustomPairCurve curve, FortuneCustomPairToken token) = launchWithRules(r, 0.01e18);
        assertGt(token.balanceOf(creator), 0, "the creator is always allowed");
        vm.warp(block.timestamp + 16);
        uint256 opensAt = launchRules.rulesOf(address(token)).launchTimestamp + 600;

        buyFor(alice, curve, 0.1e18);
        buyFor(carol, curve, 0.1e18);
        assertFalse(launchRules.canBuyNow(address(token), bob));
        fund(address(pair), bob, 0.1e18);
        vm.startPrank(bob);
        pair.approve(address(curve), 0.1e18);
        vm.expectRevert(abi.encodeWithSelector(FortuneLaunchRules.RulesAllowlistOnly.selector, opensAt));
        curve.buy(0.1e18, 0);
        vm.stopPrank();

        vm.warp(opensAt);
        assertTrue(launchRules.canBuyNow(address(token), bob));
        buyAs(bob, curve, 0.1e18);
    }

    function testHolderGateWindowAndHostileGateTokens() public {
        PlainToken gate = new PlainToken("GATE", 18);
        gate.mint(alice, 100e18);
        gate.mint(bob, 99e18);
        FortuneLaunchRules.Rules memory r = none();
        r.gateToken = address(gate);
        r.gateMinBalance = 100e18;
        r.gateSeconds = 300;
        (FortuneCustomPairCurve curve, FortuneCustomPairToken token) = launchWithRules(r, 0);
        vm.warp(block.timestamp + 16);
        uint256 opensAt = launchRules.rulesOf(address(token)).launchTimestamp + 300;

        buyFor(alice, curve, 0.1e18);
        fund(address(pair), bob, 0.1e18);
        vm.startPrank(bob);
        pair.approve(address(curve), 0.1e18);
        vm.expectRevert(abi.encodeWithSelector(FortuneLaunchRules.RulesHolderGate.selector, opensAt));
        curve.buy(0.1e18, 0);
        vm.warp(opensAt);
        curve.buy(0.1e18, 0);
        vm.stopPrank();

        // A gate token that eats all gas only ever keeps its own window shut.
        GasBurnerToken burner = new GasBurnerToken();
        r.gateToken = address(burner);
        (bool ok, bytes32 reason) = launchRules.checkRules(r);
        assertTrue(ok || reason == "RULES_GATE");
    }

    function testReturnBombGateTokenIsReadOneWordOnly() public {
        PlainToken plainGate = new PlainToken("GATE", 18);
        plainGate.mint(bob, 1000e18);
        ReturnBombToken bomb = new ReturnBombToken();
        FortuneLaunchRules.Rules memory r = none();
        r.gateMinBalance = 1000e18;
        r.gateSeconds = 300;
        r.gateToken = address(plainGate);
        (, FortuneCustomPairToken plainGated) = launchWithRules(r, 0);
        r.gateToken = address(bomb);
        (bool ok,) = launchRules.checkRules(r);
        assertTrue(ok);
        (FortuneCustomPairCurve curve, FortuneCustomPairToken token) = launchWithRules(r, 0);
        vm.warp(block.timestamp + 16);

        uint256 before = gasleft();
        assertTrue(launchRules.canBuyNow(address(plainGated), bob));
        uint256 plainGas = before - gasleft();
        before = gasleft();
        bool allowed = launchRules.canBuyNow(address(token), bob);
        uint256 bombGas = before - gasleft();
        assertTrue(allowed, "the first word of the reply is the balance");
        // Building the reply costs the bomb ~28k of its own capped budget. Copying all of it back
        // would cost the caller ~40k more on every gated check.
        assertLt(bombGas, plainGas + 35_000, "only one word of the reply is copied");
        buyFor(bob, curve, 0.1e18);
    }

    // --------------------------------------------- rules never outlive the curve

    function testRulesEndAtGraduationSoEverythingMovesFreelyOnPancake() public {
        FortuneLaunchRules.Rules memory r = none();
        r.curveOnly = true;
        r.maxSellBps = 5;
        r.sellCooldown = 1 days;
        r.vestingWindow = 1 days;
        r.vestingCliff = 20 days;
        r.vestingDuration = 5 days;
        (FortuneCustomPairCurve curve, FortuneCustomPairToken token) = launchWithRules(r, 0);
        vm.warp(block.timestamp + 16);
        buyFor(alice, curve, 5e18);
        buyFor(bob, curve, 100e18); // reaches the target
        assertTrue(curve.graduationReady());

        // Still on the curve: locked and curve-only.
        vm.prank(alice);
        vm.expectRevert();
        token.transfer(carol, 1e18);

        vm.prank(carol);
        curve.graduate();
        assertFalse(launchRules.active(address(token)));
        (uint256 locked,,,) = launchRules.lockOf(address(token), alice);
        assertEq(locked, 0);

        // After graduation: wallet transfers, pool sells of vested tokens, any size.
        uint256 aliceTokens = token.balanceOf(alice);
        vm.prank(alice);
        token.transfer(carol, aliceTokens / 2);
        RulesPoolTrader trader = new RulesPoolTrader();
        vm.prank(carol);
        token.transfer(address(trader), aliceTokens / 2);
        uint256 out = trader.swapExactIn(curve.pool(), address(token), aliceTokens / 2, carol);
        assertGt(out, 0);
    }

    function testMaxWalletNeverBlocksGraduation() public {
        FortuneLaunchRules.Rules memory r = none();
        r.maxWalletBps = 1_000;
        (FortuneCustomPairCurve curve,) = launchWithRules(r, 0);
        vm.warp(block.timestamp + 16);
        for (uint256 i; !curve.graduationReady(); ++i) {
            address buyer = address(uint160(0x10000 + i));
            uint256 amount = pairFor(curve, pct(900));
            if (curve.reserve() + amount > TARGET) amount = TARGET;
            buyFor(buyer, curve, amount);
        }
        curve.graduate();
        assertEq(uint8(curve.phase()), uint8(FortuneCustomPairCurve.Phase.Graduated));
    }

    function testRulesEndWhenRescueOpensSoLockedHoldersCanStillRedeem() public {
        RebasingToken rebasing = new RebasingToken();
        FortuneLaunchRules.Rules memory r = none();
        r.maxSellBps = 5;
        r.sellCooldown = 1 days;
        r.vestingWindow = 1 days;
        r.vestingCliff = 29 days;
        r.vestingDuration = 1 days;
        FortuneCustomPairFactory.LaunchParams memory p = params(address(rebasing), TARGET);
        vm.prank(creator);
        (address tokenAddress, address curveAddress,) = factory.createLaunchWithRules(p, abi.encode(r), 0, 0);
        FortuneCustomPairCurve curve = FortuneCustomPairCurve(curveAddress);
        FortuneCustomPairToken token = FortuneCustomPairToken(tokenAddress);
        vm.warp(block.timestamp + 16);
        rebasing.mint(alice, 10e18);
        uint256 aliceTokens = buyAs(alice, curve, 10e18);
        (uint256 locked,,,) = launchRules.lockOf(address(token), alice);
        assertEq(locked, aliceTokens, "fully locked for 29 days");

        rebasing.rebase(0.8e18);
        curve.activateRescue();
        assertFalse(launchRules.active(address(token)));
        vm.startPrank(alice);
        token.approve(address(curve), aliceTokens);
        uint256 out = curve.rescueRedeem(aliceTokens, 0);
        vm.stopPrank();
        assertGt(out, 0, "a locked holder still gets their pro-rata share");
    }
}
