// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {WorkBase} from "./FortuneTestnetWorkEscrow.t.sol";
import {FortuneTestnetWorkEscrow as E} from "../src/FortuneTestnetWorkEscrow.sol";
import {CounterAssetMock} from "./FortuneTestnetCounterEscrow.t.sol";

contract FortuneTestnetWorkBatchWaiverTest is WorkBase {
    CounterAssetMock second;
    event PaymentWaived(uint256 indexed id, address indexed worker, uint256 resultRevision);

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
        id = escrow.fund(
            WORKER,
            address(second),
            30,
            bytes32(uint256(42)),
            uint64(block.timestamp + 100),
            uint64(block.timestamp + 200)
        );
        vm.stopPrank();
        vm.prank(WORKER);
        escrow.accept(id);
    }

    function pair(uint256 first, uint256 last) private pure returns (E.PaymentWaiver[] memory w) {
        w = new E.PaymentWaiver[](2);
        w[0] = E.PaymentWaiver(first, 0);
        w[1] = E.PaymentWaiver(last, 0);
    }

    function testMixedClientsAssetsRevisionsAndReplayAfterDeadline() public {
        uint256 one = accepted(100);
        uint256 two = otherJob();
        vm.prank(WORKER);
        escrow.submitResult(two, 0, bytes32(uint256(7)));
        E.PaymentWaiver[] memory w = pair(one, two);
        w[1].expectedRevision = 1;
        (,,,,, uint64 deadline,,) = escrow.jobs(two);
        vm.warp(uint256(deadline) + 1);
        vm.expectEmit(true, true, false, true, address(escrow));
        emit PaymentWaived(one, WORKER, 0);
        vm.expectEmit(true, true, false, true, address(escrow));
        emit PaymentWaived(two, WORKER, 1);
        vm.prank(WORKER);
        escrow.waivePaymentsMany(w);
        assertEq(asset.balanceOf(CLIENT), 1e36);
        assertEq(second.balanceOf(OTHER), 10000);
        assertEq(asset.balanceOf(WORKER), 0);
        assertEq(second.balanceOf(WORKER), 0);
        assertEq(escrow.reserved(address(asset)), 0);
        assertEq(escrow.reserved(address(second)), 0);
        assertEq(uint256(state(one)), uint256(E.State.Settled));
        assertEq(uint256(state(two)), uint256(E.State.Settled));
        assertEq(escrow.resultHashes(two, 1), bytes32(uint256(7)));
        vm.prank(WORKER);
        vm.expectRevert(E.WrongState.selector);
        escrow.waivePaymentsMany(w);
    }

    function testLateInexactTransferRollsBackAllAndExactRetry() public {
        uint256 one = accepted(100);
        uint256 two = otherJob();
        E.PaymentWaiver[] memory w = pair(one, two);
        second.configure(true, false, address(0));
        vm.prank(WORKER);
        vm.expectRevert(E.InexactTransfer.selector);
        escrow.waivePaymentsMany(w);
        assertEq(asset.balanceOf(CLIENT), 1e36 - 100);
        assertEq(second.balanceOf(OTHER), 9970);
        assertEq(asset.balanceOf(address(escrow)), 100);
        assertEq(second.balanceOf(address(escrow)), 30);
        assertEq(escrow.reserved(address(asset)), 100);
        assertEq(escrow.reserved(address(second)), 30);
        assertEq(uint256(state(one)), uint256(E.State.Accepted));
        assertEq(uint256(state(two)), uint256(E.State.Accepted));
        second.configure(false, false, address(0));
        vm.prank(WORKER);
        escrow.waivePaymentsMany(w);
        assertEq(asset.balanceOf(CLIENT), 1e36);
        assertEq(second.balanceOf(OTHER), 10000);
    }

    function testLateRevisionAndAssetPinRejectBeforeRefund() public {
        uint256 one = accepted(100);
        uint256 two = otherJob();
        E.PaymentWaiver[] memory w = pair(one, two);
        vm.prank(CLIENT);
        vm.expectRevert(E.Unauthorized.selector);
        escrow.waivePaymentsMany(w);
        vm.prank(WORKER);
        escrow.submitResult(two, 0, bytes32(uint256(8)));
        vm.prank(WORKER);
        vm.expectRevert(E.InvalidResult.selector);
        escrow.waivePaymentsMany(w);
        assertEq(asset.balanceOf(CLIENT), 1e36 - 100);
        w[1].expectedRevision = 1;
        vm.etch(address(second), hex"60006000fd");
        vm.prank(WORKER);
        vm.expectRevert(E.UntrustedAsset.selector);
        escrow.waivePaymentsMany(w);
        assertEq(uint256(state(one)), uint256(E.State.Accepted));
        assertEq(escrow.reserved(address(asset)), 100);
    }

    function testBoundsOrderPauseChainAndDisputeReject() public {
        uint256 one = accepted(100);
        uint256 two = accepted(30);
        E.PaymentWaiver[] memory w = pair(one, two);
        vm.startPrank(WORKER);
        vm.expectRevert(E.InvalidResult.selector);
        escrow.waivePaymentsMany(new E.PaymentWaiver[](0));
        vm.expectRevert(E.InvalidResult.selector);
        escrow.waivePaymentsMany(new E.PaymentWaiver[](17));
        vm.expectRevert(E.InvalidResult.selector);
        escrow.waivePaymentsMany(pair(one, one));
        vm.expectRevert(E.InvalidResult.selector);
        escrow.waivePaymentsMany(pair(two, one));
        vm.expectRevert(E.InvalidResult.selector);
        escrow.waivePaymentsMany(pair(0, two));
        vm.stopPrank();
        vm.prank(GUARD);
        escrow.setPaused(true);
        vm.prank(WORKER);
        vm.expectRevert(E.Paused.selector);
        escrow.waivePaymentsMany(w);
        vm.chainId(1);
        vm.expectRevert(E.WrongChain.selector);
        escrow.waivePaymentsMany(w);
        vm.chainId(97);
        vm.prank(GOV);
        escrow.setPaused(false);
        vm.prank(CLIENT);
        escrow.dispute(two);
        vm.prank(WORKER);
        vm.expectRevert(E.WrongState.selector);
        escrow.waivePaymentsMany(w);
        assertEq(escrow.reserved(address(asset)), 130);
        assertEq(uint256(state(one)), uint256(E.State.Accepted));
    }

    function testLateForeignWorkerAndUnacceptedJobPreserveEarlierLiability() public {
        uint256 one = accepted(100);
        uint256 unaccepted = fund(30);
        vm.prank(WORKER);
        vm.expectRevert(E.WrongState.selector);
        escrow.waivePaymentsMany(pair(one, unaccepted));
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
        vm.prank(OTHER);
        escrow.accept(foreign);
        vm.prank(WORKER);
        vm.expectRevert(E.Unauthorized.selector);
        escrow.waivePaymentsMany(pair(one, foreign));
        assertEq(uint256(state(one)), uint256(E.State.Accepted));
        assertEq(escrow.reserved(address(asset)), 150);
        assertEq(asset.balanceOf(CLIENT), 1e36 - 150);
    }

    function testFuzzOneThroughSixteen(uint8 raw) public {
        uint256 count = bound(raw, 1, 16);
        E.PaymentWaiver[] memory w = new E.PaymentWaiver[](count);
        for (uint256 i; i < count; ++i) {
            w[i] = E.PaymentWaiver(accepted(1), 0);
        }
        vm.prank(WORKER);
        escrow.waivePaymentsMany(w);
        assertEq(asset.balanceOf(CLIENT), 1e36);
        assertEq(escrow.reserved(address(asset)), 0);
        for (uint256 i; i < count; ++i) {
            assertEq(uint256(state(w[i].id)), uint256(E.State.Settled));
        }
    }
}
