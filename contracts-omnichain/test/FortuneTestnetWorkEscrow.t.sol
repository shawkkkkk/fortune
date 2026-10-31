// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {Test} from "forge-std/Test.sol";
import {FortuneTestnetWorkEscrow as E} from "../src/FortuneTestnetWorkEscrow.sol";
import {CounterAssetMock} from "./FortuneTestnetCounterEscrow.t.sol";

contract WorkBase is Test {
    address constant GOV = address(0x9001);
    address constant GUARD = address(0x9002);
    address constant ARB = address(0x9003);
    address constant CLIENT = address(0x1001);
    address constant WORKER = address(0x1002);
    address constant OTHER = address(0x1003);
    E escrow;
    CounterAssetMock asset;

    function setUp() public virtual {
        vm.chainId(97);
        asset = new CounterAssetMock();
        E.Asset[] memory a = new E.Asset[](1);
        a[0] = E.Asset(address(asset), address(asset).codehash, 1000);
        escrow = new E(GOV, GUARD, ARB, a);
        asset.mint(CLIENT, 1e36);
        vm.prank(GOV);
        escrow.setPaused(false);
    }

    function fund(uint128 amount) internal returns (uint256 id) {
        vm.startPrank(CLIENT);
        asset.approve(address(escrow), amount);
        id = escrow.fund(
            WORKER,
            address(asset),
            amount,
            keccak256("supplied terms"),
            uint64(block.timestamp + 100),
            uint64(block.timestamp + 200)
        );
        vm.stopPrank();
    }

    function state(uint256 id) internal view returns (E.State s) {
        (,,,,,,, s) = escrow.jobs(id);
    }

    function accepted(uint128 amount) internal returns (uint256 id) {
        id = fund(amount);
        vm.prank(WORKER);
        escrow.accept(id);
    }
}

