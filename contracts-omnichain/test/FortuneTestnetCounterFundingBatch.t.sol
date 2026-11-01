// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {CounterEscrowBase, CounterAssetMock} from "./FortuneTestnetCounterEscrow.t.sol";
import {FortuneTestnetCounterEscrow as Escrow} from "../src/FortuneTestnetCounterEscrow.sol";

contract FortuneTestnetCounterFundingBatchTest is CounterEscrowBase {
    bytes32 constant HASH = keccak256("batch snapshot");

    function prep(uint256 a, uint256 b) internal returns (Escrow.Funding[] memory f, Escrow.Snapshot memory s) {
        vm.roll(100);
        vm.setBlockhash(80, HASH);
        f = new Escrow.Funding[](2);
        Escrow.Asset[] memory pins = _assets();
        for (uint256 i; i < 2; ++i) {
            (address[] memory r, uint256[] memory v) = _allocation(a, b);
            f[i] = Escrow.Funding(pins[i].token, r, v);
            vm.prank(GOV);
            CounterAssetMock(pins[i].token).approve(address(escrow), type(uint256).max);
        }
        s = Escrow.Snapshot(escrow.nextRound(), 80, HASH, block.timestamp + 60);
    }

    function batch(Escrow.Funding[] memory f, Escrow.Snapshot memory s) internal returns (uint256[] memory) {
        vm.prank(GOV);
        return escrow.fundSnapshotBatch(f, s);
    }

    function testBatchRoundReferencesClaimsAndReplay() public {
        (Escrow.Funding[] memory f, Escrow.Snapshot memory s) = prep(8, 25);
        uint256[] memory ids = batch(f, s);
        assertEq(ids.length, 2);
        assertEq(ids[0], 1);
        assertEq(ids[1], 2);
        assertEq(escrow.nextRound(), 3);
        for (uint256 i; i < 2; ++i) {
            (address token, uint256 funded, uint256 remaining, bytes32 digest) = escrow.rounds(ids[i]);
            assertEq(token, f[i].token);
            assertEq(funded, 33);
            assertEq(remaining, 33);
            assertEq(
                digest,
                keccak256(abi.encode(uint256(97), address(escrow), ids[i], token, f[i].recipients, f[i].amounts))
            );
            (uint256 expected, uint256 height, bytes32 hash, uint256 deadline) = escrow.roundSnapshots(ids[i]);
            assertEq(expected, ids[i]);
            assertEq(height, 80);
            assertEq(hash, HASH);
            assertEq(deadline, s.deadline);
        }
        vm.expectRevert(Escrow.InvalidSnapshot.selector);
        batch(f, s);
        _open();
        escrow.claimMany(ids, ALICE);
        escrow.claimMany(ids, BOB);
        for (uint256 i; i < 2; ++i) {
            assertEq(escrow.reserved(f[i].token), 0);
            assertEq(CounterAssetMock(f[i].token).balanceOf(ALICE), 8);
            assertEq(CounterAssetMock(f[i].token).balanceOf(BOB), 25);
        }
    }

    function testLateTaxRollbackAndExactRetry() public {
        (Escrow.Funding[] memory f, Escrow.Snapshot memory s) = prep(8, 25);
        CounterAssetMock(f[1].token).configure(true, false, address(0));
        vm.expectRevert(Escrow.InexactTransfer.selector);
        batch(f, s);
        assertEq(escrow.nextRound(), 1);
        for (uint256 i; i < 2; ++i) {
            assertEq(CounterAssetMock(f[i].token).balanceOf(GOV), 1e36);
            assertEq(CounterAssetMock(f[i].token).balanceOf(address(escrow)), 0);
            assertEq(CounterAssetMock(f[i].token).allowance(GOV, address(escrow)), type(uint256).max);
            assertEq(escrow.claimable(i + 1, ALICE), 0);
            assertEq(escrow.reserved(f[i].token), 0);
            (address token,,,) = escrow.rounds(i + 1);
            assertEq(token, address(0));
            (uint256 expected,,,) = escrow.roundSnapshots(i + 1);
            assertEq(expected, 0);
        }
        CounterAssetMock(f[1].token).configure(false, false, address(0));
        batch(f, s);
        assertEq(escrow.nextRound(), 3);
    }

    function testLateInvalidAllocationUnsupportedAssetAndMissingAllowanceRollback() public {
        for (uint256 mode; mode < 5; ++mode) {
            (Escrow.Funding[] memory f, Escrow.Snapshot memory s) = prep(8, 25);
            if (mode == 0) f[1].amounts[1] = 0;
            if (mode == 1) f[1].recipients[1] = EXCLUDED;
            if (mode == 2) f[1].token = address(type(uint160).max);
            if (mode == 3) f[1].amounts = new uint256[](1);
            if (mode == 4) {
                vm.prank(GOV);
                CounterAssetMock(f[1].token).approve(address(escrow), 0);
            }
            vm.expectRevert();
            batch(f, s);
            assertEq(escrow.nextRound(), 1);
            assertEq(escrow.reserved(f[0].token), 0);
            assertEq(CounterAssetMock(f[0].token).balanceOf(GOV), 1e36);
            assertEq(CounterAssetMock(f[0].token).balanceOf(address(escrow)), 0);
        }
    }

    function testCountOrderingAndDuplicateAssetsReject() public {
        (Escrow.Funding[] memory f, Escrow.Snapshot memory s) = prep(8, 25);
        vm.expectRevert(Escrow.InvalidAllocation.selector);
        batch(new Escrow.Funding[](0), s);
        vm.expectRevert(Escrow.InvalidAllocation.selector);
        batch(new Escrow.Funding[](1), s);
        vm.expectRevert(Escrow.InvalidAllocation.selector);
        batch(new Escrow.Funding[](11), s);
        address saved = f[1].token;
        f[1].token = f[0].token;
        vm.expectRevert(Escrow.InvalidAllocation.selector);
        batch(f, s);
        f[1].token = saved;
        (f[0], f[1]) = (f[1], f[0]);
        vm.expectRevert(Escrow.InvalidAllocation.selector);
        batch(f, s);
        assertEq(escrow.nextRound(), 1);
    }

    function testSnapshotRolesPauseAndChain() public {
        (Escrow.Funding[] memory f, Escrow.Snapshot memory s) = prep(8, 25);
        vm.prank(GUARD);
        vm.expectRevert(Escrow.Unauthorized.selector);
        escrow.fundSnapshotBatch(f, s);
        for (uint256 mode; mode < 9; ++mode) {
            Escrow.Snapshot memory bad = Escrow.Snapshot(1, 80, HASH, block.timestamp + 60);
            if (mode == 0) bad.expectedRound = 2;
            if (mode == 1) bad.blockNumber = 100;
            if (mode == 2) bad.blockNumber = 101;
            if (mode == 3) bad.blockNumber = 81;
            if (mode == 4) bad.blockHash = bytes32(0);
            if (mode == 5) bad.blockHash = bytes32(uint256(1));
            if (mode == 6) bad.deadline = block.timestamp - 1;
            if (mode == 7) bad.deadline = block.timestamp + 121;
            if (mode == 8) vm.roll(336);
            vm.expectRevert(Escrow.InvalidSnapshot.selector);
            batch(f, bad);
        }
        vm.roll(100);
        _open();
        vm.expectRevert(Escrow.WrongPauseState.selector);
        batch(f, s);
        vm.chainId(56);
        vm.expectRevert(Escrow.WrongChain.selector);
        batch(f, s);
    }

    function testLegacyRoundAdvanceInvalidatesPreparedBatch() public {
        (Escrow.Funding[] memory f, Escrow.Snapshot memory s) = prep(8, 25);
        _fund(asset, 4, 6);
        vm.expectRevert(Escrow.InvalidSnapshot.selector);
        batch(f, s);
        assertEq(escrow.nextRound(), 2);
        assertEq(escrow.claimable(1, ALICE), 4);
        assertEq(escrow.reserved(address(asset)), 10);
    }

    function testTenAssetsAndRecipientBounds() public {
        vm.roll(100);
        vm.setBlockhash(80, HASH);
        address[] memory tokens = new address[](10);
        for (uint256 i; i < 10; ++i) {
            tokens[i] = address(new CounterAssetMock());
        }
        for (uint256 i; i < 10; ++i) {
            for (uint256 j = i + 1; j < 10; ++j) {
                if (tokens[j] < tokens[i]) (tokens[i], tokens[j]) = (tokens[j], tokens[i]);
            }
        }
        Escrow.Asset[] memory pins = new Escrow.Asset[](10);
        for (uint256 i; i < 10; ++i) {
            pins[i] = Escrow.Asset(tokens[i], tokens[i].codehash);
        }
        Escrow e = new Escrow(GOV, GUARD, address(launch), pins, new address[](0));
        Escrow.Funding[] memory f = new Escrow.Funding[](10);
        for (uint256 i; i < 10; ++i) {
            address[] memory r = new address[](1);
            uint256[] memory v = new uint256[](1);
            r[0] = ALICE;
            v[0] = 1;
            f[i] = Escrow.Funding(tokens[i], r, v);
            CounterAssetMock(tokens[i]).mint(GOV, 1);
            vm.prank(GOV);
            CounterAssetMock(tokens[i]).approve(address(e), 1);
        }
        vm.prank(GOV);
        uint256[] memory ids = e.fundSnapshotBatch(f, Escrow.Snapshot(1, 80, HASH, block.timestamp + 60));
        assertEq(ids.length, 10);
        assertEq(e.nextRound(), 11);
        for (uint256 i; i < 10; ++i) {
            assertEq(ids[i], i + 1);
            assertEq(e.reserved(tokens[i]), 1);
            assertEq(e.claimable(i + 1, ALICE), 1);
        }
        (Escrow.Funding[] memory pair, Escrow.Snapshot memory snap) = prep(8, 25);
        pair[1].recipients = new address[](129);
        pair[1].amounts = new uint256[](129);
        for (uint256 i; i < 129; ++i) {
            pair[1].recipients[i] = address(uint160(0x100000 + i));
            pair[1].amounts[i] = 1;
        }
        vm.expectRevert(Escrow.InvalidAllocation.selector);
        batch(pair, snap);
        assertEq(escrow.nextRound(), 1);
        pair[1].recipients = new address[](128);
        pair[1].amounts = new uint256[](128);
        for (uint256 i; i < 128; ++i) {
            pair[1].recipients[i] = address(uint160(0x100000 + i));
            pair[1].amounts[i] = 1;
        }
        batch(pair, snap);
        assertEq(escrow.reserved(pair[1].token), 128);
    }

    function testOldLiabilityAndDonationCannotReplaceFreshBatchFunding() public {
        _fund(asset, 4, 6);
        asset.mint(address(escrow), 99);
        (Escrow.Funding[] memory f, Escrow.Snapshot memory snapshot) = prep(8, 25);
        asset.destroy(GOV, asset.balanceOf(GOV));
        vm.expectRevert();
        batch(f, snapshot);
        assertEq(escrow.nextRound(), 2);
        assertEq(escrow.claimable(1, ALICE), 4);
        assertEq(escrow.claimable(1, BOB), 6);
        assertEq(escrow.reserved(address(asset)), 10);
        assertEq(asset.balanceOf(address(escrow)), 109);
        asset.mint(GOV, 1e36);
        uint256[] memory ids = batch(f, snapshot);
        assertEq(ids[0], 2);
        assertEq(ids[1], 3);
        _open();
        escrow.claimMany(ids, ALICE);
        escrow.claimMany(ids, BOB);
        assertEq(escrow.reserved(address(asset)), 10);
        assertEq(asset.balanceOf(address(escrow)), 109);
        escrow.claim(1, ALICE);
        escrow.claim(1, BOB);
        assertEq(escrow.reserved(address(asset)), 0);
        assertEq(asset.balanceOf(address(escrow)), 99);
    }

    function testFuzzBatchConservation(uint96 a, uint96 b) public {
        uint256 x = bound(uint256(a), 1, 1e30);
        uint256 y = bound(uint256(b), 1, 1e30);
        (Escrow.Funding[] memory f, Escrow.Snapshot memory s) = prep(x, y);
        uint256[] memory ids = batch(f, s);
        for (uint256 i; i < 2; ++i) {
            assertEq(escrow.reserved(f[i].token), x + y);
        }
        _open();
        escrow.claimMany(ids, ALICE);
        escrow.claimMany(ids, BOB);
        for (uint256 i; i < 2; ++i) {
            assertEq(escrow.reserved(f[i].token), 0);
            assertEq(
                CounterAssetMock(f[i].token).balanceOf(GOV) + CounterAssetMock(f[i].token).balanceOf(ALICE)
                    + CounterAssetMock(f[i].token).balanceOf(BOB),
                1e36
            );
        }
    }
}
