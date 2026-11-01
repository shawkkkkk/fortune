// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {WorkBase} from "./FortuneTestnetWorkEscrow.t.sol";
import {FortuneTestnetWorkEscrow as E} from "../src/FortuneTestnetWorkEscrow.sol";

contract FortuneTestnetWorkResultDisputesTest is WorkBase {
    bytes32 constant A = bytes32(uint256(1));
    bytes32 constant B = bytes32(uint256(2));

    function resultJob() internal returns (uint256 id) {
        id = accepted(100);
        vm.prank(WORKER);
        escrow.submitResult(id, 0, A);
    }

    function testStaleDisputeRejectsAndLatestRevisionRemainsAfterSettlement() public {
        uint256 id = resultJob();
        vm.prank(WORKER);
        escrow.submitResult(id, 1, B);
        vm.startPrank(CLIENT);
        vm.expectRevert(E.InvalidResult.selector);
        escrow.disputeResult(id, 1, A);
        vm.expectRevert(E.InvalidResult.selector);
        escrow.disputeResult(id, 2, A);
        assertEq(escrow.disputedResultRevision(id), 0);
        assertEq(uint256(state(id)), uint256(E.State.Accepted));
        escrow.disputeResult(id, 2, B);
        vm.stopPrank();
        assertEq(escrow.reserved(address(asset)), 100);
        vm.prank(WORKER);
        vm.expectRevert(E.WrongState.selector);
        escrow.submitResult(id, 2, A);
        vm.prank(ARB);
        escrow.resolve(id, 40);
        assertEq(escrow.disputedResultRevision(id), 2);
        assertEq(escrow.resultHashes(id, 2), B);
        assertEq(asset.balanceOf(WORKER), 40);
        assertEq(escrow.reserved(address(asset)), 0);
    }

    function testOnlyPartiesEvenAfterDeadlineAndLegacyDisputeUnchanged() public {
        uint256 id = resultJob();
        vm.warp(block.timestamp + 201);
        vm.prank(OTHER);
        vm.expectRevert(E.Unauthorized.selector);
        escrow.disputeResult(id, 1, A);
        vm.prank(WORKER);
        escrow.disputeResult(id, 1, A);
        uint256 legacy = resultJob();
        (,,,,, uint64 deadline,,) = escrow.jobs(legacy);
        vm.warp(uint256(deadline) + 1);
        vm.prank(OTHER);
        escrow.dispute(legacy);
        assertEq(escrow.disputedResultRevision(legacy), 0);
        assertEq(uint256(state(legacy)), uint256(E.State.Disputed));
    }

    function testPauseChainAndMissingResultRejectWithoutChangingLiabilities() public {
        uint256 id = accepted(100);
        vm.prank(CLIENT);
        vm.expectRevert(E.InvalidResult.selector);
        escrow.disputeResult(id, 0, bytes32(0));
        vm.prank(WORKER);
        escrow.submitResult(id, 0, A);
        vm.prank(GUARD);
        escrow.setPaused(true);
        vm.prank(CLIENT);
        vm.expectRevert();
        escrow.disputeResult(id, 1, A);
        vm.prank(GOV);
        escrow.setPaused(false);
        vm.chainId(56);
        vm.prank(CLIENT);
        vm.expectRevert();
        escrow.disputeResult(id, 1, A);
        vm.chainId(97);
        assertEq(escrow.disputedResultRevision(id), 0);
        assertEq(escrow.reserved(address(asset)), 100);
    }
}