contract FortuneTestnetWorkEscrowTest is WorkBase {
    function testFundingIdReplayAndChangedTermsAfterCancelReject() public {
        bytes32 key = bytes32(uint256(1));
        uint64 a = uint64(block.timestamp + 100);
        uint64 d = uint64(block.timestamp + 200);
        vm.startPrank(CLIENT);
        asset.approve(address(escrow), 1000);
        uint256 id = escrow.fundWithId(key, WORKER, address(asset), 100, key, a, d);
        assertEq(escrow.fundingJobs(CLIENT, key), id);
        vm.expectRevert(E.FundingIdUsed.selector);
        escrow.fundWithId(key, WORKER, address(asset), 100, key, a, d);
        escrow.cancel(id);
        vm.expectRevert(E.FundingIdUsed.selector);
        escrow.fundWithId(key, OTHER, address(asset), 50, bytes32(uint256(2)), a, d);
        assertEq(asset.allowance(CLIENT, address(escrow)), 900);
        assertEq(escrow.nextJob(), 2);
        assertEq(escrow.reserved(address(asset)), 0);
        vm.stopPrank();
    }

    function testFundingIdClientNamespaceAndLegacy() public {
        bytes32 key = bytes32(uint256(1));
        asset.mint(OTHER, 1000);
        vm.startPrank(CLIENT);
        asset.approve(address(escrow), 100);
        escrow.fundWithId(
            key, WORKER, address(asset), 100, key, uint64(block.timestamp + 100), uint64(block.timestamp + 200)
        );
        vm.stopPrank();
        vm.startPrank(OTHER);
        asset.approve(address(escrow), 100);
        escrow.fundWithId(
            key, WORKER, address(asset), 100, key, uint64(block.timestamp + 100), uint64(block.timestamp + 200)
        );
        vm.stopPrank();
        assertEq(escrow.fundingJobs(CLIENT, key), 1);
        assertEq(escrow.fundingJobs(OTHER, key), 2);
        assertEq(fund(30), 3);
        assertEq(escrow.reserved(address(asset)), 230);
    }

    function testFundingIdAtomicFailureRetryZeroPauseChain() public {
        bytes32 key = bytes32(uint256(1));
        uint64 a = uint64(block.timestamp + 100);
        uint64 d = uint64(block.timestamp + 200);
        vm.startPrank(CLIENT);
        asset.approve(address(escrow), 1000);
        vm.expectRevert(E.InvalidJob.selector);
        escrow.fundWithId(bytes32(0), WORKER, address(asset), 100, key, a, d);
        asset.configure(true, false, address(0));
        vm.expectRevert(E.InexactTransfer.selector);
        escrow.fundWithId(key, WORKER, address(asset), 100, key, a, d);
        assertEq(escrow.fundingJobs(CLIENT, key), 0);
        assertEq(escrow.nextJob(), 1);
        assertEq(asset.allowance(CLIENT, address(escrow)), 1000);
        asset.configure(false, false, address(0));
        escrow.fundWithId(key, WORKER, address(asset), 100, key, a, d);
        vm.stopPrank();
        vm.prank(GUARD);
        escrow.setPaused(true);
        vm.expectRevert(E.Paused.selector);
        escrow.fundWithId(key, WORKER, address(asset), 100, key, a, d);
        vm.chainId(1);
        vm.expectRevert(E.WrongChain.selector);
        escrow.fundWithId(key, WORKER, address(asset), 100, key, a, d);
    }

    function testClientApprovalPaysOnlyAcceptedWorkerOnce() public {
        uint256 id = accepted(100);
        vm.prank(CLIENT);
        escrow.approvePayment(id);
        assertEq(asset.balanceOf(WORKER), 100);
        assertEq(escrow.reserved(address(asset)), 0);
        assertEq(uint256(state(id)), uint256(E.State.Settled));
        vm.prank(CLIENT);
        vm.expectRevert(E.WrongState.selector);
        escrow.approvePayment(id);
    }

    function testCancellationAndExpiryReturnOnlyClientFunding() public {
        uint256 before = asset.balanceOf(CLIENT);
        uint256 id = fund(100);
        vm.prank(OTHER);
        vm.expectRevert(E.Unauthorized.selector);
        escrow.cancel(id);
        vm.prank(CLIENT);
        escrow.cancel(id);
        assertEq(asset.balanceOf(CLIENT), before);
        id = fund(100);
        vm.warp(block.timestamp + 101);
        vm.prank(WORKER);
        vm.expectRevert(E.WrongState.selector);
        escrow.accept(id);
        vm.prank(OTHER);
        escrow.cancel(id);
        assertEq(asset.balanceOf(CLIENT), before);
    }

    function testDisputesRequirePartiesOrExpiryAndFixedArbitrator() public {
        uint256 id = accepted(100);
        vm.prank(OTHER);
        vm.expectRevert(E.Unauthorized.selector);
        escrow.dispute(id);
        vm.prank(WORKER);
        escrow.dispute(id);
        vm.prank(CLIENT);
        vm.expectRevert(E.WrongState.selector);
        escrow.approvePayment(id);
        vm.prank(GOV);
        vm.expectRevert(E.Unauthorized.selector);
        escrow.resolve(id, 60);
        vm.prank(ARB);
        escrow.resolve(id, 60);
        assertEq(asset.balanceOf(WORKER), 60);
        assertEq(escrow.reserved(address(asset)), 0);
        id = accepted(30);
        vm.warp(block.timestamp + 201);
        vm.prank(OTHER);
        escrow.dispute(id);
        assertEq(uint256(state(id)), uint256(E.State.Disputed));
    }

    function testInexactSettlementRollsBackBothPaymentsAndRights() public {
        uint256 id = accepted(100);
        vm.prank(CLIENT);
        escrow.dispute(id);
        uint256 balance = asset.balanceOf(CLIENT);
        asset.configure(true, false, address(0));
        vm.prank(ARB);
        vm.expectRevert(E.InexactTransfer.selector);
        escrow.resolve(id, 60);
        assertEq(asset.balanceOf(WORKER), 0);
        assertEq(asset.balanceOf(CLIENT), balance);
        assertEq(escrow.reserved(address(asset)), 100);
        assertEq(uint256(state(id)), uint256(E.State.Disputed));
        asset.configure(false, false, address(0));
        vm.prank(ARB);
        escrow.resolve(id, 60);
        assertEq(asset.balanceOf(CLIENT), balance + 40);
    }

    function testDonationsCannotReplaceNewFundingAndBadFundingLeavesNoJob() public {
        asset.mint(address(escrow), 100);
        vm.prank(CLIENT);
        vm.expectRevert();
        escrow.fund(
            WORKER,
            address(asset),
            100,
            bytes32(uint256(1)),
            uint64(block.timestamp + 100),
            uint64(block.timestamp + 200)
        );
        assertEq(escrow.nextJob(), 1);
        asset.configure(true, false, address(0));
        vm.startPrank(CLIENT);
        asset.approve(address(escrow), 100);
        vm.expectRevert(E.InexactTransfer.selector);
        escrow.fund(
            WORKER,
            address(asset),
            100,
            bytes32(uint256(1)),
            uint64(block.timestamp + 100),
            uint64(block.timestamp + 200)
        );
        vm.stopPrank();
        assertEq(escrow.nextJob(), 1);
        assertEq(escrow.reserved(address(asset)), 0);
    }

    function testBackingCodeAndPauseFailClosed() public {
        uint256 id = accepted(100);
        vm.prank(GUARD);
        escrow.setPaused(true);
        vm.prank(CLIENT);
        vm.expectRevert(E.Paused.selector);
        escrow.approvePayment(id);
        vm.prank(GUARD);
        vm.expectRevert(E.Unauthorized.selector);
        escrow.setPaused(false);
        vm.prank(GOV);
        escrow.setPaused(false);
        asset.destroy(address(escrow), 1);
        vm.prank(CLIENT);
        vm.expectRevert(E.Insolvent.selector);
        escrow.approvePayment(id);
        asset.mint(address(escrow), 1);
        vm.etch(address(asset), hex"60006000fd");
        vm.prank(CLIENT);
        vm.expectRevert(E.UntrustedAsset.selector);
        escrow.approvePayment(id);
        assertEq(escrow.reserved(address(asset)), 100);
    }

    function testBoundsRolesAndWrongChain() public {
        vm.prank(OTHER);
        vm.expectRevert(E.Unauthorized.selector);
        escrow.setPaused(true);
        vm.startPrank(CLIENT);
        asset.approve(address(escrow), 2000);
        vm.expectRevert(E.InvalidJob.selector);
        escrow.fund(
            ARB, address(asset), 10, bytes32(uint256(1)), uint64(block.timestamp + 1), uint64(block.timestamp + 2)
        );
        vm.expectRevert(E.InvalidJob.selector);
        escrow.fund(
            WORKER, address(asset), 1001, bytes32(uint256(1)), uint64(block.timestamp + 1), uint64(block.timestamp + 2)
        );
        vm.stopPrank();
        vm.chainId(1);
        vm.expectRevert(E.WrongChain.selector);
        escrow.setPaused(true);
        vm.expectRevert(E.WrongChain.selector);
        escrow.accept(1);
        vm.expectRevert(E.WrongChain.selector);
        escrow.cancel(1);
        vm.expectRevert(E.WrongChain.selector);
        escrow.approvePayment(1);
        vm.expectRevert(E.WrongChain.selector);
        escrow.dispute(1);
        vm.expectRevert(E.WrongChain.selector);
        escrow.resolve(1, 0);
        vm.expectRevert(E.WrongChain.selector);
        escrow.fund(WORKER, address(asset), 100, bytes32(uint256(1)), 100, 200);
    }

    function testExactAcceptanceAndDeliveryBoundaries() public {
        uint256 one = fund(100);
        (,,,, uint64 acceptAt, uint64 deliverAt,,) = escrow.jobs(one);
        vm.warp(acceptAt);
        vm.prank(WORKER);
        escrow.accept(one);
        vm.warp(deliverAt);
        vm.prank(OTHER);
        vm.expectRevert(E.Unauthorized.selector);
        escrow.dispute(one);
        vm.warp(uint256(deliverAt) + 1);
        vm.prank(OTHER);
        escrow.dispute(one);
        vm.prank(ARB);
        vm.expectRevert(E.InvalidJob.selector);
        escrow.resolve(one, 101);
        assertEq(escrow.reserved(address(asset)), 100);
        uint256 two = fund(30);
        (,,,, uint64 secondAcceptBy,,,) = escrow.jobs(two);
        vm.warp(uint256(secondAcceptBy) + 1);
        vm.prank(WORKER);
        vm.expectRevert(E.WrongState.selector);
        escrow.accept(two);
        vm.prank(OTHER);
        escrow.cancel(two);
        vm.prank(ARB);
        escrow.resolve(one, 0);
        assertEq(escrow.reserved(address(asset)), 0);
    }

    function testInvalidFundingBoundsMakeNoTransferOrJob() public {
        uint256 before = asset.balanceOf(CLIENT);
        vm.startPrank(CLIENT);
        asset.approve(address(escrow), 10000);
        for (uint256 i; i < 11; i++) {
            address worker = WORKER;
            uint128 amount = 100;
            bytes32 terms = bytes32(uint256(1));
            uint64 acceptBy = uint64(block.timestamp + 100);
            uint64 deliverBy = uint64(block.timestamp + 200);
            if (i == 0) worker = address(0);
            if (i == 1) worker = CLIENT;
            if (i == 2) worker = address(escrow);
            if (i == 3) worker = ARB;
            if (i == 4) amount = 0;
            if (i == 5) amount = 1001;
            if (i == 6) terms = bytes32(0);
            if (i == 7) acceptBy = uint64(block.timestamp);
            if (i == 8) acceptBy = uint64(block.timestamp + 1 days + 1);
            if (i == 9) deliverBy = acceptBy;
            if (i == 10) deliverBy = uint64(block.timestamp + 7 days + 1);
            vm.expectRevert(E.InvalidJob.selector);
            escrow.fund(worker, address(asset), amount, terms, acceptBy, deliverBy);
        }
        vm.stopPrank();
        assertEq(asset.balanceOf(CLIENT), before);
        assertEq(escrow.nextJob(), 1);
        assertEq(escrow.reserved(address(asset)), 0);
    }

    function testFuzzSplitConservesAllClientPrincipal(uint128 raw, uint128 split) public {
        uint128 amount = uint128(bound(raw, 1, 1000));
        uint128 workerAmount = uint128(bound(split, 0, amount));
        uint256 before = asset.balanceOf(CLIENT);
        uint256 id = accepted(amount);
        vm.prank(WORKER);
        escrow.dispute(id);
        vm.prank(ARB);
        escrow.resolve(id, workerAmount);
        assertEq(asset.balanceOf(WORKER), workerAmount);
        assertEq(asset.balanceOf(CLIENT), before - workerAmount);
        assertEq(escrow.reserved(address(asset)), 0);
        assertEq(asset.balanceOf(address(escrow)), 0);
    }
}

