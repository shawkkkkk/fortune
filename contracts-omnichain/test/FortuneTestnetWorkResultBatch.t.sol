// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {WorkBase} from "./FortuneTestnetWorkEscrow.t.sol";
import {FortuneTestnetWorkEscrow as E} from "../src/FortuneTestnetWorkEscrow.sol";
import {CounterAssetMock} from "./FortuneTestnetCounterEscrow.t.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract ResultBatchReentryAsset is ERC20 {
    address public target;
    bytes public data;
    bool public rejected;

    constructor() ERC20("Local batch reentry", "LBR") {
        _mint(address(this), 100);
    }

    function arm(address t, bytes calldata d) external {
        target = t;
        data = d;
    }

    function _update(address from, address to, uint256 amount) internal override {
        super._update(from, to, amount);
        if (target != address(0)) {
            (bool ok, bytes memory reason) = target.call(data);
            rejected = !ok && bytes4(reason) == bytes4(keccak256("ReentrancyGuardReentrantCall()"));
        }
    }
}

contract FortuneTestnetWorkResultBatchTest is WorkBase {
    CounterAssetMock second;
    bytes32 constant A = keccak256("public result A");
    bytes32 constant B = keccak256("public result B");

    function setUp() public override {
        super.setUp();
        second = new CounterAssetMock();
        E.Asset[] memory assets = new E.Asset[](2);
        (address low, address high) =
            address(asset) < address(second) ? (address(asset), address(second)) : (address(second), address(asset));
        assets[0] = E.Asset(low, low.codehash, 1000);
        assets[1] = E.Asset(high, high.codehash, 1000);
        escrow = new E(GOV, GUARD, ARB, assets);
        second.mint(CLIENT, 1e36);
        vm.prank(GOV);
        escrow.setPaused(false);
    }

    function ready(CounterAssetMock token, uint128 amount) internal returns (uint256 id) {
        uint64 acceptBy = uint64(block.timestamp + 100);
        uint64 deliverBy = uint64(block.timestamp + 200);
        vm.startPrank(CLIENT);
        token.approve(address(escrow), amount);
        id = escrow.fund(WORKER, address(token), amount, bytes32(uint256(1)), acceptBy, deliverBy);
        vm.stopPrank();
        vm.startPrank(WORKER);
        escrow.accept(id);
        escrow.submitResult(id, 0, A);
        vm.stopPrank();
    }

    function pair(uint256 one, uint256 two) internal pure returns (E.ResultApproval[] memory x) {
        x = new E.ResultApproval[](2);
        x[0] = E.ResultApproval(one, 1, A);
        x[1] = E.ResultApproval(two, 1, A);
    }

    function testCrossAssetWholePaymentsHistoryAndExactReplay() public {
        uint256 one = ready(asset, 100);
        uint256 two = ready(second, 80);
        vm.prank(WORKER);
        escrow.submitResult(two, 1, B);
        E.ResultApproval[] memory x = pair(one, two);
        x[1] = E.ResultApproval(two, 2, B);
        vm.prank(CLIENT);
        escrow.approveResultsMany(x);
        assertEq(uint256(state(one)), uint256(E.State.Settled));
        assertEq(uint256(state(two)), uint256(E.State.Settled));
        assertEq(asset.balanceOf(WORKER), 100);
        assertEq(second.balanceOf(WORKER), 80);
        assertEq(escrow.reserved(address(asset)), 0);
        assertEq(escrow.reserved(address(second)), 0);
        assertEq(escrow.resultHashes(two, 1), A);
        assertEq(escrow.resultHashes(two, 2), B);
        vm.prank(CLIENT);
        vm.expectRevert(E.WrongState.selector);
        escrow.approveResultsMany(x);
    }

    function testLateAssetFailureRollsBackAllThenExactRetry() public {
        uint256 one = ready(asset, 100);
        uint256 two = ready(second, 80);
        E.ResultApproval[] memory x = pair(one, two);
        second.configure(true, false, address(0));
        vm.prank(CLIENT);
        vm.expectRevert(E.InexactTransfer.selector);
        escrow.approveResultsMany(x);
        assertEq(uint256(state(one)), uint256(E.State.Accepted));
        assertEq(uint256(state(two)), uint256(E.State.Accepted));
        assertEq(asset.balanceOf(WORKER), 0);
        assertEq(second.balanceOf(WORKER), 0);
        assertEq(asset.balanceOf(address(escrow)), 100);
        assertEq(second.balanceOf(address(escrow)), 80);
        assertEq(escrow.reserved(address(asset)), 100);
        assertEq(escrow.reserved(address(second)), 80);
        assertEq(escrow.latestResultRevision(one), 1);
        assertEq(escrow.latestResultRevision(two), 1);
        second.configure(false, false, address(0));
        vm.prank(CLIENT);
        escrow.approveResultsMany(x);
        assertEq(asset.balanceOf(WORKER), 100);
        assertEq(second.balanceOf(WORKER), 80);
    }

    function testStaleLaterResultAndMalformedHashesRetainEarlierLiability() public {
        uint256 one = ready(asset, 100);
        uint256 two = ready(second, 80);
        E.ResultApproval[] memory x = pair(one, two);
        vm.prank(WORKER);
        escrow.submitResult(two, 1, B);
        vm.prank(CLIENT);
        vm.expectRevert(E.InvalidResult.selector);
        escrow.approveResultsMany(x);
        x[1] = E.ResultApproval(two, 2, bytes32(0));
        vm.prank(CLIENT);
        vm.expectRevert(E.InvalidResult.selector);
        escrow.approveResultsMany(x);
        x[1] = E.ResultApproval(two, 0, B);
        vm.prank(CLIENT);
        vm.expectRevert(E.InvalidResult.selector);
        escrow.approveResultsMany(x);
        x[1] = E.ResultApproval(two, 2, A);
        vm.prank(CLIENT);
        vm.expectRevert(E.InvalidResult.selector);
        escrow.approveResultsMany(x);
        assertEq(uint256(state(one)), uint256(E.State.Accepted));
        assertEq(asset.balanceOf(WORKER), 0);
        assertEq(escrow.reserved(address(asset)), 100);
        // Existing single-result approval can still explicitly settle either job.
        vm.prank(CLIENT);
        escrow.approveResult(two, 2, B);
        vm.prank(CLIENT);
        escrow.approveResult(one, 1, A);
        assertEq(asset.balanceOf(WORKER), 100);
        assertEq(second.balanceOf(WORKER), 80);
    }

    function testBoundsOrderAndDuplicatesReject() public {
        uint256 one = ready(asset, 100);
        uint256 two = ready(second, 80);
        E.ResultApproval[] memory x = new E.ResultApproval[](0);
        vm.prank(CLIENT);
        vm.expectRevert(E.InvalidResult.selector);
        escrow.approveResultsMany(x);
        x = new E.ResultApproval[](17);
        vm.prank(CLIENT);
        vm.expectRevert(E.InvalidResult.selector);
        escrow.approveResultsMany(x);
        x = pair(one, one);
        vm.prank(CLIENT);
        vm.expectRevert(E.InvalidResult.selector);
        escrow.approveResultsMany(x);
        x = pair(two, one);
        vm.prank(CLIENT);
        vm.expectRevert(E.InvalidResult.selector);
        escrow.approveResultsMany(x);
        x = pair(0, two);
        vm.prank(CLIENT);
        vm.expectRevert(E.InvalidResult.selector);
        escrow.approveResultsMany(x);
        assertEq(escrow.reserved(address(asset)), 100);
        assertEq(escrow.reserved(address(second)), 80);
    }

    function testRolesPauseChainAndDisputedLaterJobReject() public {
        uint256 one = ready(asset, 100);
        uint256 two = ready(second, 80);
        E.ResultApproval[] memory x = pair(one, two);
        address[4] memory others = [GOV, GUARD, ARB, WORKER];
        for (uint256 i; i < others.length; ++i) {
            vm.prank(others[i]);
            vm.expectRevert(E.Unauthorized.selector);
            escrow.approveResultsMany(x);
        }
        vm.prank(GUARD);
        escrow.setPaused(true);
        vm.prank(CLIENT);
        vm.expectRevert(E.Paused.selector);
        escrow.approveResultsMany(x);
        vm.chainId(1);
        vm.prank(CLIENT);
        vm.expectRevert(E.WrongChain.selector);
        escrow.approveResultsMany(x);
        vm.chainId(97);
        vm.prank(GOV);
        escrow.setPaused(false);
        vm.prank(WORKER);
        escrow.disputeResult(two, 1, A);
        vm.prank(CLIENT);
        vm.expectRevert(E.WrongState.selector);
        escrow.approveResultsMany(x);
        assertEq(uint256(state(one)), uint256(E.State.Accepted));
        assertEq(escrow.reserved(address(asset)), 100);
        assertEq(escrow.reserved(address(second)), 80);
        assertEq(escrow.disputedResultRevision(two), 1);
    }

    function testLaterForeignClientJobCannotBeIncludedAndLegacyPaymentsRemain() public {
        uint256 one = ready(asset, 100);
        second.mint(OTHER, 80);
        uint64 a = uint64(block.timestamp + 100);
        uint64 d = uint64(block.timestamp + 200);
        vm.startPrank(OTHER);
        second.approve(address(escrow), 80);
        uint256 two = escrow.fund(WORKER, address(second), 80, A, a, d);
        vm.stopPrank();
        vm.startPrank(WORKER);
        escrow.accept(two);
        escrow.submitResult(two, 0, A);
        vm.stopPrank();
        vm.prank(CLIENT);
        vm.expectRevert(E.Unauthorized.selector);
        escrow.approveResultsMany(pair(one, two));
        assertEq(uint256(state(one)), uint256(E.State.Accepted));
        assertEq(asset.balanceOf(WORKER), 0);
        assertEq(escrow.reserved(address(asset)), 100);
        assertEq(escrow.reserved(address(second)), 80);
        vm.prank(CLIENT);
        escrow.approveResult(one, 1, A);
        vm.prank(OTHER);
        escrow.approveResult(two, 1, A);
        assertEq(asset.balanceOf(WORKER), 100);
        assertEq(second.balanceOf(WORKER), 80);
    }

    function testSixteenSameAssetJobsAndExplicitApprovalAfterDeadline() public {
        E.ResultApproval[] memory x = new E.ResultApproval[](16);
        for (uint256 i; i < x.length; ++i) {
            x[i] = E.ResultApproval(ready(asset, 10), 1, A);
        }
        vm.warp(block.timestamp + 1 days);
        vm.prank(CLIENT);
        escrow.approveResultsMany(x);
        assertEq(asset.balanceOf(WORKER), 160);
        assertEq(escrow.reserved(address(asset)), 0);
        for (uint256 i; i < x.length; ++i) {
            assertEq(uint256(state(x[i].id)), uint256(E.State.Settled));
        }
    }

    function testUnderbackingAndChangedLaterRuntimeRevertAll() public {
        uint256 one = ready(asset, 100);
        uint256 two = ready(second, 80);
        E.ResultApproval[] memory x = pair(one, two);
        vm.etch(address(second), hex"60006000f3");
        vm.prank(CLIENT);
        vm.expectRevert(E.UntrustedAsset.selector);
        escrow.approveResultsMany(x);
        assertEq(asset.balanceOf(WORKER), 0);
        assertEq(escrow.reserved(address(asset)), 100);
        asset.destroy(address(escrow), 1);
        vm.prank(CLIENT);
        vm.expectRevert(E.Insolvent.selector);
        escrow.approveResultsMany(x);
        assertEq(uint256(state(one)), uint256(E.State.Accepted));
    }

    function testReentryFromAuthorizedClientIsRejectedByGuard() public {
        ResultBatchReentryAsset token = new ResultBatchReentryAsset();
        E.Asset[] memory assets = new E.Asset[](1);
        assets[0] = E.Asset(address(token), address(token).codehash, 1000);
        E e = new E(GOV, GUARD, ARB, assets);
        vm.prank(GOV);
        e.setPaused(false);
        uint64 a = uint64(block.timestamp + 100);
        uint64 d = uint64(block.timestamp + 200);
        vm.startPrank(address(token));
        token.approve(address(e), 100);
        uint256 id = e.fund(WORKER, address(token), 100, A, a, d);
        vm.stopPrank();
        vm.startPrank(WORKER);
        e.accept(id);
        e.submitResult(id, 0, A);
        vm.stopPrank();
        E.ResultApproval[] memory x = new E.ResultApproval[](1);
        x[0] = E.ResultApproval(id, 1, A);
        token.arm(address(e), abi.encodeCall(E.approveResultsMany, (x)));
        vm.prank(address(token));
        e.approveResultsMany(x);
        assertTrue(token.rejected());
        assertEq(token.balanceOf(WORKER), 100);
        assertEq(e.reserved(address(token)), 0);
    }

    function testFuzzTwoAssetConservation(uint128 a, uint128 b) public {
        a = uint128(bound(a, 1, 1000));
        b = uint128(bound(b, 1, 1000));
        uint256 one = ready(asset, a);
        uint256 two = ready(second, b);
        uint256 beforeA = asset.balanceOf(CLIENT);
        uint256 beforeB = second.balanceOf(CLIENT);
        vm.prank(CLIENT);
        escrow.approveResultsMany(pair(one, two));
        assertEq(asset.balanceOf(WORKER), a);
        assertEq(second.balanceOf(WORKER), b);
        assertEq(asset.balanceOf(CLIENT), beforeA);
        assertEq(second.balanceOf(CLIENT), beforeB);
        assertEq(escrow.reserved(address(asset)), 0);
        assertEq(escrow.reserved(address(second)), 0);
    }
}
