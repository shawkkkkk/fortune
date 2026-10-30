// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {CounterEscrowBase} from "./FortuneTestnetCounterEscrow.t.sol";
import {FortuneTestnetCounterEscrow as Escrow} from "../src/FortuneTestnetCounterEscrow.sol";

contract FortuneTestnetCounterSnapshotTest is CounterEscrowBase {
    bytes32 internal constant HASH = keccak256("local snapshot");

    function _snapshot() internal returns (Escrow.Snapshot memory) {
        vm.roll(100);
        vm.setBlockhash(80, HASH);
        vm.prank(GOV);
        asset.approve(address(escrow), 1000);
        return Escrow.Snapshot(1, 80, HASH, block.timestamp + 60);
    }

    function _bound(Escrow.Snapshot memory snapshot) internal returns (uint256) {
        (address[] memory recipients, uint256[] memory amounts) = _allocation(8, 25);
        vm.prank(GOV);
        return escrow.fundSnapshotRound(address(asset), recipients, amounts, snapshot);
    }

    function testReferenceStoredAndExactReplayFailsBeforeTransfer() public {
        Escrow.Snapshot memory snapshot = _snapshot();
        assertEq(_bound(snapshot), 1);
        (uint256 expected, uint256 height, bytes32 digest, uint256 deadline) = escrow.roundSnapshots(1);
        assertEq(expected, 1);
        assertEq(height, 80);
        assertEq(digest, HASH);
        assertEq(deadline, snapshot.deadline);
        vm.expectRevert(Escrow.InvalidSnapshot.selector);
        _bound(snapshot); // Sufficient remaining allowance and funds.
        assertEq(escrow.nextRound(), 2);
        assertEq(escrow.reserved(address(asset)), 33);
        assertEq(asset.balanceOf(address(escrow)), 33);
        _open();
        escrow.claim(1, ALICE);
        escrow.claim(1, BOB);
        assertEq(escrow.reserved(address(asset)), 0);
    }

    function testInvalidRoundHashHeightAndExpiryLeaveFundingUntouched() public {
        _snapshot();
        for (uint256 i; i < 9; ++i) {
            Escrow.Snapshot memory snapshot = Escrow.Snapshot(1, 80, HASH, block.timestamp + 60);
            if (i == 0) snapshot.expectedRound = 2;
            if (i == 1) snapshot.blockNumber = 100;
            if (i == 2) snapshot.blockNumber = 101;
            if (i == 3) snapshot.blockNumber = 81;
            if (i == 4) snapshot.blockHash = bytes32(0);
            if (i == 5) snapshot.blockHash = bytes32(uint256(1));
            if (i == 6) snapshot.deadline = block.timestamp - 1;
            if (i == 7) snapshot.deadline = block.timestamp + 121;
            if (i == 8) vm.roll(336); // Old block hash, even if previously observed.
            vm.expectRevert(Escrow.InvalidSnapshot.selector);
            _bound(snapshot);
        }
        assertEq(escrow.nextRound(), 1);
        assertEq(escrow.reserved(address(asset)), 0);
        assertEq(asset.balanceOf(address(escrow)), 0);
    }

    function testLegacyFundingAdvancesRoundAndInvalidatesPreparedSnapshot() public {
        Escrow.Snapshot memory snapshot = _snapshot();
        _fund(asset, 4, 6);
        vm.expectRevert(Escrow.InvalidSnapshot.selector);
        _bound(snapshot);
        assertEq(escrow.nextRound(), 2);
        assertEq(escrow.reserved(address(asset)), 10);
        (uint256 expected,,,) = escrow.roundSnapshots(1);
        assertEq(expected, 0); // Legacy funding does not invent snapshot evidence.
    }

    function testGovernorPauseAndChainRemainMandatory() public {
        Escrow.Snapshot memory snapshot = _snapshot();
        (address[] memory recipients, uint256[] memory amounts) = _allocation(8, 25);
        vm.prank(GUARD);
        vm.expectRevert(Escrow.Unauthorized.selector);
        escrow.fundSnapshotRound(address(asset), recipients, amounts, snapshot);
        _open();
        vm.expectRevert(Escrow.WrongPauseState.selector);
        _bound(snapshot);
        vm.chainId(1);
        vm.expectRevert(Escrow.WrongChain.selector);
        _bound(snapshot);
    }

    function testInexactFundingHasNoSnapshotRightsOrConsumedRound() public {
        Escrow.Snapshot memory snapshot = _snapshot();
        asset.configure(true, false, address(0));
        vm.expectRevert(Escrow.InexactTransfer.selector);
        _bound(snapshot);
        (uint256 expected,,,) = escrow.roundSnapshots(1);
        assertEq(expected, 0);
        assertEq(escrow.nextRound(), 1);
        assertEq(escrow.claimable(1, ALICE), 0);
        assertEq(escrow.reserved(address(asset)), 0);
        asset.configure(false, false, address(0));
        assertEq(_bound(snapshot), 1); // Explicit retry after atomic revert.
    }

    function testFuzzAvailableConfirmedBlocksAndExpiryBoundaries(uint8 age, uint8 life) public {
        _snapshot();
        uint256 distance = bound(uint256(age), 20, 255);
        uint256 remaining = bound(uint256(life), 0, 120);
        vm.roll(300);
        uint256 height = 300 - distance;
        vm.setBlockhash(height, HASH);
        assertEq(_bound(Escrow.Snapshot(1, height, HASH, block.timestamp + remaining)), 1);
        assertEq(escrow.reserved(address(asset)), 33);
    }
}
