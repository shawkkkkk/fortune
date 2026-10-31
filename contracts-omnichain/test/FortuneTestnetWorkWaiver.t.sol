// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {WorkBase} from "./FortuneTestnetWorkEscrow.t.sol";
import {FortuneTestnetWorkEscrow as E} from "../src/FortuneTestnetWorkEscrow.sol";

contract FortuneTestnetWorkWaiverTest is WorkBase {
    function testRevisionBoundWaiverPreservesHistoryAndOtherJobs() public {
        uint256 id = accepted(100);
        uint256 other = accepted(30);
        vm.startPrank(WORKER);
        escrow.submitResult(id, 0, bytes32(uint256(1)));
        vm.expectRevert(E.InvalidResult.selector);
        escrow.waivePayment(id, 0);
        escrow.waivePayment(id, 1);
        vm.expectRevert(E.WrongState.selector);
        escrow.waivePayment(id, 1);
        vm.stopPrank();
        assertEq(uint256(state(id)), uint256(E.State.Settled));
        assertEq(uint256(state(other)), uint256(E.State.Accepted));
        assertEq(escrow.reserved(address(asset)), 30);
        assertEq(asset.balanceOf(address(escrow)), 30);
        assertEq(asset.balanceOf(CLIENT), 1e36 - 30);
        assertEq(asset.balanceOf(WORKER), 0);
        assertEq(escrow.resultHashes(id, 1), bytes32(uint256(1)));
        vm.prank(CLIENT);
        vm.expectRevert(E.WrongState.selector);
        escrow.approveResult(id, 1, bytes32(uint256(1)));
    }

    function testOnlyWorkerAcceptedOpenChain97CanWaive() public {
        uint256 id = fund(100);
        vm.prank(WORKER);
        vm.expectRevert(E.WrongState.selector);
        escrow.waivePayment(id, 0);
        vm.prank(WORKER);
        escrow.accept(id);
        address[4] memory callers = [CLIENT, GOV, GUARD, ARB];
        for (uint256 i; i < callers.length; ++i) {
            vm.prank(callers[i]);
            vm.expectRevert(E.Unauthorized.selector);
            escrow.waivePayment(id, 0);
        }
        vm.prank(GUARD);
        escrow.setPaused(true);
        vm.prank(WORKER);
        vm.expectRevert(E.Paused.selector);
        escrow.waivePayment(id, 0);
        vm.chainId(1);
        vm.expectRevert(E.WrongChain.selector);
        escrow.waivePayment(id, 0);
        vm.chainId(97);
        vm.prank(GOV);
        escrow.setPaused(false);
        vm.prank(CLIENT);
        escrow.dispute(id);
        vm.prank(WORKER);
        vm.expectRevert(E.WrongState.selector);
        escrow.waivePayment(id, 0);
        assertEq(escrow.reserved(address(asset)), 100);
    }

    function testInexactRefundPreservesLiabilityAndHistoryForExplicitRetry() public {
        uint256 id = accepted(100);
        vm.prank(WORKER);
        escrow.submitResult(id, 0, bytes32(uint256(1)));
        asset.configure(true, false, address(0));
        vm.prank(WORKER);
        vm.expectRevert(E.InexactTransfer.selector);
        escrow.waivePayment(id, 1);
        assertEq(uint256(state(id)), uint256(E.State.Accepted));
        assertEq(escrow.reserved(address(asset)), 100);
        assertEq(asset.balanceOf(CLIENT), 1e36 - 100);
        assertEq(escrow.latestResultRevision(id), 1);
        asset.configure(false, false, address(0));
        vm.prank(WORKER);
        escrow.waivePayment(id, 1);
        assertEq(asset.balanceOf(CLIENT), 1e36);
        assertEq(escrow.reserved(address(asset)), 0);
    }

    function testFuzzWholePrincipalReturnsAfterDeadline(uint128 raw) public {
        uint128 amount = uint128(bound(raw, 1, 1000));
        uint256 id = accepted(amount);
        (,,,,, uint64 deadline,,) = escrow.jobs(id);
        vm.warp(uint256(deadline) + 1);
        vm.prank(WORKER);
        escrow.waivePayment(id, 0);
        assertEq(asset.balanceOf(CLIENT), 1e36);
        assertEq(asset.balanceOf(WORKER), 0);
        assertEq(escrow.reserved(address(asset)), 0);
        assertEq(uint256(state(id)), uint256(E.State.Settled));
    }
}
