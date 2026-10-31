// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {WorkBase} from "./FortuneTestnetWorkEscrow.t.sol";
import {FortuneTestnetWorkEscrow as E} from "../src/FortuneTestnetWorkEscrow.sol";

contract FortuneTestnetWorkResultsTest is WorkBase {
    bytes32 constant A = bytes32(uint256(1));
    bytes32 constant B = bytes32(uint256(2));

    function submit(uint256 id, uint256 previous, bytes32 hash) internal {
        vm.prank(WORKER);
        escrow.submitResult(id, previous, hash);
    }

    function testHistoryAndPaymentAreBoundToLatestRevision() public {
        uint256 id = accepted(100);
        submit(id, 0, A);
        submit(id, 1, B);
        assertEq(escrow.resultHashes(id, 1), A);
        assertEq(escrow.resultHashes(id, 2), B);
        vm.startPrank(CLIENT);
        vm.expectRevert(E.InvalidResult.selector);
        escrow.approveResult(id, 1, A);
        vm.expectRevert(E.InvalidResult.selector);
        escrow.approveResult(id, 2, A);
        assertEq(escrow.reserved(address(asset)), 100);
        escrow.approveResult(id, 2, B);
        vm.expectRevert(E.WrongState.selector);
        escrow.approveResult(id, 2, B);
        vm.stopPrank();
        assertEq(asset.balanceOf(WORKER), 100);
        assertEq(escrow.reserved(address(asset)), 0);
        assertEq(escrow.resultHashes(id, 1), A);
        assertEq(escrow.latestResultRevision(id), 2);
    }

    function testSubmissionRolesStatesAndConcurrentRevisionFailClosed() public {
        uint256 id = fund(100);
        vm.prank(WORKER);
        vm.expectRevert(E.WrongState.selector);
        escrow.submitResult(id, 0, A);
        vm.prank(WORKER);
        escrow.accept(id);
        vm.prank(CLIENT);
        vm.expectRevert(E.Unauthorized.selector);
        escrow.submitResult(id, 0, A);
        vm.prank(OTHER);
        vm.expectRevert(E.Unauthorized.selector);
        escrow.approveResult(id, 1, A);
        vm.prank(WORKER);
        vm.expectRevert(E.InvalidResult.selector);
        escrow.submitResult(id, 0, bytes32(0));
        submit(id, 0, A);
        vm.prank(WORKER);
        vm.expectRevert(E.InvalidResult.selector);
        escrow.submitResult(id, 0, B);
        vm.prank(WORKER);
        vm.expectRevert(E.InvalidResult.selector);
        escrow.submitResult(id, 1, A);
        vm.prank(CLIENT);
        escrow.dispute(id);
        vm.prank(WORKER);
        vm.expectRevert(E.WrongState.selector);
        escrow.submitResult(id, 1, B);
        assertEq(escrow.latestResultRevision(id), 1);
        assertEq(escrow.reserved(address(asset)), 100);
    }

    function testThirtyTwoRevisionCapPreservesEveryCommitment() public {
        uint256 id = accepted(100);
        for (uint256 i = 1; i <= 32; i++) {
            submit(id, i - 1, bytes32(i));
        }
        vm.prank(WORKER);
        vm.expectRevert(E.InvalidResult.selector);
        escrow.submitResult(id, 32, bytes32(uint256(33)));
        for (uint256 i = 1; i <= 32; i++) {
            assertEq(escrow.resultHashes(id, i), bytes32(i));
        }
        assertEq(escrow.latestResultRevision(id), 32);
        assertEq(escrow.reserved(address(asset)), 100);
    }

    function testExactDeliveryBoundaryAndLateSubmission() public {
        uint256 id = accepted(100);
        (,,,,, uint64 deadline,,) = escrow.jobs(id);
        vm.warp(deadline);
        submit(id, 0, A);
        vm.warp(uint256(deadline) + 1);
        vm.prank(WORKER);
        vm.expectRevert(E.WrongState.selector);
        escrow.submitResult(id, 1, B);
        vm.prank(CLIENT);
        escrow.approveResult(id, 1, A);
        assertEq(asset.balanceOf(WORKER), 100);
    }

    function testInexactBoundPaymentPreservesResultAndLiabilityForExplicitRetry() public {
        uint256 id = accepted(100);
        submit(id, 0, A);
        asset.configure(true, false, address(0));
        vm.prank(CLIENT);
        vm.expectRevert(E.InexactTransfer.selector);
        escrow.approveResult(id, 1, A);
        assertEq(uint256(state(id)), uint256(E.State.Accepted));
        assertEq(escrow.resultHashes(id, 1), A);
        assertEq(escrow.reserved(address(asset)), 100);
        assertEq(asset.balanceOf(WORKER), 0);
        asset.configure(false, false, address(0));
        vm.prank(CLIENT);
        escrow.approveResult(id, 1, A);
        vm.prank(WORKER);
        vm.expectRevert(E.WrongState.selector);
        escrow.submitResult(id, 1, B);
    }

    function testPauseChainAndLegacyApprovalRemainExplicit() public {
        uint256 id = accepted(100);
        vm.prank(GUARD);
        escrow.setPaused(true);
        vm.prank(WORKER);
        vm.expectRevert(E.Paused.selector);
        escrow.submitResult(id, 0, A);
        vm.prank(CLIENT);
        vm.expectRevert(E.Paused.selector);
        escrow.approveResult(id, 1, A);
        vm.chainId(1);
        vm.expectRevert(E.WrongChain.selector);
        escrow.submitResult(id, 0, A);
        vm.expectRevert(E.WrongChain.selector);
        escrow.approveResult(id, 1, A);
        vm.chainId(97);
        vm.prank(GOV);
        escrow.setPaused(false);
        vm.prank(CLIENT);
        vm.expectRevert(E.InvalidResult.selector);
        escrow.approveResult(id, 0, bytes32(0));
        vm.prank(CLIENT);
        escrow.approvePayment(id);
        assertEq(asset.balanceOf(WORKER), 100);
        assertEq(escrow.latestResultRevision(id), 0);
    }
}
