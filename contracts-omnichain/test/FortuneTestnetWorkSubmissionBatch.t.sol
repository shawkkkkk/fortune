// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {WorkBase, E, CounterAssetMock} from "./FortuneTestnetWorkEscrow.t.sol";
import {Vm} from "forge-std/Vm.sol";

contract FortuneTestnetWorkSubmissionBatchTest is WorkBase {
    bytes32 constant A = bytes32(uint256(1));
    bytes32 constant B = bytes32(uint256(2));
    bytes32 constant C = bytes32(uint256(3));

    function batch(uint256 one, uint256 two) internal pure returns (E.ResultSubmission[] memory a) {
        a = new E.ResultSubmission[](2);
        a[0] = E.ResultSubmission(one, 0, A);
        a[1] = E.ResultSubmission(two, 0, B);
    }

    function testAtomicCommitmentsEmitCanonicalHistoryWithoutMovingPrincipal() public {
        uint256 one = accepted(10);
        uint256 two = accepted(20);
        uint256 balance = asset.balanceOf(address(escrow));
        vm.recordLogs();
        vm.prank(WORKER);
        escrow.submitResultsMany(batch(one, two));
        Vm.Log[] memory logs = vm.getRecordedLogs();
        assertEq(logs.length, 2);
        for (uint256 i; i < 2; ++i) {
            assertEq(logs[i].emitter, address(escrow));
            assertEq(logs[i].topics.length, 4);
            assertEq(logs[i].topics[0], keccak256("ResultSubmitted(uint256,address,uint256,bytes32)"));
            assertEq(logs[i].topics[1], bytes32(i + 1));
            assertEq(logs[i].topics[2], bytes32(uint256(uint160(WORKER))));
            assertEq(logs[i].topics[3], bytes32(uint256(1)));
            assertEq(logs[i].data, abi.encode(i == 0 ? A : B));
            assertEq(escrow.latestResultRevision(i + 1), 1);
            assertEq(uint256(state(i + 1)), uint256(E.State.Accepted));
        }
        assertEq(asset.balanceOf(address(escrow)), balance);
        assertEq(escrow.reserved(address(asset)), 30);
        assertEq(asset.balanceOf(WORKER), 0);
        vm.expectRevert(E.InvalidResult.selector);
        vm.prank(WORKER);
        escrow.submitResultsMany(batch(one, two));
        assertEq(escrow.latestResultRevision(one), 1);
    }

    function testBoundsOrderRolesAndLateWrongStateRejectWithoutHistory() public {
        uint256 one = accepted(10);
        uint256 two = fund(20);
        E.ResultSubmission[] memory a = batch(one, two);
        vm.startPrank(WORKER);
        vm.expectRevert(E.InvalidResult.selector);
        escrow.submitResultsMany(new E.ResultSubmission[](0));
        vm.expectRevert(E.InvalidResult.selector);
        escrow.submitResultsMany(new E.ResultSubmission[](17));
        a[1].id = one;
        vm.expectRevert(E.InvalidResult.selector);
        escrow.submitResultsMany(a);
        a[0].id = 0;
        vm.expectRevert(E.InvalidResult.selector);
        escrow.submitResultsMany(a);
        a = batch(one, two);
        vm.expectRevert(E.WrongState.selector);
        escrow.submitResultsMany(a);
        escrow.accept(two);
        vm.expectRevert(E.InvalidResult.selector);
        escrow.submitResultsMany(batch(two, one));
        vm.stopPrank();
        vm.expectRevert(E.Unauthorized.selector);
        vm.prank(CLIENT);
        escrow.submitResultsMany(a);
        vm.prank(CLIENT);
        escrow.dispute(two);
        vm.expectRevert(E.WrongState.selector);
        vm.prank(WORKER);
        escrow.submitResultsMany(a);
        vm.prank(ARB);
        escrow.resolve(two, 0);
        vm.expectRevert(E.WrongState.selector);
        vm.prank(WORKER);
        escrow.submitResultsMany(a);
        vm.startPrank(CLIENT);
        asset.approve(address(escrow), 5);
        uint256 foreign =
            escrow.fund(OTHER, address(asset), 5, C, uint64(block.timestamp + 100), uint64(block.timestamp + 200));
        vm.stopPrank();
        vm.prank(OTHER);
        escrow.accept(foreign);
        vm.expectRevert(E.Unauthorized.selector);
        vm.prank(WORKER);
        escrow.submitResultsMany(batch(one, foreign));
        assertEq(escrow.latestResultRevision(one), 0);
        assertEq(escrow.resultHashes(one, 1), bytes32(0));
    }

    function testLateRevisionZeroAndRepeatedHashesKeepEarlierHistoryUnchanged() public {
        uint256 one = accepted(10);
        uint256 two = accepted(20);
        vm.prank(WORKER);
        escrow.submitResult(two, 0, B);
        E.ResultSubmission[] memory a = batch(one, two);
        vm.startPrank(WORKER);
        vm.expectRevert(E.InvalidResult.selector);
        escrow.submitResultsMany(a);
        a[1].expectedRevision = 1;
        a[1].resultHash = bytes32(0);
        vm.expectRevert(E.InvalidResult.selector);
        escrow.submitResultsMany(a);
        a[1].resultHash = B;
        vm.expectRevert(E.InvalidResult.selector);
        escrow.submitResultsMany(a);
        assertEq(escrow.latestResultRevision(one), 0);
        assertEq(escrow.latestResultRevision(two), 1);
        a[1].resultHash = C;
        escrow.submitResultsMany(a);
        vm.stopPrank();
        assertEq(escrow.resultHashes(two, 1), B);
        assertEq(escrow.resultHashes(two, 2), C);
        assertEq(escrow.latestResultRevision(one), 1);
    }

    function testLateChangedAssetRuntimeRejectsAllAndExplicitExactRetryWorks() public {
        CounterAssetMock second = new CounterAssetMock();
        E.Asset[] memory assets = new E.Asset[](2);
        assets[0] = E.Asset(address(asset), address(asset).codehash, 1000);
        assets[1] = E.Asset(address(second), address(second).codehash, 1000);
        if (assets[0].token > assets[1].token) (assets[0], assets[1]) = (assets[1], assets[0]);
        E local = new E(GOV, GUARD, ARB, assets);
        vm.prank(GOV);
        local.setPaused(false);
        second.mint(CLIENT, 20);
        vm.startPrank(CLIENT);
        asset.approve(address(local), 10);
        second.approve(address(local), 20);
        uint256 one =
            local.fund(WORKER, address(asset), 10, A, uint64(block.timestamp + 100), uint64(block.timestamp + 200));
        uint256 two =
            local.fund(WORKER, address(second), 20, B, uint64(block.timestamp + 100), uint64(block.timestamp + 200));
        vm.stopPrank();
        vm.startPrank(WORKER);
        local.accept(one);
        local.accept(two);
        bytes memory original = address(second).code;
        vm.etch(address(second), hex"6000");
        vm.expectRevert(E.UntrustedAsset.selector);
        local.submitResultsMany(batch(one, two));
        assertEq(local.latestResultRevision(one), 0);
        assertEq(local.latestResultRevision(two), 0);
        vm.etch(address(second), original);
        local.submitResultsMany(batch(one, two));
        vm.stopPrank();
        assertEq(local.latestResultRevision(one), 1);
        assertEq(local.latestResultRevision(two), 1);
        assertEq(local.reserved(address(asset)), 10);
        assertEq(local.reserved(address(second)), 20);
    }

    function testPerJobDeadlineAndExactBoundary() public {
        uint256 one = accepted(10);
        (,,,,, uint64 firstDeadline,,) = escrow.jobs(one);
        vm.startPrank(CLIENT);
        asset.approve(address(escrow), 20);
        uint256 two =
            escrow.fund(WORKER, address(asset), 20, B, uint64(firstDeadline - 100), uint64(firstDeadline - 50));
        vm.stopPrank();
        vm.prank(WORKER);
        escrow.accept(two);
        vm.warp(uint256(firstDeadline) - 49);
        vm.expectRevert(E.WrongState.selector);
        vm.prank(WORKER);
        escrow.submitResultsMany(batch(one, two));
        assertEq(escrow.latestResultRevision(one), 0);
        E.ResultSubmission[] memory a = new E.ResultSubmission[](1);
        a[0] = E.ResultSubmission(one, 0, A);
        vm.warp(firstDeadline);
        vm.prank(WORKER);
        escrow.submitResultsMany(a);
        vm.warp(uint256(firstDeadline) + 1);
        a[0] = E.ResultSubmission(one, 1, B);
        vm.expectRevert(E.WrongState.selector);
        vm.prank(WORKER);
        escrow.submitResultsMany(a);
        assertEq(escrow.latestResultRevision(one), 1);
    }

    function testPerJobRevisionCapAndLegacyInteroperation() public {
        uint256 one = accepted(10);
        E.ResultSubmission[] memory a = new E.ResultSubmission[](1);
        vm.startPrank(WORKER);
        for (uint256 i; i < 32; ++i) {
            a[0] = E.ResultSubmission(one, i, bytes32(i + 1));
            escrow.submitResultsMany(a);
        }
        a[0] = E.ResultSubmission(one, 32, bytes32(uint256(33)));
        vm.expectRevert(E.InvalidResult.selector);
        escrow.submitResultsMany(a);
        vm.expectRevert(E.InvalidResult.selector);
        escrow.submitResult(one, 32, bytes32(uint256(33)));
        vm.stopPrank();
        vm.prank(CLIENT);
        escrow.approveResult(one, 32, bytes32(uint256(32)));
        assertEq(escrow.resultHashes(one, 1), A);
        assertEq(escrow.latestResultRevision(one), 32);
        assertEq(asset.balanceOf(WORKER), 10);
    }

    function testPausedExactRetryAndWrongChain() public {
        uint256 one = accepted(10);
        uint256 two = accepted(20);
        E.ResultSubmission[] memory a = batch(one, two);
        vm.prank(GUARD);
        escrow.setPaused(true);
        vm.expectRevert(E.Paused.selector);
        vm.prank(WORKER);
        escrow.submitResultsMany(a);
        assertEq(escrow.latestResultRevision(one), 0);
        vm.prank(GOV);
        escrow.setPaused(false);
        vm.prank(WORKER);
        escrow.submitResultsMany(a);
        vm.chainId(56);
        vm.expectRevert(E.WrongChain.selector);
        vm.prank(WORKER);
        escrow.submitResultsMany(a);
    }

    function testDifferentClientsSameWorkerDoNotGrantCrossClientPaymentConsent() public {
        uint256 one = accepted(10);
        asset.mint(OTHER, 20);
        vm.startPrank(OTHER);
        asset.approve(address(escrow), 20);
        uint256 two =
            escrow.fund(WORKER, address(asset), 20, B, uint64(block.timestamp + 100), uint64(block.timestamp + 200));
        vm.stopPrank();
        vm.prank(WORKER);
        escrow.accept(two);
        vm.prank(WORKER);
        escrow.submitResultsMany(batch(one, two));
        E.ResultApproval[] memory approvals = new E.ResultApproval[](2);
        approvals[0] = E.ResultApproval(one, 1, A);
        approvals[1] = E.ResultApproval(two, 1, B);
        vm.expectRevert(E.Unauthorized.selector);
        vm.prank(CLIENT);
        escrow.approveResultsMany(approvals);
        assertEq(asset.balanceOf(WORKER), 0);
        vm.prank(CLIENT);
        escrow.approveResult(one, 1, A);
        vm.prank(OTHER);
        escrow.approveResult(two, 1, B);
        assertEq(asset.balanceOf(WORKER), 30);
        assertEq(escrow.reserved(address(asset)), 0);
    }

    function testSixteenEntryBoundary() public {
        testFuzzOneToSixteenCommitmentsConserveAllPrincipal(16, 10);
    }

    function testFuzzOneToSixteenCommitmentsConserveAllPrincipal(uint8 rawCount, uint128 rawAmount) public {
        uint256 count = bound(rawCount, 1, 16);
        uint128 amount = uint128(bound(rawAmount, 1, 1000));
        E.ResultSubmission[] memory a = new E.ResultSubmission[](count);
        for (uint256 i; i < count; ++i) {
            a[i] = E.ResultSubmission(accepted(amount), 0, bytes32(i + 1));
        }
        uint256 before = asset.balanceOf(address(escrow));
        vm.prank(WORKER);
        escrow.submitResultsMany(a);
        assertEq(asset.balanceOf(address(escrow)), before);
        assertEq(escrow.reserved(address(asset)), count * amount);
        assertEq(asset.balanceOf(WORKER), 0);
        assertEq(escrow.nextJob(), count + 1);
        for (uint256 i; i < count; ++i) {
            assertEq(escrow.resultHashes(a[i].id, 1), bytes32(i + 1));
        }
    }
}
