// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {CounterEscrowBase} from "./FortuneTestnetCounterEscrow.t.sol";
import {FortuneTestnetCounterEscrow as E} from "../src/FortuneTestnetCounterEscrow.sol";

contract FortuneTestnetCounterBatchTest is CounterEscrowBase {
    function ids() internal pure returns (uint256[] memory a) {
        a = new uint256[](2);
        a[0] = 1;
        a[1] = 2;
    }

    function testFuzzTwoAssetsPayOnlyFixedRecipient(uint128 raw) public {
        uint256 amount = bound(raw, 1, 1e24);
        _fund(asset, amount, 7);
        _fund(second, amount + 1, 9);
        _open();
        vm.prank(GUARD);
        escrow.claimMany(ids(), ALICE);
        assertEq(asset.balanceOf(ALICE), amount);
        assertEq(second.balanceOf(ALICE), amount + 1);
        assertEq(asset.balanceOf(GUARD), 0);
        assertEq(second.balanceOf(GUARD), 0);
        assertEq(escrow.reserved(address(asset)), 7);
        assertEq(escrow.reserved(address(second)), 9);
        vm.expectRevert(E.NothingToClaim.selector);
        escrow.claimMany(ids(), ALICE);
        escrow.claim(1, BOB);
        escrow.claim(2, BOB);
        assertEq(escrow.reserved(address(asset)), 0);
        assertEq(escrow.reserved(address(second)), 0);
    }

    function testLaterFailureRollsBackEarlierPaymentAndLiability() public {
        _fund(asset, 10, 7);
        _fund(second, 20, 9);
        _open();
        second.configure(true, false, address(0));
        vm.expectRevert(E.InexactTransfer.selector);
        escrow.claimMany(ids(), ALICE);
        assertEq(asset.balanceOf(ALICE), 0);
        assertEq(second.balanceOf(ALICE), 0);
        assertEq(escrow.claimable(1, ALICE), 10);
        assertEq(escrow.claimable(2, ALICE), 20);
        assertEq(escrow.reserved(address(asset)), 17);
        assertEq(escrow.reserved(address(second)), 29);
        (,, uint256 remaining,) = escrow.rounds(1);
        assertEq(remaining, 17);
        second.configure(false, false, address(0));
        escrow.claimMany(ids(), ALICE);
        assertEq(asset.balanceOf(ALICE), 10);
        assertEq(second.balanceOf(ALICE), 20);
    }

    function testBoundsOrderMissingEntitlementPauseAndChainFailClosed() public {
        _fund(asset, 10, 7);
        _open();
        vm.expectRevert(E.InvalidAllocation.selector);
        escrow.claimMany(new uint256[](0), ALICE);
        vm.expectRevert(E.InvalidAllocation.selector);
        escrow.claimMany(new uint256[](33), ALICE);
        uint256[] memory a = ids();
        a[1] = 1;
        vm.expectRevert(E.InvalidAllocation.selector);
        escrow.claimMany(a, ALICE);
        a[0] = 2;
        a[1] = 1;
        vm.expectRevert(E.InvalidAllocation.selector);
        escrow.claimMany(a, ALICE);
        a[0] = 0;
        vm.expectRevert(E.InvalidAllocation.selector);
        escrow.claimMany(a, ALICE);
        vm.expectRevert(E.NothingToClaim.selector);
        escrow.claimMany(ids(), ALICE);
        assertEq(asset.balanceOf(ALICE), 0);
        assertEq(escrow.claimable(1, ALICE), 10);
        vm.prank(GUARD);
        escrow.setPaused(true);
        vm.expectRevert(E.WrongPauseState.selector);
        escrow.claimMany(ids(), ALICE);
        vm.chainId(1);
        vm.expectRevert(E.WrongChain.selector);
        escrow.claimMany(ids(), ALICE);
    }

    function testFullBoundSameAssetAndReentryPreserveAccounting() public {
        uint256[] memory a = new uint256[](32);
        for (uint256 i; i < 32; ++i) {
            a[i] = _fund(asset, 1, 2);
        }
        _open();
        asset.configure(false, false, address(escrow));
        escrow.claimMany(a, ALICE);
        assertTrue(asset.reentryRejected());
        assertEq(asset.balanceOf(ALICE), 32);
        assertEq(escrow.reserved(address(asset)), 64);
        for (uint256 i; i < 32; ++i) {
            assertEq(escrow.claimable(a[i], ALICE), 0);
        }
    }
}
