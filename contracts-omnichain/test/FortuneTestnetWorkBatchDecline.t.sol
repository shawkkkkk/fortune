// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {WorkBase} from "./FortuneTestnetWorkEscrow.t.sol";
import {FortuneTestnetWorkEscrow as E} from "../src/FortuneTestnetWorkEscrow.sol";
import {CounterAssetMock} from "./FortuneTestnetCounterEscrow.t.sol";

contract FortuneTestnetWorkBatchDeclineTest is WorkBase {
    CounterAssetMock second;
    event JobDeclined(uint256 indexed id, address indexed worker);

    function setUp() public override {
        super.setUp();
        second = new CounterAssetMock();
        E.Asset[] memory assets = new E.Asset[](2);
        (address a, address b) =
            address(asset) < address(second) ? (address(asset), address(second)) : (address(second), address(asset));
        assets[0] = E.Asset(a, a.codehash, 1000);
        assets[1] = E.Asset(b, b.codehash, 1000);
        escrow = new E(GOV, GUARD, ARB, assets);
        vm.prank(GOV);
        escrow.setPaused(false);
        second.mint(OTHER, 10000);
    }

    function otherJob() private returns (uint256 id) {
        vm.startPrank(OTHER);
        second.approve(address(escrow), 30);
        id = escrow.fundWithId(
            bytes32(uint256(42)),
            WORKER,
            address(second),
            30,
            bytes32(uint256(43)),
            uint64(block.timestamp + 100),
            uint64(block.timestamp + 200)
        );
        vm.stopPrank();
    }

    function pair(uint256 first, uint256 last) private pure returns (uint256[] memory ids) {
        ids = new uint256[](2);
        ids[0] = first;
        ids[1] = last;
    }

    function testMixedClientsAssetsAfterExpiryPreservesUnselectedLiabilityAndHistory() public {
        uint256 one = fund(100);
        uint256 two = otherJob();
        uint256 unselected = accepted(20);
        (,,,,, uint64 deadline,,) = escrow.jobs(two);
        vm.warp(uint256(deadline) + 1);
        vm.expectEmit(true, true, false, true, address(escrow));
        emit JobDeclined(one, WORKER);
        vm.expectEmit(true, true, false, true, address(escrow));
        emit JobDeclined(two, WORKER);
        vm.prank(WORKER);
        escrow.declineMany(pair(one, two));
        assertEq(asset.balanceOf(CLIENT), 1e36 - 20);
        assertEq(second.balanceOf(OTHER), 10000);
        assertEq(asset.balanceOf(WORKER), 0);
        assertEq(second.balanceOf(WORKER), 0);
        assertEq(escrow.reserved(address(asset)), 20);
        assertEq(escrow.reserved(address(second)), 0);
        assertEq(uint256(state(one)), uint256(E.State.Settled));
        assertEq(uint256(state(two)), uint256(E.State.Settled));
        assertEq(uint256(state(unselected)), uint256(E.State.Accepted));
        assertEq(escrow.fundingJobs(OTHER, bytes32(uint256(42))), two);
        assertEq(escrow.latestResultRevision(two), 0);
        (address client, address worker, address token, uint128 amount,,, bytes32 terms,) = escrow.jobs(two);
        assertEq(client, OTHER);
        assertEq(worker, WORKER);
        assertEq(token, address(second));
        assertEq(amount, 30);
        assertEq(terms, bytes32(uint256(43)));
        vm.prank(WORKER);
        vm.expectRevert(E.WrongState.selector);
        escrow.declineMany(pair(one, two));
        vm.prank(WORKER);
        vm.expectRevert(E.WrongState.selector);
        escrow.accept(one);
        vm.prank(CLIENT);
        vm.expectRevert(E.WrongState.selector);
        escrow.cancel(one);
    }

    function testLateTaxRollsBackEarlierRefundAndExactRetry() public {
        uint256 one = fund(100);
        uint256 two = otherJob();
        uint256[] memory ids = pair(one, two);
        second.configure(true, false, address(0));
        vm.prank(WORKER);
        vm.expectRevert(E.InexactTransfer.selector);
        escrow.declineMany(ids);
        assertEq(asset.balanceOf(CLIENT), 1e36 - 100);
        assertEq(second.balanceOf(OTHER), 9970);
        assertEq(asset.balanceOf(address(escrow)), 100);
        assertEq(second.balanceOf(address(escrow)), 30);
        assertEq(escrow.reserved(address(asset)), 100);
        assertEq(escrow.reserved(address(second)), 30);
        assertEq(uint256(state(one)), uint256(E.State.Funded));
        assertEq(uint256(state(two)), uint256(E.State.Funded));
        assertEq(escrow.fundingJobs(OTHER, bytes32(uint256(42))), two);
        second.configure(false, false, address(0));
        vm.prank(WORKER);
        escrow.declineMany(ids);
        assertEq(asset.balanceOf(CLIENT), 1e36);
        assertEq(second.balanceOf(OTHER), 10000);
    }

    function testLateForeignWorkerOrAcceptedJobRejectsWholeCall() public {
        uint256 one = fund(100);
        uint256 two = otherJob();
        vm.prank(WORKER);
        escrow.accept(two);
        vm.prank(WORKER);
        vm.expectRevert(E.WrongState.selector);
        escrow.declineMany(pair(one, two));
        vm.startPrank(CLIENT);
        asset.approve(address(escrow), 20);
        uint256 foreign = escrow.fund(
            OTHER,
            address(asset),
            20,
            bytes32(uint256(88)),
            uint64(block.timestamp + 100),
            uint64(block.timestamp + 200)
        );
        vm.stopPrank();
        vm.prank(WORKER);
        vm.expectRevert(E.Unauthorized.selector);
        escrow.declineMany(pair(one, foreign));
        vm.prank(OTHER);
        escrow.dispute(two);
        vm.prank(WORKER);
        vm.expectRevert(E.WrongState.selector);
        escrow.declineMany(pair(one, two));
        assertEq(uint256(state(one)), uint256(E.State.Funded));
        assertEq(escrow.reserved(address(asset)), 120);
        assertEq(escrow.reserved(address(second)), 30);
    }

    function testLateRuntimeOrMissingJobAndForeignCallersReject() public {
        uint256 one = fund(100);
        uint256 two = otherJob();
        address[5] memory callers = [CLIENT, GOV, GUARD, ARB, OTHER];
        for (uint256 i; i < callers.length; ++i) {
            vm.prank(callers[i]);
            vm.expectRevert(E.Unauthorized.selector);
            escrow.declineMany(pair(one, two));
        }
        vm.prank(WORKER);
        vm.expectRevert(E.Unauthorized.selector);
        escrow.declineMany(pair(one, 999));
        vm.etch(address(second), hex"60006000fd");
        vm.prank(WORKER);
        vm.expectRevert(E.UntrustedAsset.selector);
        escrow.declineMany(pair(one, two));
        assertEq(uint256(state(one)), uint256(E.State.Funded));
        assertEq(escrow.reserved(address(asset)), 100);
        assertEq(asset.balanceOf(CLIENT), 1e36 - 100);
    }

    function testBoundsOrderPauseChainAndCancelledState() public {
        uint256 one = fund(100);
        uint256 two = fund(30);
        vm.startPrank(WORKER);
        vm.expectRevert(E.InvalidJob.selector);
        escrow.declineMany(new uint256[](0));
        vm.expectRevert(E.InvalidJob.selector);
        escrow.declineMany(new uint256[](17));
        vm.expectRevert(E.InvalidJob.selector);
        escrow.declineMany(pair(one, one));
        vm.expectRevert(E.InvalidJob.selector);
        escrow.declineMany(pair(two, one));
        vm.expectRevert(E.InvalidJob.selector);
        escrow.declineMany(pair(0, two));
        vm.stopPrank();
        vm.prank(GUARD);
        escrow.setPaused(true);
        vm.prank(WORKER);
        vm.expectRevert(E.Paused.selector);
        escrow.declineMany(pair(one, two));
        vm.chainId(1);
        vm.expectRevert(E.WrongChain.selector);
        escrow.declineMany(pair(one, two));
        vm.chainId(97);
        vm.prank(GOV);
        escrow.setPaused(false);
        vm.prank(CLIENT);
        escrow.cancel(two);
        vm.prank(WORKER);
        vm.expectRevert(E.WrongState.selector);
        escrow.declineMany(pair(one, two));
        assertEq(uint256(state(one)), uint256(E.State.Funded));
        assertEq(escrow.reserved(address(asset)), 100);
    }

    function testFuzzOneThroughSixteenWholeRefund(uint8 raw, uint32 elapsed) public {
        uint256 count = bound(raw, 1, 16);
        uint256[] memory ids = new uint256[](count);
        for (uint256 i; i < count; ++i) {
            ids[i] = fund(1);
        }
        vm.warp(block.timestamp + bound(elapsed, 0, 8 days));
        vm.prank(WORKER);
        escrow.declineMany(ids);
        assertEq(asset.balanceOf(CLIENT), 1e36);
        assertEq(escrow.reserved(address(asset)), 0);
        for (uint256 i; i < count; ++i) {
            assertEq(uint256(state(ids[i])), uint256(E.State.Settled));
        }
    }
}