contract WorkHandler is Test {
    E public escrow;
    CounterAssetMock public asset;
    uint256 public funded;
    uint256 public workerPaid;
    uint256 public clientRefunded;
    address constant CLIENT = address(0x1001);
    address constant WORKER = address(0x1002);
    address constant ARB = address(0x9003);

    constructor(E e, CounterAssetMock a) {
        escrow = e;
        asset = a;
    }

    function create(uint128 raw) external {
        if (escrow.nextJob() > 128) return;
        uint128 amount = uint128(bound(raw, 1, 1000));
        vm.startPrank(CLIENT);
        asset.approve(address(escrow), amount);
        escrow.fund(
            WORKER,
            address(asset),
            amount,
            bytes32(uint256(1)),
            uint64(block.timestamp + 100),
            uint64(block.timestamp + 200)
        );
        vm.stopPrank();
        funded += amount;
    }

    function waive(uint256 raw) external {
        if (escrow.nextJob() == 1) return;
        uint256 id = bound(raw, 1, escrow.nextJob() - 1);
        (,,, uint128 amount,,,, E.State state_) = escrow.jobs(id);
        if (state_ != E.State.Funded) return;
        vm.startPrank(WORKER);
        escrow.accept(id);
        escrow.waivePayment(id, 0);
        vm.stopPrank();
        clientRefunded += amount;
    }

    function finish(uint256 raw, uint128 part, bool cancel_) external {
        if (escrow.nextJob() == 1) return;
        uint256 id = bound(raw, 1, escrow.nextJob() - 1);
        (,,, uint128 amount,,,, E.State state_) = escrow.jobs(id);
        if (state_ != E.State.Funded) return;
        if (cancel_) {
            vm.prank(CLIENT);
            escrow.cancel(id);
            clientRefunded += amount;
        } else {
            vm.prank(WORKER);
            escrow.accept(id);
            vm.prank(CLIENT);
            escrow.dispute(id);
            uint128 paid = uint128(bound(part, 0, amount));
            vm.prank(ARB);
            escrow.resolve(id, paid);
            workerPaid += paid;
            clientRefunded += amount - paid;
        }
    }
}

contract FortuneTestnetWorkEscrowInvariantTest is WorkBase {
    WorkHandler handler;

    function setUp() public override {
        super.setUp();
        handler = new WorkHandler(escrow, asset);
        bytes4[] memory selectors = new bytes4[](3);
        selectors[0] = handler.create.selector;
        selectors[1] = handler.finish.selector;
        selectors[2] = handler.waive.selector;
        targetSelector(FuzzSelector(address(handler), selectors));
        targetContract(address(handler));
    }

    function invariantAllUnsettledJobsRemainExactlyBacked() public view {
        uint256 outstanding;
        for (uint256 id = 1; id < escrow.nextJob(); id++) {
            (,,, uint128 amount,,,, E.State state_) = escrow.jobs(id);
            if (state_ != E.State.Settled) outstanding += amount;
        }
        assertEq(outstanding, escrow.reserved(address(asset)));
        assertEq(outstanding, asset.balanceOf(address(escrow)));
        assertEq(handler.funded(), outstanding + handler.workerPaid() + handler.clientRefunded());
        assertEq(handler.workerPaid(), asset.balanceOf(WORKER));
    }
}
