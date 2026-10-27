// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Vm} from "forge-std/Vm.sol";
import {CustomPairBase} from "./CustomPairBase.sol";
import {FortuneCustomPairFactory} from "../src/FortuneCustomPairFactory.sol";
import {FortuneCustomPairCurve} from "../src/FortuneCustomPairCurve.sol";
import {FortuneCustomPairToken} from "../src/FortuneCustomPairToken.sol";
import {FortuneLaunchRules} from "../src/FortuneLaunchRules.sol";
import {FortuneMarketCalendar} from "../src/FortuneMarketCalendar.sol";
import {MockPancakeV2PairLike, PairSwap} from "./mocks/MockPancakeV2.sol";
import {PlainToken, RebasingToken} from "./mocks/PairTokens.sol";

contract TradeRulesPoolTrader {
    function swapExactIn(address pool, address tokenIn, uint256 amountIn, address to) external returns (uint256) {
        return PairSwap.swapExactIn(MockPancakeV2PairLike(pool), tokenIn, amountIn, to);
    }
}

/// @notice The trade rules modelled on HookedPad: market hours, graduated and sliding caps,
///         rising and chapter wallet caps, the sniper gas cap, anti-bundle and holder vesting.
contract FortuneTradeRulesTest is CustomPairBase {
    uint256 internal constant TARGET = 30e18;
    /// Tuesday 19 January 2027, 10:00am in New York (EST): the market is open.
    uint256 internal constant TUE_OPEN = 1_800_370_800;
    /// Good Friday, 26 March 2027, 10:00am in New York (EDT).
    uint256 internal constant GOOD_FRIDAY = 1_806_069_600;

    PlainToken internal pair;
    address internal dave = makeAddr("dave");

    function setUp() public override {
        super.setUp();
        pair = new PlainToken("PAIR", 18);
    }

    // --------------------------------------------------------------- helpers

    function none() internal pure returns (FortuneLaunchRules.Rules memory r) {}

    function code(FortuneLaunchRules.Rules memory r) internal view returns (bytes32 reason) {
        (, reason) = launchRules.checkRules(r);
    }

    function level(uint16 fromProgressBps, uint16 maxBuyBps, uint16 maxSellBps)
        internal
        pure
        returns (FortuneLaunchRules.CapLevel memory)
    {
        return FortuneLaunchRules.CapLevel({fromProgressBps: fromProgressBps, maxBuyBps: maxBuyBps, maxSellBps: maxSellBps});
    }

    function levels1(uint16 from, uint16 buyBps, uint16 sellBps) internal pure returns (FortuneLaunchRules.CapLevel[] memory l) {
        l = new FortuneLaunchRules.CapLevel[](1);
        l[0] = level(from, buyBps, sellBps);
    }

    function one(address account) internal pure returns (address[] memory list) {
        list = new address[](1);
        list[0] = account;
    }

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

    /// Buys about `tokens` launch tokens for `who` at the curve's current price.
    function buyTokens(address who, FortuneCustomPairCurve curve, uint256 tokens) internal returns (uint256) {
        return buyFor(who, curve, pairFor(curve, tokens));
    }

    function expectBuyRevert(address who, FortuneCustomPairCurve curve, uint256 amountIn, bytes memory err) internal {
        fund(address(pair), who, amountIn);
        vm.startPrank(who);
        pair.approve(address(curve), amountIn);
        vm.expectRevert(err);
        curve.buy(amountIn, 0);
        vm.stopPrank();
    }

    function expectSellRevert(address who, FortuneCustomPairCurve curve, uint256 amount, bytes memory err) internal {
        vm.startPrank(who);
        IERC20(address(curve.launchToken())).approve(address(curve), amount);
        vm.expectRevert(err);
        curve.sell(amount, 0);
        vm.stopPrank();
    }

    function pct(uint256 bps) internal pure returns (uint256) {
        return SUPPLY * bps / 10_000;
    }

    /// Pair amount whose buy (after fees, past the shield) returns about `tokens` at the curve's current state.
    function pairFor(FortuneCustomPairCurve curve, uint256 tokens) internal view returns (uint256) {
        uint256 d = curve.virtualReserve() + curve.reserve();
        uint256 k = SUPPLY * curve.virtualReserve();
        uint256 net = tokens * d * d / (k - tokens * d);
        return net * 10_000 / 9_900 + 1;
    }

    /// The launch's own timestamp. Tests warp to absolute times: under via-IR, a `block.timestamp`
    /// read after `vm.warp` can return the value from before it.
    function launchedAt(FortuneCustomPairToken token) internal view returns (uint256) {
        return launchRules.rulesOf(address(token)).launchTimestamp;
    }

    /// Graduation progress the curve would show after selling `tokens`, with its own rounding.
    function progressAfterSell(FortuneCustomPairCurve curve, uint256 tokens) internal view returns (uint256) {
        uint256 d = curve.virtualReserve() + curve.reserve();
        uint256 gross = tokens * d * d / (SUPPLY * curve.virtualReserve() + tokens * d);
        return (curve.reserve() - gross) * 10_000 / TARGET;
    }

    function flow(FortuneCustomPairToken token) internal view returns (uint256 volume, uint256 bundleBlock, uint256 bundleBuys, uint256 lvl) {
        (uint128 v, uint64 b, uint8 n, uint8 l) = launchRules.flowOf(address(token));
        return (v, b, n, l);
    }

    function caps(FortuneCustomPairToken token) internal view returns (uint256 maxWallet, uint256 maxBuy, uint256 maxSell) {
        return launchRules.capsOf(address(token));
    }

    function locked(FortuneCustomPairToken token, address account) internal view returns (uint256 amount) {
        (amount,,,) = launchRules.lockOf(address(token), account);
    }

    /// Every trade rule that can be combined, as on HookedPad's combined hook and more.
    function everything() internal view returns (FortuneLaunchRules.Rules memory r) {
        r.marketHours = 1;
        r.sellCooldown = 1 minutes;
        r.curveOnly = true;
        r.slideMaxBuyBps = 500;
        r.slideMaxSellBps = 100;
        r.levels = levels1(5_000, 0, 25);
        r.chapterStartBps = 100;
        r.chapterVolumeBps = 500;
        r.maxGasPrice = 1 gwei;
        r.gasCapSeconds = 10 minutes;
        r.maxBuysPerBlock = 3;
        r.bundleMinBps = 5;
        r.walletVestWindow = 1 hours;
        r.walletVestCliff = 1 days;
        r.walletVestUnlockBps = 1_000;
        r.walletVestPeriod = 1 days;
        r.exempt = one(carol);
    }

    // ------------------------------------------------------------ validation

    function testTradeRuleBoundsAndReasonCodes() public {
        FortuneLaunchRules.Rules memory r = none();
        r.marketHours = 2;
        assertEq(code(r), "RULES_MARKET_HOURS", "keeping sells open needs the rule itself");
        r.marketHours = 8;
        assertEq(code(r), "RULES_MARKET_HOURS");
        r.marketHours = 7;
        assertEq(code(r), "OK", "market hours alone is a rule");

        r = none();
        r.sellTierSmallBps = 100;
        r.sellTierFloorBps = 10;
        r.sellTierBagBps = 300;
        assertEq(code(r), "OK");
        r.sellTierFloorBps = 100;
        assertEq(code(r), "RULES_SELL_TIERS", "the floor is below the small holders' cap");
        r.sellTierFloorBps = 10;
        r.sellTierBagBps = 100;
        assertEq(code(r), "RULES_SELL_TIERS", "the big-bag size is above the small holders' cap");
        r.sellTierBagBps = 1_001;
        assertEq(code(r), "RULES_SELL_TIERS");
        r.sellTierBagBps = 300;
        r.sellTierSmallBps = 501;
        assertEq(code(r), "RULES_SELL_TIERS");
        r.sellTierSmallBps = 100;
        r.sellTierFloorBps = 0;
        assertEq(code(r), "RULES_SELL_TIERS");

        r = none();
        r.slideMaxSellBps = 100;
        assertEq(code(r), "RULES_SLIDING", "launch caps need at least one level");
        r.levels = new FortuneLaunchRules.CapLevel[](2);
        r.levels[0] = level(3_000, 0, 50);
        r.levels[1] = level(3_000, 0, 10);
        assertEq(code(r), "RULES_SLIDING", "levels rise");
        r.levels = levels1(10_000, 0, 50);
        assertEq(code(r), "RULES_SLIDING", "a level comes before graduation");
        r.levels = levels1(3_000, 9, 0);
        assertEq(code(r), "RULES_SLIDING", "buy caps start at 0.1%");
        r.levels = levels1(3_000, 0, 4);
        assertEq(code(r), "RULES_SLIDING", "sell caps start at 0.05%");
        r.levels = new FortuneLaunchRules.CapLevel[](6);
        for (uint256 i; i < 6; ++i) {
            r.levels[i] = level(uint16(1_000 * (i + 1)), 0, 50);
        }
        assertEq(code(r), "RULES_SLIDING", "five levels at most");
        r.slideMaxSellBps = 0;
        r.levels = levels1(3_000, 0, 0);
        assertEq(code(r), "RULES_SLIDING", "some level caps something");
        r.levels = levels1(3_000, 0, 50);
        assertEq(code(r), "OK");

        r = none();
        r.risingStartBps = 10;
        assertEq(code(r), "RULES_RISING", "a rising cap needs a period");
        r.risingStepBps = 10;
        r.risingPeriod = 59;
        assertEq(code(r), "RULES_RISING");
        r.risingPeriod = 1 days + 1;
        assertEq(code(r), "RULES_RISING");
        r.risingPeriod = 5 minutes;
        assertEq(code(r), "OK");
        r.risingDoubles = true;
        assertEq(code(r), "RULES_RISING", "a step or doubling, not both");
        r.risingStepBps = 0;
        assertEq(code(r), "OK");
        r.risingStartBps = 501;
        assertEq(code(r), "RULES_RISING");
        r.risingStartBps = 0;
        assertEq(code(r), "RULES_RISING", "settings without a starting cap");

        r = none();
        r.chapterStartBps = 9;
        r.chapterVolumeBps = 100;
        assertEq(code(r), "RULES_CHAPTERS");
        r.chapterStartBps = 50;
        r.chapterVolumeBps = 1_001;
        assertEq(code(r), "RULES_CHAPTERS");
        r.chapterVolumeBps = 9;
        assertEq(code(r), "RULES_CHAPTERS");
        r.chapterVolumeBps = 100;
        assertEq(code(r), "OK");
        r.chapterStartBps = 0;
        assertEq(code(r), "RULES_CHAPTERS");

        r = none();
        r.maxGasPrice = 0.09 gwei;
        r.gasCapSeconds = 10 minutes;
        assertEq(code(r), "RULES_GAS_CAP");
        r.maxGasPrice = 101 gwei;
        assertEq(code(r), "RULES_GAS_CAP");
        r.maxGasPrice = 1 gwei;
        r.gasCapSeconds = 59;
        assertEq(code(r), "RULES_GAS_CAP");
        r.gasCapSeconds = 1 days + 1;
        assertEq(code(r), "RULES_GAS_CAP", "the gas cap always ends");
        r.gasCapSeconds = 1 days;
        assertEq(code(r), "OK");
        r.maxGasPrice = 0;
        assertEq(code(r), "RULES_GAS_CAP", "a window without a cap");

        r = none();
        r.maxBuysPerBlock = 21;
        r.bundleMinBps = 5;
        assertEq(code(r), "RULES_BUNDLE");
        r.maxBuysPerBlock = 3;
        r.bundleMinBps = 0;
        assertEq(code(r), "RULES_BUNDLE", "a minimum size, so dust can't fill a block");
        r.bundleMinBps = 101;
        assertEq(code(r), "RULES_BUNDLE");
        r.bundleMinBps = 5;
        assertEq(code(r), "OK");
        r.maxBuysPerBlock = 0;
        assertEq(code(r), "RULES_BUNDLE");

        r = none();
        r.walletVestCliff = 1 days;
        r.walletVestUnlockBps = 1_000;
        r.walletVestPeriod = 1 days;
        assertEq(code(r), "OK", "a day's cliff, then 10% a day");
        r.walletVestPeriod = 1 hours - 1;
        assertEq(code(r), "RULES_WALLET_VESTING");
        r.walletVestPeriod = 7 days + 1;
        assertEq(code(r), "RULES_WALLET_VESTING");
        r.walletVestPeriod = 1 days;
        r.walletVestUnlockBps = 9;
        assertEq(code(r), "RULES_WALLET_VESTING");
        r.walletVestUnlockBps = 10_001;
        assertEq(code(r), "RULES_WALLET_VESTING");
        r.walletVestUnlockBps = 1_000;
        r.walletVestCliff = 7 days + 1;
        assertEq(code(r), "RULES_WALLET_VESTING");
        r.walletVestCliff = 1 days;
        r.walletVestWindow = 59;
        assertEq(code(r), "RULES_WALLET_VESTING");
        r.walletVestWindow = 7 days + 1;
        assertEq(code(r), "RULES_WALLET_VESTING");
        r.walletVestWindow = 1 hours;
        assertEq(code(r), "OK");
        r.walletVestUnlockBps = 300;
        assertEq(code(r), "RULES_WALLET_VESTING", "a day plus 34 days is over 30 days");
        r.walletVestUnlockBps = 345;
        assertEq(code(r), "OK", "a day plus 29 days");
        r.walletVestPeriod = 0;
        assertEq(code(r), "RULES_WALLET_VESTING", "settings without a period");
    }

    function testOneRulePerCapAsOnHookedPad() public {
        FortuneLaunchRules.Rules memory r = none();
        r.maxWalletBps = 100;
        r.risingStartBps = 10;
        r.risingStepBps = 10;
        r.risingPeriod = 5 minutes;
        assertEq(code(r), "RULES_WALLET_CAP_CONFLICT");
        r.maxWalletBps = 0;
        r.chapterStartBps = 50;
        r.chapterVolumeBps = 100;
        assertEq(code(r), "RULES_WALLET_CAP_CONFLICT", "rising and chapters both cap wallets");

        r = none();
        r.maxBuyBps = 100;
        r.levels = levels1(3_000, 50, 0);
        assertEq(code(r), "RULES_BUY_CAP_CONFLICT");
        r.maxBuyBps = 0;
        r.maxSellBps = 50;
        assertEq(code(r), "RULES_SELL_CAP_CONFLICT", "sliding caps set the sell cap too");
        r.levels = new FortuneLaunchRules.CapLevel[](0);
        r.sellTierSmallBps = 100;
        r.sellTierFloorBps = 10;
        r.sellTierBagBps = 300;
        assertEq(code(r), "RULES_SELL_CAP_CONFLICT");

        r = none();
        r.vestingWindow = 60;
        r.vestingCliff = 1 hours;
        r.walletVestPeriod = 1 days;
        r.walletVestUnlockBps = 10_000;
        assertEq(code(r), "RULES_VESTING_CONFLICT");

        assertEq(code(everything()), "OK", "everything else combines");
    }

    function testTradeRulesAreCheckedAtPreflightAndFixedAtLaunch() public {
        FortuneLaunchRules.Rules memory r = none();
        r.maxBuysPerBlock = 3;
        (bool ok, bytes32 reason) = factory.preflightWithRules(params(address(pair), TARGET), abi.encode(r));
        assertFalse(ok);
        assertEq(reason, "RULES_BUNDLE");
        vm.prank(creator);
        vm.expectRevert(abi.encodeWithSelector(FortuneCustomPairFactory.LaunchPreflightFailed.selector, bytes32("RULES_BUNDLE")));
        factory.createLaunchWithRules(params(address(pair), TARGET), abi.encode(r), 0, 0);

        vm.warp(TUE_OPEN);
        r = everything();
        vm.recordLogs();
        (, FortuneCustomPairToken token) = launchWithRules(r, 0);
        bool logged;
        Vm.Log[] memory logs = vm.getRecordedLogs();
        for (uint256 i; i < logs.length; ++i) {
            if (logs[i].topics[0] == FortuneLaunchRules.TradeRulesRegistered.selector) {
                logged = logs[i].topics[1] == bytes32(uint256(uint160(address(token))));
            }
        }
        assertTrue(logged, "the trade rules are public from the launch");

        (FortuneLaunchRules.TradeRules memory t, FortuneLaunchRules.CapLevel[] memory levels) = launchRules.tradeRulesOf(address(token));
        assertEq(t.marketHours, 1);
        assertEq(t.slideMaxBuyBps, 500);
        assertEq(t.levelCount, 1);
        assertEq(levels.length, 1);
        assertEq(levels[0].fromProgressBps, 5_000);
        assertEq(levels[0].maxSellBps, 25);
        assertEq(t.chapterStartBps, 100);
        assertEq(t.maxGasPrice, 1 gwei);
        assertEq(t.maxBuysPerBlock, 3);
        assertEq(t.walletVestPeriod, 1 days);

        vm.prank(address(factory));
        vm.expectRevert(FortuneLaunchRules.AlreadyRegistered.selector);
        launchRules.register(address(token), address(1), creator, SUPPLY, abi.encode(none()));
    }

    // ---------------------------------------------------------- market hours

    function testMarketHoursOpenOnlyDuringTheNyseSession() public {
        vm.warp(TUE_OPEN);
        FortuneLaunchRules.Rules memory r = none();
        r.marketHours = 1;
        (FortuneCustomPairCurve curve, FortuneCustomPairToken token) = launchWithRules(r, 0.1e18);
        assertGt(token.balanceOf(creator), 0, "a first buy in the session works");
        vm.warp(TUE_OPEN + 16);
        uint256 bought = buyFor(alice, curve, 1e18);
        (bool buysOpen, bool sellsOpen) = launchRules.marketStatus(address(token));
        assertTrue(buysOpen && sellsOpen);

        // 4:00pm: buys and sells close for everyone, the creator included; wallets can still send.
        vm.warp(TUE_OPEN + 6 hours);
        (buysOpen, sellsOpen) = launchRules.marketStatus(address(token));
        assertFalse(buysOpen || sellsOpen);
        assertFalse(launchRules.canBuyNow(address(token), creator));
        bytes memory closed = abi.encodeWithSelector(FortuneLaunchRules.RulesMarketClosed.selector);
        expectBuyRevert(bob, curve, 1e18, closed);
        expectBuyRevert(creator, curve, 1e18, closed);
        expectSellRevert(alice, curve, bought / 2, closed);
        vm.prank(alice);
        token.transfer(bob, bought / 4);

        // The weekend stays closed; Monday opens at 9:30am.
        vm.warp(TUE_OPEN + 4 days);
        expectBuyRevert(bob, curve, 1e18, closed);
        vm.warp(TUE_OPEN + 6 days - 30 minutes - 1);
        expectBuyRevert(bob, curve, 1e18, closed);
        vm.warp(TUE_OPEN + 6 days - 30 minutes);
        assertTrue(launchRules.canBuyNow(address(token), bob));
        buyFor(bob, curve, 1e18);
        sellAs(alice, curve, bought / 2);
    }

    function testSellsCanStayOpenAndHolidaysCanBeIgnored() public {
        vm.warp(TUE_OPEN);
        FortuneLaunchRules.Rules memory r = none();
        r.marketHours = 1 | 2;
        (FortuneCustomPairCurve curve, FortuneCustomPairToken token) = launchWithRules(r, 0);
        vm.warp(TUE_OPEN + 16);
        uint256 bought = buyFor(alice, curve, 1e18);

        vm.warp(TUE_OPEN + 12 hours);
        (bool buysOpen, bool sellsOpen) = launchRules.marketStatus(address(token));
        assertFalse(buysOpen);
        assertTrue(sellsOpen, "sells stay open around the clock");
        expectBuyRevert(bob, curve, 1e18, abi.encodeWithSelector(FortuneLaunchRules.RulesMarketClosed.selector));
        sellAs(alice, curve, bought / 2);

        // Good Friday is a holiday unless the launch ignores holidays.
        vm.warp(GOOD_FRIDAY);
        expectBuyRevert(bob, curve, 1e18, abi.encodeWithSelector(FortuneLaunchRules.RulesMarketClosed.selector));
        r.marketHours = 1 | 4;
        (FortuneCustomPairCurve weekdays,) = launchWithRules(r, 0);
        vm.warp(GOOD_FRIDAY + 16);
        buyFor(bob, weekdays, 1e18);
    }

    function testCalendarFollowsDaylightTimeHolidaysAndEarlyCloses() public view {
        assertFalse(launchRules.isMarketOpen(1_804_861_799, true), "Fri 12 Mar 2027 9:29:59 EST");
        assertTrue(launchRules.isMarketOpen(1_804_861_800, true), "9:30 EST");
        assertFalse(launchRules.isMarketOpen(1_805_117_399, true), "Mon 15 Mar 2027 9:29:59 EDT");
        assertTrue(launchRules.isMarketOpen(1_805_117_400, true), "9:30 EDT is an hour earlier in UTC");
        assertTrue(launchRules.isMarketOpen(1_827_251_999, true), "day after Thanksgiving, 12:59:59");
        assertFalse(launchRules.isMarketOpen(1_827_252_000, true), "1:00pm early close");
        assertTrue(launchRules.isMarketOpen(1_827_252_000, false), "ignoring holidays, it runs to 4:00pm");
        assertFalse(launchRules.isMarketOpen(1_800_284_400, true), "Martin Luther King Jr. Day 2027");
        assertTrue(launchRules.isMarketOpen(1_800_284_400, false));
        assertFalse(launchRules.isMarketOpen(GOOD_FRIDAY, true));
        assertFalse(launchRules.isMarketOpen(0, false));
    }

    function testCalendarMatchesTheNyseReference2026To2035() public view {
        _checkReferenceCalendar(0, 3_653);
    }

    function testCalendarMatchesTheNyseReference2036To2045() public view {
        _checkReferenceCalendar(3_653, type(uint256).max);
    }

    /// Every day of the reference (exchange_calendars' XNYS and the IANA time zone database) at the
    /// minutes either side of the open, the early close and the close, with holidays observed and ignored.
    function _checkReferenceCalendar(uint256 from, uint256 to) internal view {
        string memory json = vm.readFile(string.concat(vm.projectRoot(), "/test/data/nyse-calendar.json"));
        uint256 firstDay = vm.parseJsonUint(json, ".firstDay");
        bytes memory days_ = vm.parseJsonBytes(json, ".days");
        if (to > days_.length) to = days_.length;
        for (uint256 i = from; i < to; ++i) {
            uint8 entry = uint8(days_[i]);
            uint256 status = entry & 3;
            uint256 day = firstDay + i;
            uint256 midnight = day * 1 days + (entry & 4 != 0 ? 4 hours : 5 hours);
            bool weekday = (day + 4) % 7 != 0 && (day + 4) % 7 != 6;
            assertFalse(launchRules.isMarketOpen(midnight + 9 hours + 29 minutes + 59, true), "before the open");
            assertEq(launchRules.isMarketOpen(midnight + 9 hours + 30 minutes, true), status != 0, "the open");
            assertEq(launchRules.isMarketOpen(midnight + 12 hours + 59 minutes + 59, true), status != 0, "before an early close");
            assertEq(launchRules.isMarketOpen(midnight + 13 hours, true), status == 1, "an early close");
            assertEq(launchRules.isMarketOpen(midnight + 15 hours + 59 minutes + 59, true), status == 1, "before the close");
            assertFalse(launchRules.isMarketOpen(midnight + 16 hours, true), "the close");
            assertEq(launchRules.isMarketOpen(midnight + 9 hours + 30 minutes, false), weekday, "weekdays, ignoring holidays");
            assertEq(launchRules.isMarketOpen(midnight + 15 hours + 59 minutes + 59, false), weekday);
        }
    }

    function testDaylightTimeChangesAtTheExactInstantEveryYear() public view {
        string memory json = vm.readFile(string.concat(vm.projectRoot(), "/test/data/nyse-calendar.json"));
        uint256[] memory starts = vm.parseJsonUintArray(json, ".dstStarts");
        uint256[] memory ends = vm.parseJsonUintArray(json, ".dstEnds");
        assertEq(starts.length, 20);
        assertEq(ends.length, 20);
        for (uint256 i; i < starts.length; ++i) {
            assertFalse(FortuneMarketCalendar.isDaylightTime(starts[i] - 1));
            assertTrue(FortuneMarketCalendar.isDaylightTime(starts[i]));
            assertTrue(FortuneMarketCalendar.isDaylightTime(ends[i] - 1));
            assertFalse(FortuneMarketCalendar.isDaylightTime(ends[i]));
        }
    }

    function testEasterMatchesKnownDates() public pure {
        assertEq(FortuneMarketCalendar.easterDay(2026), 20_548, "5 April 2026");
        assertEq(FortuneMarketCalendar.easterDay(2027), 20_905, "28 March 2027");
        assertEq(FortuneMarketCalendar.easterDay(2038), 24_951, "25 April 2038, the latest possible");
        assertEq(FortuneMarketCalendar.easterDay(2100), 47_568, "28 March 2100");
        assertEq(FortuneMarketCalendar.easterDay(2285), 115_132, "22 March 2285, the earliest possible");
    }

    function testFuzzHolidaysOnlyEverCloseTheMarket(uint256 timestamp) public view {
        timestamp = bound(timestamp, 1_767_225_600, 4_102_444_800);
        if (launchRules.isMarketOpen(timestamp, true)) assertTrue(launchRules.isMarketOpen(timestamp, false));
    }

    function testFuzzCalendarDatesRoundTrip(uint256 day) public pure {
        day = bound(day, 0, 200_000);
        (uint256 year, uint256 month, uint256 date) = FortuneMarketCalendar.civilDate(day);
        assertEq(FortuneMarketCalendar.daysFromCivil(year, month, date), day);
        assertTrue(month >= 1 && month <= 12 && date >= 1 && date <= 31);
    }

    // ------------------------------------------------------ graduated sell caps

    function testGraduatedSellCapsShrinkAsBagsGrow() public {
        FortuneLaunchRules.Rules memory r = none();
        r.sellTierSmallBps = 100;
        r.sellTierFloorBps = 10;
        r.sellTierBagBps = 300;
        r.exempt = one(carol);
        (FortuneCustomPairCurve curve, FortuneCustomPairToken token) = launchWithRules(r, 0);
        vm.warp(launchedAt(token) + 16);

        // A small holder sells their whole bag at once.
        uint256 small = buyTokens(alice, curve, pct(50));
        assertEq(launchRules.sellCapOf(address(token), alice), pct(100));
        sellAs(alice, curve, small);

        // Between 1% and 3% the cap falls evenly from 1% to 0.1%.
        uint256 bag = buyTokens(bob, curve, pct(200));
        uint256 cap = pct(100) - (pct(100) - pct(10)) * (bag - pct(100)) / (pct(300) - pct(100));
        assertEq(launchRules.sellCapOf(address(token), bob), cap);
        assertApproxEqRel(cap, pct(55), 0.01e18);
        expectSellRevert(bob, curve, cap + 1, abi.encodeWithSelector(FortuneLaunchRules.RulesMaxSell.selector, cap));
        sellAs(bob, curve, cap);

        // At 3% or more, the floor; exempt wallets too, since sell caps apply to everyone.
        buyTokens(carol, curve, pct(500));
        assertEq(launchRules.sellCapOf(address(token), carol), pct(10));
        expectSellRevert(carol, curve, pct(10) + 1, abi.encodeWithSelector(FortuneLaunchRules.RulesMaxSell.selector, pct(10)));
        sellAs(carol, curve, pct(10));
        (,, uint256 maxSell) = caps(token);
        assertEq(maxSell, pct(100), "capsOf reports the small holders' cap");
    }

    // ------------------------------------------------------------ sliding caps

    function testSlidingCapsChangeWithGraduationProgress() public {
        FortuneLaunchRules.Rules memory r = none();
        r.slideMaxBuyBps = 1_000;
        r.slideMaxSellBps = 100;
        r.levels = new FortuneLaunchRules.CapLevel[](2);
        r.levels[0] = level(1_000, 500, 50);
        r.levels[1] = level(2_000, 0, 10);
        (FortuneCustomPairCurve curve, FortuneCustomPairToken token) = launchWithRules(r, 0);
        vm.warp(launchedAt(token) + 16);

        expectBuyRevert(alice, curve, pairFor(curve, pct(1_100)), abi.encodeWithSelector(FortuneLaunchRules.RulesMaxBuy.selector, pct(1_000)));
        buyTokens(alice, curve, pct(900));
        buyTokens(bob, curve, pct(990));
        assertLt(curve.graduationProgressBps(), 1_000);
        // The buy that crosses 10% is judged at launch caps; the next trade uses the new level.
        buyTokens(carol, curve, pct(990));
        assertGe(curve.graduationProgressBps(), 1_000);
        (,,, uint256 lvl) = flow(token);
        assertEq(lvl, 1);
        (, uint256 maxBuy, uint256 maxSell) = caps(token);
        assertEq(maxBuy, pct(500));
        assertEq(maxSell, pct(50));
        expectBuyRevert(dave, curve, pairFor(curve, pct(600)), abi.encodeWithSelector(FortuneLaunchRules.RulesMaxBuy.selector, pct(500)));

        // A sell is judged at the level the market stood at before it, so a big sell
        // cannot escape the 0.5% cap by pushing the curve back under 10%. Walk the curve
        // down to just above the level, where a 1% sell would take it under.
        while (progressAfterSell(curve, pct(100)) >= 1_000) {
            sellAs(alice, curve, pct(50));
        }
        assertGe(curve.graduationProgressBps(), 1_000);
        (,,, lvl) = flow(token);
        assertEq(lvl, 1);
        expectSellRevert(alice, curve, pct(100), abi.encodeWithSelector(FortuneLaunchRules.RulesMaxSell.selector, pct(50)));
        while (curve.graduationProgressBps() >= 1_000) {
            sellAs(alice, curve, pct(50));
        }
        (,,, lvl) = flow(token);
        assertEq(lvl, 0, "back under the level, the launch caps apply again");
        sellAs(alice, curve, pct(100));

        // From 20%: no buy cap and a 0.1% sell cap.
        for (uint256 i; curve.graduationProgressBps() < 2_000; ++i) {
            buyTokens(address(uint160(0x20000 + i)), curve, pct(490));
        }
        buyTokens(dave, curve, pct(100));
        (,,, lvl) = flow(token);
        assertEq(lvl, 2);
        buyTokens(dave, curve, pct(1_500));
        expectSellRevert(dave, curve, pct(10) + 1, abi.encodeWithSelector(FortuneLaunchRules.RulesMaxSell.selector, pct(10)));
    }

    // ------------------------------------------------------- rising and chapters

    function testRisingMaxWalletGrowsOnATimer() public {
        FortuneLaunchRules.Rules memory r = none();
        r.risingStartBps = 10;
        r.risingStepBps = 10;
        r.risingPeriod = 5 minutes;
        r.exempt = one(carol);
        (FortuneCustomPairCurve curve, FortuneCustomPairToken token) = launchWithRules(r, 0);
        uint256 launched = launchRules.rulesOf(address(token)).launchTimestamp;
        vm.warp(launched + 16);

        (uint256 maxWallet,,) = caps(token);
        assertEq(maxWallet, pct(10));
        expectBuyRevert(alice, curve, pairFor(curve, pct(15)), abi.encodeWithSelector(FortuneLaunchRules.RulesMaxWallet.selector, pct(10)));
        buyTokens(alice, curve, pct(9));
        buyTokens(carol, curve, pct(100));
        vm.prank(carol);
        vm.expectRevert(abi.encodeWithSelector(FortuneLaunchRules.RulesMaxWallet.selector, pct(10)));
        token.transfer(alice, pct(5));

        vm.warp(launched + 5 minutes);
        (maxWallet,,) = caps(token);
        assertEq(maxWallet, pct(20));
        vm.prank(carol);
        token.transfer(alice, pct(5));

        // It never stops rising: after 999 steps it covers the whole supply and no longer limits anyone.
        vm.warp(launched + 998 * 5 minutes);
        (maxWallet,,) = caps(token);
        assertEq(maxWallet, pct(9_990));
        vm.warp(launched + 999 * 5 minutes);
        (maxWallet,,) = caps(token);
        assertEq(maxWallet, 0);
    }

    function testRisingMaxWalletCanDouble() public {
        FortuneLaunchRules.Rules memory r = none();
        r.risingStartBps = 10;
        r.risingDoubles = true;
        r.risingPeriod = 1 minutes;
        (, FortuneCustomPairToken token) = launchWithRules(r, 0);
        uint256 launched = launchRules.rulesOf(address(token)).launchTimestamp;
        uint256[11] memory expected = [pct(10), pct(20), pct(40), pct(80), pct(160), pct(320), pct(640), pct(1_280), pct(2_560), pct(5_120), 0];
        for (uint256 i; i < expected.length; ++i) {
            vm.warp(launched + i * 1 minutes);
            (uint256 maxWallet,,) = caps(token);
            assertEq(maxWallet, expected[i]);
        }
        vm.warp(launched + 10_000 days);
        (uint256 later,,) = caps(token);
        assertEq(later, 0);
    }

    function testChaptersDoubleTheWalletCapAsVolumeGrows() public {
        FortuneLaunchRules.Rules memory r = none();
        r.chapterStartBps = 50;
        r.chapterVolumeBps = 200;
        (FortuneCustomPairCurve curve, FortuneCustomPairToken token) = launchWithRules(r, 0);
        vm.warp(launchedAt(token) + 16);

        uint256 volume;
        volume += buyTokens(alice, curve, pct(45));
        volume += buyTokens(bob, curve, pct(45));
        volume += buyTokens(carol, curve, pct(45));
        volume += buyTokens(dave, curve, pct(45));
        (uint256 maxWallet,,) = caps(token);
        assertEq(maxWallet, pct(50), "chapter one");
        // A buy that would itself carry the volume into chapter two is judged at the cap before it.
        expectBuyRevert(alice, curve, pairFor(curve, pct(30)), abi.encodeWithSelector(FortuneLaunchRules.RulesMaxWallet.selector, pct(50)));

        // Sells count as volume too: crossing 2% of supply traded opens chapter two.
        sellAs(alice, curve, pct(30));
        volume += pct(30);
        (uint256 traded,,,) = flow(token);
        assertEq(traded, volume);
        assertGe(volume, pct(200));
        (maxWallet,,) = caps(token);
        assertEq(maxWallet, pct(100), "chapter two doubles the cap");
        buyTokens(alice, curve, pct(60));
        assertGt(token.balanceOf(alice), pct(50));
    }

    // ---------------------------------------------------------- sniper gas cap

    function testGasCapRefusesPriorityBuysDuringTheWindow() public {
        FortuneLaunchRules.Rules memory r = none();
        r.maxGasPrice = 1 gwei;
        r.gasCapSeconds = 10 minutes;
        r.exempt = one(carol);
        vm.txGasPrice(5 gwei);
        (FortuneCustomPairCurve curve, FortuneCustomPairToken token) = launchWithRules(r, 0.1e18);
        assertGt(token.balanceOf(creator), 0, "the creator's first buy is exempt");
        uint256 launched = launchRules.rulesOf(address(token)).launchTimestamp;
        vm.warp(launched + 16);

        expectBuyRevert(alice, curve, 1e18, abi.encodeWithSelector(FortuneLaunchRules.RulesGasPrice.selector, 1 gwei));
        buyFor(carol, curve, 1e18);
        vm.txGasPrice(1 gwei);
        uint256 bought = buyFor(alice, curve, 1e18);
        vm.txGasPrice(50 gwei);
        sellAs(alice, curve, bought / 2);

        vm.warp(launched + 10 minutes);
        buyFor(bob, curve, 1e18);
    }

    // ------------------------------------------------------------ anti-bundle

    function testAntiBundleLimitsCountedBuysPerBlock() public {
        FortuneLaunchRules.Rules memory r = none();
        r.maxBuysPerBlock = 2;
        r.bundleMinBps = 5;
        r.exempt = one(carol);
        (FortuneCustomPairCurve curve, FortuneCustomPairToken token) = launchWithRules(r, 0);
        vm.warp(launchedAt(token) + 16);

        uint256 bought = buyTokens(alice, curve, pct(10));
        buyTokens(bob, curve, pct(10));
        expectBuyRevert(dave, curve, pairFor(curve, pct(10)), abi.encodeWithSelector(FortuneLaunchRules.RulesBundle.selector, 2));
        buyTokens(dave, curve, pct(4));
        buyTokens(carol, curve, pct(10));
        sellAs(alice, curve, bought / 3);
        sellAs(alice, curve, bought / 3);
        (, uint256 bundleBlock, uint256 bundleBuys,) = flow(token);
        assertEq(bundleBlock, block.number);
        assertEq(bundleBuys, 2, "small buys, exempt buys and sells don't count");

        vm.roll(block.number + 1);
        buyTokens(dave, curve, pct(10));
    }

    // ---------------------------------------------------------- holder vesting

    function testHolderVestingRunsOnEachWalletsOwnClock() public {
        FortuneLaunchRules.Rules memory r = none();
        r.walletVestCliff = 1 days;
        r.walletVestUnlockBps = 2_500;
        r.walletVestPeriod = 1 days;
        (FortuneCustomPairCurve curve, FortuneCustomPairToken token) = launchWithRules(r, 0.1e18);
        assertEq(locked(token, creator), token.balanceOf(creator), "the creator's first buy vests too");
        uint256 t0 = launchedAt(token) + 16;
        vm.warp(t0);

        uint256 a = buyFor(alice, curve, 1e18);
        (uint256 aliceLocked, uint256 vested, uint64 unlockStart, uint64 unlockEnd) = launchRules.lockOf(address(token), alice);
        assertEq(aliceLocked, a);
        assertEq(vested, a);
        assertEq(unlockStart, t0 + 2 days, "the first share unlocks a whole period after the cliff");
        assertEq(unlockEnd, t0 + 5 days);
        expectSellRevert(alice, curve, a / 10, abi.encodeWithSelector(FortuneLaunchRules.RulesVestingLocked.selector, a));
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(FortuneLaunchRules.RulesVestingLocked.selector, a));
        token.transfer(bob, 1);

        vm.warp(t0 + 1 days);
        uint256 b = buyFor(bob, curve, 1e18);

        vm.warp(t0 + 2 days - 1);
        assertEq(locked(token, alice), a);
        vm.warp(t0 + 2 days);
        aliceLocked = a * 7_500 / 10_000;
        assertEq(locked(token, alice), aliceLocked);
        expectSellRevert(alice, curve, a - aliceLocked + 1, abi.encodeWithSelector(FortuneLaunchRules.RulesVestingLocked.selector, aliceLocked));
        sellAs(alice, curve, a - aliceLocked);
        assertEq(locked(token, bob), b, "bob's clock started a day later");

        // A later buy restarts the clock for everything still locked; what already unlocked stays free.
        vm.warp(t0 + 3 days);
        uint256 bobLocked = b * 7_500 / 10_000;
        assertEq(locked(token, bob), bobLocked);
        uint256 b2 = buyFor(bob, curve, 1e18);
        (uint256 nowLocked,, uint64 bobStart, uint64 bobEnd) = launchRules.lockOf(address(token), bob);
        assertEq(nowLocked, bobLocked + b2);
        assertEq(bobStart, t0 + 5 days);
        assertEq(bobEnd, t0 + 8 days);
        sellAs(bob, curve, b - bobLocked);

        vm.warp(t0 + 5 days);
        assertEq(locked(token, alice), 0, "all of alice's bag is free after the cliff and four periods");
        sellAs(alice, curve, token.balanceOf(alice));
        vm.warp(t0 + 8 days);
        assertEq(locked(token, bob), 0);
    }

    function testHolderVestingWindowOnlyVestsEarlyBuys() public {
        FortuneLaunchRules.Rules memory r = none();
        r.walletVestWindow = 1 hours;
        r.walletVestUnlockBps = 10_000;
        r.walletVestPeriod = 6 hours;
        (FortuneCustomPairCurve curve, FortuneCustomPairToken token) = launchWithRules(r, 0);
        uint256 launched = launchRules.rulesOf(address(token)).launchTimestamp;
        vm.warp(launched + 16);
        uint256 a = buyFor(alice, curve, 1e18);
        assertEq(locked(token, alice), a);

        vm.warp(launched + 1 hours);
        uint256 b = buyFor(bob, curve, 1e18);
        assertEq(locked(token, bob), 0, "buys after the window are free");
        sellAs(bob, curve, b);
        buyFor(alice, curve, 1e18);
        (uint256 aliceLocked,, uint64 unlockStart,) = launchRules.lockOf(address(token), alice);
        assertEq(aliceLocked, a, "a later buy neither vests nor restarts the clock");
        assertEq(unlockStart, launched + 16 + 6 hours);
        vm.warp(unlockStart);
        sellAs(alice, curve, token.balanceOf(alice));
    }

    function testFuzzHolderVestingOnlyEverUnlocksAndEndsOnTime(uint256 unlockBps, uint256 period, uint256 cliff, uint256 t1, uint256 t2)
        public
    {
        unlockBps = bound(unlockBps, 14, 10_000);
        uint256 periods = (10_000 + unlockBps - 1) / unlockBps;
        period = bound(period, 1 hours, _min(7 days, 30 days / periods));
        cliff = bound(cliff, 0, _min(7 days, 30 days - periods * period));
        FortuneLaunchRules.Rules memory r = none();
        r.walletVestUnlockBps = uint16(unlockBps);
        r.walletVestPeriod = uint32(period);
        r.walletVestCliff = uint32(cliff);
        (FortuneCustomPairCurve curve, FortuneCustomPairToken token) = launchWithRules(r, 0);
        uint256 start = launchedAt(token) + 16;
        vm.warp(start);
        uint256 bought = buyFor(alice, curve, 1e18);
        assertEq(locked(token, alice), bought, "locked when it lands");

        t1 = bound(t1, 0, 31 days);
        t2 = bound(t2, t1, 31 days);
        vm.warp(start + t1);
        uint256 first = locked(token, alice);
        vm.warp(start + t2);
        uint256 second = locked(token, alice);
        assertLe(first, bought);
        assertLe(second, first, "only ever unlocks");
        if (bought > second) sellAs(alice, curve, bought - second);
        vm.warp(start + cliff + periods * period);
        assertEq(locked(token, alice), 0, "free by the end of the schedule");
    }

    function _min(uint256 a, uint256 b) private pure returns (uint256) {
        return a < b ? a : b;
    }

    // --------------------------------------------- rules never outlive the curve

    function testTradeRulesEndAtGraduation() public {
        vm.warp(TUE_OPEN);
        FortuneLaunchRules.Rules memory r = none();
        r.marketHours = 1;
        r.sellTierSmallBps = 5;
        r.sellTierFloorBps = 1;
        r.sellTierBagBps = 50;
        r.walletVestCliff = 7 days;
        r.walletVestUnlockBps = 10_000;
        r.walletVestPeriod = 7 days;
        r.maxBuysPerBlock = 1;
        r.bundleMinBps = 1;
        r.maxGasPrice = 1 gwei;
        r.gasCapSeconds = 1 days;
        (FortuneCustomPairCurve curve, FortuneCustomPairToken token) = launchWithRules(r, 0);
        vm.warp(TUE_OPEN + 16);
        vm.txGasPrice(1 gwei);
        uint256 aliceTokens = buyFor(alice, curve, 5e18);
        vm.roll(block.number + 1);
        buyFor(bob, curve, 100e18);
        assertTrue(curve.graduationReady());
        curve.graduate();
        assertFalse(launchRules.active(address(token)));
        (bool buysOpen, bool sellsOpen) = launchRules.marketStatus(address(token));
        assertTrue(buysOpen && sellsOpen);

        // Saturday, at 50 gwei, all at once, with a bag that was fully locked: PancakeSwap trades freely.
        vm.warp(TUE_OPEN + 4 days);
        vm.txGasPrice(50 gwei);
        TradeRulesPoolTrader trader = new TradeRulesPoolTrader();
        vm.prank(alice);
        token.transfer(address(trader), aliceTokens);
        assertGt(trader.swapExactIn(curve.pool(), address(token), aliceTokens, alice), 0);
        fund(address(pair), address(trader), 1e18);
        assertGt(trader.swapExactIn(curve.pool(), address(pair), 1e18, carol), 0);
    }

    function testTradeRulesEndWhenRescueOpens() public {
        vm.warp(TUE_OPEN);
        RebasingToken rebasing = new RebasingToken();
        FortuneLaunchRules.Rules memory r = none();
        r.marketHours = 1;
        r.walletVestCliff = 7 days;
        r.walletVestUnlockBps = 10_000;
        r.walletVestPeriod = 7 days;
        r.sellTierSmallBps = 5;
        r.sellTierFloorBps = 1;
        r.sellTierBagBps = 50;
        vm.prank(creator);
        (address tokenAddress, address curveAddress,) =
            factory.createLaunchWithRules(params(address(rebasing), TARGET), abi.encode(r), 0, 0);
        FortuneCustomPairCurve curve = FortuneCustomPairCurve(curveAddress);
        FortuneCustomPairToken token = FortuneCustomPairToken(tokenAddress);
        vm.warp(TUE_OPEN + 16);
        rebasing.mint(alice, 10e18);
        uint256 aliceTokens = buyAs(alice, curve, 10e18);
        assertEq(locked(token, alice), aliceTokens);

        rebasing.rebase(0.8e18);
        curve.activateRescue();
        vm.warp(TUE_OPEN + 4 days);
        vm.startPrank(alice);
        token.approve(address(curve), aliceTokens);
        assertGt(curve.rescueRedeem(aliceTokens, 0), 0, "a locked holder redeems everything on a Saturday");
        vm.stopPrank();
    }

    // ------------------------------------------------------------------ gas

    function testGasOfEveryTradeRuleTogether() public {
        vm.warp(TUE_OPEN);
        (FortuneCustomPairCurve plain,) = launchWithRules(_onlyCurveOnly(), 0);
        (FortuneCustomPairCurve full,) = launchWithRules(everything(), 0);
        vm.warp(TUE_OPEN + 16);
        vm.txGasPrice(1 gwei);
        buyFor(bob, plain, 0.05e18);
        buyFor(bob, full, 0.05e18);
        vm.roll(block.number + 1);
        fund(address(pair), alice, 0.1e18);
        vm.startPrank(alice);
        pair.approve(address(plain), 0.05e18);
        pair.approve(address(full), 0.05e18);
        uint256 before = gasleft();
        plain.buy(0.05e18, 0);
        uint256 plainGas = before - gasleft();
        before = gasleft();
        full.buy(0.05e18, 0);
        uint256 fullGas = before - gasleft();
        vm.stopPrank();
        emit log_named_uint("curve buy, one simple rule", plainGas);
        emit log_named_uint("curve buy, every trade rule", fullGas);
        assertLt(fullGas - plainGas, 60_000, "every trade rule together costs under 60k gas more per buy");
    }

    function _onlyCurveOnly() internal pure returns (FortuneLaunchRules.Rules memory r) {
        r.curveOnly = true;
    }
}
