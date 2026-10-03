// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {FortuneStockRewardsToken} from "../src/FortuneStockRewardsToken.sol";
import {MockV3Factory, MockV2Factory, FakePool} from "./mocks/MockPancake.sol";
import {
    MockStock,
    PausableStock,
    HostileReadStock,
    NoReturnStock,
    FalseReturnStock,
    HookStock,
    ITransferHook
} from "./mocks/RewardTokens.sol";

/// Holder contract that, when paid in a hook token, sends away all its launch
/// tokens before the claim moves on to the next asset.
contract SlipperyHolder is ITransferHook {
    FortuneStockRewardsToken internal immutable token;
    address internal immutable sink;

    constructor(FortuneStockRewardsToken token_, address sink_) {
        token = token_;
        sink = sink_;
    }

    function claim() external returns (uint256[] memory) {
        return token.claim();
    }

    function onStockReceived(address, uint256) external {
        uint256 balance = token.balanceOf(address(this));
        if (balance > 0) token.transfer(sink, balance);
    }
}

/// The test contract plays the factory: it receives the supply, is excluded,
/// and hands tokens out with plain transfers.
contract FortuneStockRewardsTokenTest is Test {
    uint256 internal constant SUPPLY = 1_000_000_000e18;
    uint256 internal constant STREAM = 6 hours;

    FortuneStockRewardsToken internal token;
    MockStock internal tsla;
    MockStock internal aapl;
    MockV3Factory internal v3;
    MockV2Factory internal v2;

    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal carol = makeAddr("carol");

    event RewardsReceived(address indexed asset, uint256 amount, uint256 streamEnd);
    event RewardClaimed(address indexed account, address indexed asset, uint256 amount);
    event RewardClaimFailed(address indexed account, address indexed asset, uint256 amount);

    function setUp() public {
        vm.warp(1_800_000_000);
        tsla = new MockStock("TSLA", 18);
        aapl = new MockStock("AAPL", 6);
        v3 = new MockV3Factory();
        v2 = new MockV2Factory();
        token = deploy(assets2(address(tsla), address(aapl)));
    }

    function deploy(address[] memory assets) internal returns (FortuneStockRewardsToken) {
        return new FortuneStockRewardsToken(
            "Stock Rewards", "SRW", SUPPLY, address(this), assets, address(v3), address(v2), new address[](0)
        );
    }

    function assets1(address a) internal pure returns (address[] memory list) {
        list = new address[](1);
        list[0] = a;
    }

    function assets2(address a, address b) internal pure returns (address[] memory list) {
        list = new address[](2);
        list[0] = a;
        list[1] = b;
    }

    function give(address to, uint256 amount) internal {
        token.transfer(to, amount);
    }

    function pay(MockStock asset, uint256 amount) internal {
        asset.mint(address(token), amount);
        token.sync();
    }

    function later(uint256 seconds_) internal {
        vm.warp(block.timestamp + seconds_);
    }

    function claimable(address asset, address account) internal view returns (uint256) {
        return token.claimableOf(asset, account);
    }

    // --------------------------------------------------------------- setup

    function testConstructorWiring() public view {
        assertEq(token.factory(), address(this));
        assertEq(token.totalSupply(), SUPPLY);
        assertEq(token.balanceOf(address(this)), SUPPLY);
        assertEq(token.eligibleSupply(), 0);
        assertTrue(token.isExcluded(address(this)));
        assertTrue(token.isExcluded(token.DEAD()));
        assertEq(token.rewardAssetCount(), 2);
        address[] memory list = token.rewardAssets();
        assertEq(list[0], address(tsla));
        assertEq(list[1], address(aapl));
        assertTrue(token.isRewardAsset(address(aapl)));
        assertFalse(token.isRewardAsset(address(0)));
        assertFalse(token.isRewardAsset(address(token)));
    }

    function testConstructorRejectsBadAssetLists() public {
        address[] memory none = new address[](0);
        vm.expectRevert("BAD_ASSET_COUNT");
        deploy(none);

        address[] memory six = new address[](6);
        for (uint256 i; i < 6; ++i) {
            six[i] = address(new MockStock("X", 18));
        }
        vm.expectRevert("BAD_ASSET_COUNT");
        deploy(six);

        vm.expectRevert("DUPLICATE_ASSET");
        deploy(assets2(address(tsla), address(tsla)));

        vm.expectRevert("BAD_ASSET");
        deploy(assets1(makeAddr("eoa")));
    }

    function testFiveAssetsAreAllTracked() public {
        address[] memory five = new address[](5);
        MockStock[] memory stocks = new MockStock[](5);
        for (uint256 i; i < 5; ++i) {
            stocks[i] = new MockStock("S", uint8(6 + i * 3));
            five[i] = address(stocks[i]);
        }
        token = deploy(five);
        give(alice, 100e18);
        for (uint256 i; i < 5; ++i) {
            stocks[i].mint(address(token), (i + 1) * 1e6);
        }
        token.sync();
        later(STREAM);
        vm.prank(alice);
        uint256[] memory paid = token.claim();
        for (uint256 i; i < 5; ++i) {
            assertApproxEqAbs(paid[i], (i + 1) * 1e6, 1);
            assertEq(stocks[i].balanceOf(alice), paid[i]);
        }
    }

    // ------------------------------------------------------------ streaming

    function testOneHolderIsPaidTheWholeStreamOverSixHours() public {
        give(alice, 100e18);
        tsla.mint(address(token), 600e18);
        vm.expectEmit(address(token));
        emit RewardsReceived(address(tsla), 600e18, block.timestamp + STREAM);
        token.sync();

        assertEq(claimable(address(tsla), alice), 0);
        later(1 hours);
        assertEq(claimable(address(tsla), alice), 100e18);
        later(2 hours);
        assertEq(claimable(address(tsla), alice), 300e18);
        later(3 hours);
        assertEq(claimable(address(tsla), alice), 600e18);
        later(10 hours);
        assertEq(claimable(address(tsla), alice), 600e18);

        vm.expectEmit(address(token));
        emit RewardClaimed(alice, address(tsla), 600e18);
        vm.prank(alice);
        token.claim();
        assertEq(tsla.balanceOf(alice), 600e18);
        assertEq(token.claimed(address(tsla), alice), 600e18);
        assertEq(claimable(address(tsla), alice), 0);
        FortuneStockRewardsToken.RewardState memory state = token.rewardState(address(tsla));
        assertEq(state.owed, 0);
        assertEq(state.streaming, 0);
        assertEq(state.totalReceived, 600e18);
    }

    function testHoldersArePaidProRataAndByTimeHeld() public {
        give(alice, 100e18);
        pay(tsla, 600e18);
        later(3 hours);
        // Bob joins halfway with as much as Alice.
        give(bob, 100e18);
        later(3 hours);
        assertEq(claimable(address(tsla), alice), 450e18);
        assertEq(claimable(address(tsla), bob), 150e18);
    }

    function testTransfersCarryNoEarnedRewards() public {
        give(alice, 100e18);
        pay(tsla, 600e18);
        later(STREAM);
        // Everything is released; Alice hands her tokens to Bob afterwards.
        vm.prank(alice);
        token.transfer(bob, 100e18);
        assertEq(claimable(address(tsla), alice), 600e18);
        assertEq(claimable(address(tsla), bob), 0);
        pay(tsla, 60e18);
        later(STREAM);
        assertEq(claimable(address(tsla), alice), 600e18);
        // Payouts round down, by at most a wei per release.
        assertApproxEqAbs(claimable(address(tsla), bob), 60e18, 1);
    }

    function testBuyingJustBeforeAPaymentAndSellingAfterEarnsAlmostNothing() public {
        give(alice, 100e18);
        // A whale holds for one second around a large payment.
        give(bob, 900_000_000e18);
        pay(tsla, 1_000_000e18);
        later(1);
        vm.prank(bob);
        token.transfer(address(this), 900_000_000e18);
        later(STREAM);
        // Bob earned one second's worth of the stream; Alice gets the rest.
        assertLe(claimable(address(tsla), bob), 1_000_000e18 / STREAM + 1);
        assertGe(claimable(address(tsla), alice), 1_000_000e18 - 1_000_000e18 / STREAM - 1);
        // Leaving in the same block as the payment earns nothing at all.
        give(carol, 900_000_000e18);
        pay(tsla, 1_000_000e18);
        vm.prank(carol);
        token.transfer(address(this), 900_000_000e18);
        later(STREAM);
        assertEq(claimable(address(tsla), carol), 0);
    }

    function testNewFundsRestartTheStreamWithWhatIsLeft() public {
        give(alice, 100e18);
        pay(tsla, 600e18);
        later(3 hours);
        // 300 released, 300 still streaming; 300 more arrive and the stream restarts over 6 hours.
        pay(tsla, 300e18);
        assertEq(claimable(address(tsla), alice), 300e18);
        later(3 hours);
        assertEq(claimable(address(tsla), alice), 600e18);
        later(3 hours);
        assertEq(claimable(address(tsla), alice), 900e18);
    }

    function testFundsWaitUntilSomeoneTakesThemIn() public {
        give(alice, 100e18);
        tsla.mint(address(token), 600e18);
        later(12 hours);
        // Not taken in yet: nothing streams until a transfer, claim or sync.
        assertEq(claimable(address(tsla), alice), 0);
        assertEq(token.previewRewardState(address(tsla)).streaming, 600e18);
        token.sync();
        later(STREAM);
        assertEq(claimable(address(tsla), alice), 600e18);
    }

    function testAssetsStreamIndependently() public {
        give(alice, 100e18);
        give(bob, 300e18);
        pay(tsla, 400e18);
        later(1 hours);
        pay(aapl, 40e6);
        later(STREAM);
        // TSLA was released in two steps, so each payout may be a wei short.
        assertApproxEqAbs(claimable(address(tsla), alice), 100e18, 2);
        assertApproxEqAbs(claimable(address(tsla), bob), 300e18, 2);
        assertApproxEqAbs(claimable(address(aapl), alice), 10e6, 1);
        assertApproxEqAbs(claimable(address(aapl), bob), 30e6, 1);
        (address[] memory list, uint256[] memory amounts) = token.claimable(bob);
        assertEq(list.length, 2);
        assertEq(amounts[0], claimable(address(tsla), bob));
        assertEq(amounts[1], claimable(address(aapl), bob));
    }

    function testStreamsWaitWhileNobodyHolds() public {
        pay(tsla, 600e18);
        later(10 hours);
        // Alice arrives after a long empty stretch; the stream starts over rather
        // than paying her ten hours at once.
        give(alice, 100e18);
        assertEq(claimable(address(tsla), alice), 0);
        later(3 hours);
        assertEq(claimable(address(tsla), alice), 300e18);
        later(3 hours);
        assertEq(claimable(address(tsla), alice), 600e18);
    }

    function testTinyEligibleSupplyDoesNotTakeTheStream() public {
        give(alice, 1e18 - 1);
        pay(tsla, 600e18);
        later(STREAM);
        assertEq(claimable(address(tsla), alice), 0);
        give(bob, 100e18);
        later(STREAM);
        // The stream restarted when Bob arrived; both are paid by balance.
        uint256 total = claimable(address(tsla), alice) + claimable(address(tsla), bob);
        assertApproxEqAbs(total, 600e18, 2);
        assertApproxEqRel(claimable(address(tsla), bob), uint256(600e18) * 100e18 / (100e18 + 1e18 - 1), 1e9);
    }

    function testClaimForPaysEachHolderTheirOwn() public {
        give(alice, 100e18);
        give(bob, 300e18);
        pay(tsla, 400e18);
        later(STREAM);
        address[] memory list = new address[](3);
        list[0] = alice;
        list[1] = bob;
        list[2] = address(this);
        vm.prank(carol);
        token.claimFor(list);
        assertEq(tsla.balanceOf(alice), 100e18);
        assertEq(tsla.balanceOf(bob), 300e18);
        assertEq(tsla.balanceOf(carol), 0);
        assertEq(tsla.balanceOf(address(this)), 0);
    }

    function testClaimPaysWhatTheViewShowed() public {
        give(alice, 123_456_789e15);
        give(bob, 987_654_321e13);
        pay(tsla, 777_777e18 + 7);
        pay(aapl, 333_333_333);
        later(2 hours + 17);
        (, uint256[] memory shown) = token.claimable(alice);
        vm.prank(alice);
        uint256[] memory paid = token.claim();
        assertEq(paid[0], shown[0]);
        assertEq(paid[1], shown[1]);
        assertGt(paid[0], 0);
        assertGt(paid[1], 0);
    }

    // -------------------------------------------------------------- burns

    function testTokensSentToTheContractAreBurned() public {
        give(alice, 100e18);
        vm.prank(alice);
        token.transfer(address(token), 40e18);
        assertEq(token.balanceOf(address(token)), 0);
        assertEq(token.totalSupply(), SUPPLY - 40e18);
        assertEq(token.balanceOf(alice), 60e18);
        assertEq(token.eligibleSupply(), 60e18);
    }

    function testBurningKeepsWhatWasEarned() public {
        give(alice, 100e18);
        give(bob, 100e18);
        pay(tsla, 600e18);
        later(3 hours);
        vm.prank(alice);
        token.burn(100e18);
        assertEq(claimable(address(tsla), alice), 150e18);
        later(3 hours);
        assertEq(claimable(address(tsla), alice), 150e18);
        assertEq(claimable(address(tsla), bob), 450e18);
    }

    function testExcludedSupplyCountsForNothing() public {
        give(alice, 100e18);
        // The factory still holds almost all the supply; it does not dilute Alice.
        pay(tsla, 600e18);
        later(STREAM);
        assertEq(claimable(address(tsla), alice), 600e18);
        assertEq(claimable(address(tsla), address(this)), 0);
        give(token.DEAD(), 100e18);
        pay(tsla, 600e18);
        later(STREAM);
        assertEq(claimable(address(tsla), alice), 1_200e18);
    }

    // ---------------------------------------------------------- exclusions

    function testOnlyTheFactoryExcludesAccounts() public {
        vm.prank(alice);
        vm.expectRevert(FortuneStockRewardsToken.OnlyFactory.selector);
        token.excludeFromRewards(bob);
    }

    function testExclusionStreamsUnclaimedRewardsToEveryoneElse() public {
        give(alice, 100e18);
        give(bob, 100e18);
        pay(tsla, 600e18);
        later(STREAM);
        assertEq(claimable(address(tsla), bob), 300e18);
        token.excludeFromRewards(bob);
        assertTrue(token.isExcluded(bob));
        assertEq(token.eligibleSupply(), 100e18);
        assertEq(claimable(address(tsla), bob), 0);
        later(STREAM);
        assertEq(claimable(address(tsla), alice), 600e18);
        // Excluding twice changes nothing.
        token.excludeFromRewards(bob);
        assertEq(token.eligibleSupply(), 100e18);
        // Bob can still move his tokens; whoever receives them earns again.
        vm.prank(bob);
        token.transfer(carol, 100e18);
        assertEq(token.eligibleSupply(), 200e18);
    }

    function testAnyoneCanExcludeGenuinePancakePools() public {
        address v3Pool = v3.createPool(address(token), address(tsla), 2500, address(this));
        address v2Pair = v2.createPair(address(token), address(aapl));
        give(alice, 100e18);
        give(v3Pool, 100e18);
        give(v2Pair, 200e18);
        pay(tsla, 400e18);
        later(STREAM);
        assertTrue(token.isPancakePool(v3Pool));
        assertTrue(token.isPancakePool(v2Pair));

        vm.startPrank(carol);
        token.excludePool(v3Pool);
        token.excludePool(v2Pair);
        vm.stopPrank();
        assertEq(token.eligibleSupply(), 100e18);
        later(STREAM);
        // The pools' 300 went back into the stream for Alice.
        assertEq(claimable(address(tsla), alice), 400e18);
    }

    function testFakeAndUnrelatedPoolsCannotBeExcluded() public {
        FakePool fake = new FakePool(address(token), address(tsla), 2500);
        vm.expectRevert(FortuneStockRewardsToken.NotAPancakePool.selector);
        token.excludePool(address(fake));

        address otherPool = v3.createPool(address(tsla), address(aapl), 2500, address(this));
        vm.expectRevert(FortuneStockRewardsToken.NotAPancakePool.selector);
        token.excludePool(otherPool);

        vm.expectRevert(FortuneStockRewardsToken.NotAPancakePool.selector);
        token.excludePool(alice);
        vm.expectRevert(FortuneStockRewardsToken.NotAPancakePool.selector);
        token.excludePool(address(tsla));
    }

    // ------------------------------------------------------ hostile assets

    function testAPausedRewardAssetNeverBlocksTransfersOrOtherClaims() public {
        PausableStock paused = new PausableStock("PAUSE");
        token = deploy(assets2(address(paused), address(tsla)));
        give(alice, 100e18);
        paused.mint(address(token), 600e18);
        tsla.mint(address(token), 600e18);
        token.sync();
        later(STREAM);
        paused.setPaused(true);

        give(bob, 100e18);
        vm.prank(alice);
        token.transfer(carol, 50e18);

        vm.expectEmit(address(token));
        emit RewardClaimFailed(alice, address(paused), 600e18);
        vm.prank(alice);
        uint256[] memory paid = token.claim();
        assertEq(paid[0], 0);
        assertEq(paid[1], 600e18);
        assertEq(tsla.balanceOf(alice), 600e18);

        paused.setPaused(false);
        assertEq(claimable(address(paused), alice), 600e18);
        vm.prank(alice);
        paid = token.claim();
        assertEq(paid[0], 600e18);
        assertEq(paused.balanceOf(alice), 600e18);
    }

    function testHostileBalanceReadsCostBoundedGas() public {
        HostileReadStock hostile = new HostileReadStock("HOSTILE");
        token = deploy(assets2(address(hostile), address(tsla)));
        give(alice, 100e18);
        tsla.mint(address(token), 600e18);
        for (uint8 mode = 1; mode <= 2; ++mode) {
            hostile.setMode(mode);
            later(1);
            uint256 before = gasleft();
            vm.prank(alice);
            token.transfer(bob, 1e18);
            uint256 used = before - gasleft();
            assertLt(used, 400_000, "transfer gas");
        }
        hostile.setMode(0);
        later(STREAM);
        assertGt(claimable(address(tsla), alice), 0);
    }

    function testTokensThatReturnNothingOrFalse() public {
        NoReturnStock noReturn = new NoReturnStock();
        FalseReturnStock refusing = new FalseReturnStock("FALSE");
        token = deploy(assets2(address(noReturn), address(refusing)));
        give(alice, 100e18);
        noReturn.mint(address(token), 600e18);
        refusing.mint(address(token), 600e18);
        token.sync();
        later(STREAM);
        refusing.setRefuse(true);
        vm.prank(alice);
        uint256[] memory paid = token.claim();
        assertEq(paid[0], 600e18);
        assertEq(noReturn.balanceOf(alice), 600e18);
        assertEq(paid[1], 0);
        assertEq(claimable(address(refusing), alice), 600e18);
        refusing.setRefuse(false);
        vm.prank(alice);
        paid = token.claim();
        assertEq(paid[1], 600e18);
    }

    function testACallbackDuringAClaimCannotInflateTheNextPayment() public {
        HookStock hook = new HookStock("HOOK");
        token = deploy(assets2(address(hook), address(tsla)));
        SlipperyHolder holder = new SlipperyHolder(token, carol);
        give(address(holder), 100e18);
        hook.mint(address(token), 600e18);
        tsla.mint(address(token), 600e18);
        token.sync();
        later(STREAM);

        uint256[] memory paid = holder.claim();
        // The hook moved all of the holder's tokens to Carol before the TSLA payment.
        assertEq(token.balanceOf(address(holder)), 0);
        assertEq(token.balanceOf(carol), 100e18);
        assertEq(paid[0], 600e18);
        assertEq(paid[1], 600e18);
        assertEq(tsla.balanceOf(address(holder)), 600e18);
        assertEq(claimable(address(tsla), carol), 0);
        assertEq(claimable(address(tsla), address(holder)), 0);
    }

    function testRewardsCannotBeClaimedTwice() public {
        give(alice, 100e18);
        pay(tsla, 600e18);
        later(STREAM);
        vm.startPrank(alice);
        token.claim();
        uint256[] memory again = token.claim();
        vm.stopPrank();
        assertEq(again[0], 0);
        assertEq(tsla.balanceOf(alice), 600e18);
        assertEq(tsla.balanceOf(address(token)), 0);
    }

    function testViewsRejectUnknownAssets() public {
        vm.expectRevert(FortuneStockRewardsToken.UnknownRewardAsset.selector);
        token.claimableOf(address(0xBEEF), alice);
        vm.expectRevert(FortuneStockRewardsToken.UnknownRewardAsset.selector);
        token.rewardState(address(0xBEEF));
    }

    function testBalancesBeyondTheSupportedRangeAreIgnored() public {
        give(alice, 100e18);
        tsla.mint(address(token), uint256(type(uint96).max) + 1);
        token.sync();
        assertEq(token.previewRewardState(address(tsla)).streaming, 0);
        later(STREAM);
        vm.prank(alice);
        token.transfer(bob, 1e18);
        assertEq(claimable(address(tsla), alice), 0);
        // Other assets are unaffected.
        pay(aapl, 60e6);
        later(STREAM);
        assertApproxEqAbs(claimable(address(aapl), alice), uint256(60e6) * 99 / 100, 1);
    }

    /// What releasing five streams adds to the first transfer in a block, which
    /// a gas estimate made in a block that already moved the token leaves out.
    function testAccrualGasOnTopOfATransfer() public {
        address[] memory five = new address[](5);
        for (uint256 i; i < 5; ++i) {
            five[i] = address(new MockStock("S", 18));
        }
        token = deploy(five);
        give(alice, 100e18);
        give(bob, 100e18);
        for (uint256 i; i < 5; ++i) {
            MockStock(five[i]).mint(address(token), 600e18);
        }
        token.sync();
        later(1 hours);
        // Warm both holders' correction slots so only the accrual differs.
        vm.prank(alice);
        token.transfer(bob, 1e18);
        later(1 hours);
        vm.prank(alice);
        uint256 before = gasleft();
        token.transfer(bob, 1e18);
        uint256 first = before - gasleft();
        vm.prank(alice);
        before = gasleft();
        token.transfer(bob, 1e18);
        uint256 second = before - gasleft();
        emit log_named_uint("accrual of five streams", first - second);
        assertLt(first - second, 120_000);
    }

    function testTransferGasWithFiveActiveStreams() public {
        address[] memory five = new address[](5);
        for (uint256 i; i < 5; ++i) {
            five[i] = address(new MockStock("S", 18));
        }
        token = deploy(five);
        give(alice, 100e18);
        give(bob, 100e18);
        for (uint256 i; i < 5; ++i) {
            MockStock(five[i]).mint(address(token), 600e18);
        }
        token.sync();
        later(1 hours);
        vm.prank(alice);
        uint256 before = gasleft();
        token.transfer(carol, 10e18);
        uint256 used = before - gasleft();
        // Worst case: five streams to release and ten first-time correction slots.
        emit log_named_uint("first transfer in a block, 5 streams, new recipient", used);
        assertLt(used, 500_000);
        vm.prank(bob);
        before = gasleft();
        token.transfer(alice, 10e18);
        used = before - gasleft();
        // Bob's correction slots are written for the first time too.
        emit log_named_uint("second transfer in the same block", used);
        assertLt(used, 250_000);
    }
}
