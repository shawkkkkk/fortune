// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {WorkBase} from "./FortuneTestnetWorkEscrow.t.sol";
import {FortuneTestnetWorkEscrow as E} from "../src/FortuneTestnetWorkEscrow.sol";

contract FortuneTestnetWorkDeclineTest is WorkBase {
    function testWholeRefundPreservesFundingIdTermsAndOtherLiabilities() public {
        bytes32 key = bytes32(uint256(1));
        uint64 a = uint64(block.timestamp + 100);
        uint64 d = uint64(block.timestamp + 200);
        vm.startPrank(CLIENT);
        asset.approve(address(escrow), 1000);
        uint256 id = escrow.fundWithId(key, WORKER, address(asset), 100, key, a, d);
        vm.stopPrank();
        uint256 other = accepted(30);
        vm.prank(WORKER);
        escrow.decline(id);
        (
            address client,
            address worker,
            address token,
            uint128 amount,
            uint64 acceptBy,
            uint64 deliverBy,
            bytes32 terms,
        ) = escrow.jobs(id);
        assertEq(client, CLIENT);
        assertEq(worker, WORKER);
        assertEq(token, address(asset));
        assertEq(amount, 100);
        assertEq(terms, key);
        assertEq(acceptBy, a);
        assertEq(deliverBy, d);
        assertEq(uint256(state(id)), uint256(E.State.Settled));
        assertEq(uint256(state(other)), uint256(E.State.Accepted));
        assertEq(escrow.fundingJobs(CLIENT, key), id);
        assertEq(escrow.nextJob(), 3);
        assertEq(escrow.latestResultRevision(id), 0);
        assertEq(escrow.reserved(address(asset)), 30);
        assertEq(asset.balanceOf(address(escrow)), 30);
        assertEq(asset.balanceOf(CLIENT), 1e36 - 30);
        assertEq(asset.balanceOf(WORKER), 0);
        vm.prank(CLIENT);
        vm.expectRevert(E.FundingIdUsed.selector);
        escrow.fundWithId(key, OTHER, address(asset), 50, key, a, d);
    }

    function testOnlyNamedWorkerFundedAndFirstTransitionWins() public {
        uint256 id = fund(100);
        address[5] memory callers = [CLIENT, GOV, GUARD, ARB, OTHER];
        for (uint256 i; i < callers.length; ++i) {
            vm.prank(callers[i]);
            vm.expectRevert(E.Unauthorized.selector);
            escrow.decline(id);
        }
        vm.prank(WORKER);
        vm.expectRevert(E.Unauthorized.selector);
        escrow.decline(999);
        vm.startPrank(WORKER);
        escrow.decline(id);
        vm.expectRevert(E.WrongState.selector);
        escrow.decline(id);
        vm.expectRevert(E.WrongState.selector);
        escrow.accept(id);
        vm.stopPrank();
        vm.prank(CLIENT);
        vm.expectRevert(E.WrongState.selector);
        escrow.cancel(id);
        uint256 taken = accepted(20);
        vm.prank(WORKER);
        vm.expectRevert(E.WrongState.selector);
        escrow.decline(taken);
        vm.prank(CLIENT);
        escrow.dispute(taken);
        vm.prank(WORKER);
        vm.expectRevert(E.WrongState.selector);
        escrow.decline(taken);
        uint256 cancelled = fund(10);
        vm.prank(CLIENT);
        escrow.cancel(cancelled);
        vm.prank(WORKER);
        vm.expectRevert(E.WrongState.selector);
        escrow.decline(cancelled);
        assertEq(escrow.reserved(address(asset)), 20);
    }

    function testInexactRefundRollsBackForExplicitRetry() public {
        uint256 id = fund(100);
        asset.configure(true, false, address(0));
        vm.prank(WORKER);
        vm.expectRevert(E.InexactTransfer.selector);
        escrow.decline(id);
        assertEq(uint256(state(id)), uint256(E.State.Funded));
        assertEq(escrow.reserved(address(asset)), 100);
        assertEq(asset.balanceOf(address(escrow)), 100);
        assertEq(asset.balanceOf(CLIENT), 1e36 - 100);
        asset.configure(false, false, address(0));
        vm.prank(WORKER);
        escrow.decline(id);
        assertEq(asset.balanceOf(CLIENT), 1e36);
        assertEq(escrow.reserved(address(asset)), 0);
    }

    function testPauseChainAndRuntimeGatesPreserveFundedJob() public {
        uint256 id = fund(100);
        vm.prank(GUARD);
        escrow.setPaused(true);
        vm.prank(WORKER);
        vm.expectRevert(E.Paused.selector);
        escrow.decline(id);
        vm.chainId(1);
        vm.prank(WORKER);
        vm.expectRevert(E.WrongChain.selector);
        escrow.decline(id);
        vm.chainId(97);
        vm.prank(GOV);
        escrow.setPaused(false);
        bytes memory original = address(asset).code;
        vm.etch(address(asset), hex"00");
        vm.prank(WORKER);
        vm.expectRevert(E.UntrustedAsset.selector);
        escrow.decline(id);
        assertEq(uint256(state(id)), uint256(E.State.Funded));
        assertEq(escrow.reserved(address(asset)), 100);
        vm.etch(address(asset), original);
        vm.prank(WORKER);
        escrow.decline(id);
        assertEq(asset.balanceOf(CLIENT), 1e36);
    }

    function testFuzzWholeRefundBeforeOrAfterAcceptanceDeadline(uint128 raw, uint32 elapsed) public {
        uint128 amount = uint128(bound(raw, 1, 1000));
        uint256 id = fund(amount);
        vm.warp(block.timestamp + bound(elapsed, 0, 8 days));
        vm.prank(WORKER);
        escrow.decline(id);
        assertEq(asset.balanceOf(CLIENT), 1e36);
        assertEq(asset.balanceOf(WORKER), 0);
        assertEq(escrow.reserved(address(asset)), 0);
        assertEq(uint256(state(id)), uint256(E.State.Settled));
    }
}
