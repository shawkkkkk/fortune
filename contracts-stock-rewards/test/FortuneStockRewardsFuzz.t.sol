// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {FortuneStockRewardsToken} from "../src/FortuneStockRewardsToken.sol";
import {MockV3Factory, MockV2Factory} from "./mocks/MockPancake.sol";
import {MockStock} from "./mocks/RewardTokens.sol";

contract FortuneStockRewardsFuzzTest is Test {
    uint256 internal constant SUPPLY = 1_000_000_000e18;
    uint256 internal constant STREAM = 6 hours;

    FortuneStockRewardsToken internal token;
    MockStock internal tsla;
    MockStock internal aapl;
    address[4] internal holders;
    uint256[2] internal paidOut;

    function setUp() public {
        vm.warp(1_800_000_000);
        tsla = new MockStock("TSLA", 18);
        aapl = new MockStock("AAPL", 6);
        address[] memory assets = new address[](2);
        assets[0] = address(tsla);
        assets[1] = address(aapl);
        token = new FortuneStockRewardsToken(
            "Stock Rewards",
            "SRW",
            SUPPLY,
            address(this),
            assets,
            address(new MockV3Factory()),
            address(new MockV2Factory()),
            new address[](0)
        );
        holders = [makeAddr("h0"), makeAddr("h1"), makeAddr("h2"), makeAddr("h3")];
    }

    function testFuzzPaymentsSplitByBalance(uint256 b0, uint256 b1, uint256 amount, uint256 waited) public {
        b0 = bound(b0, 1e18, SUPPLY / 2);
        b1 = bound(b1, 1e18, SUPPLY / 2);
        amount = bound(amount, 1, type(uint96).max);
        waited = bound(waited, STREAM, 30 days);
        token.transfer(holders[0], b0);
        token.transfer(holders[1], b1);
        tsla.mint(address(token), amount);
        token.sync();
        skip(waited);
        uint256 c0 = token.claimableOf(address(tsla), holders[0]);
        uint256 c1 = token.claimableOf(address(tsla), holders[1]);
        assertLe(c0 + c1, amount);
        assertApproxEqAbs(c0, amount * b0 / (b0 + b1), 2);
        assertApproxEqAbs(c1, amount * b1 / (b0 + b1), 2);
    }

    function testFuzzPaymentsFollowTimeHeld(uint256 amount, uint256 handoverAt, uint256 moved) public {
        amount = bound(amount, 1e12, type(uint96).max);
        handoverAt = bound(handoverAt, 1, STREAM - 1);
        moved = bound(moved, 1e18, 100e18);
        token.transfer(holders[0], 100e18);
        tsla.mint(address(token), amount);
        token.sync();
        skip(handoverAt);
        vm.prank(holders[0]);
        token.transfer(holders[1], moved);
        skip(STREAM);
        // Before the handover Alice held everything; afterwards the remaining
        // stream splits by the new balances.
        uint256 first = amount * handoverAt / STREAM;
        uint256 rest = amount - first;
        uint256 expected0 = first + rest * (100e18 - moved) / 100e18;
        uint256 expected1 = rest * moved / 100e18;
        assertApproxEqAbs(token.claimableOf(address(tsla), holders[0]), expected0, 3);
        assertApproxEqAbs(token.claimableOf(address(tsla), holders[1]), expected1, 3);
    }

    /// Random sequences of transfers, payments, claims, burns, exclusions and
    /// waits never pay out more than was received, and once the streams end
    /// everything received is either paid or claimable.
    function testFuzzBookkeepingBalances(uint256 seed) public {
        for (uint256 i; i < 4; ++i) {
            token.transfer(holders[i], (i + 1) * 10_000_000e18);
        }
        for (uint256 step; step < 40; ++step) {
            uint256 r = uint256(keccak256(abi.encode(seed, step)));
            address who = holders[r % 4];
            address other = holders[(r >> 8) % 4];
            uint256 action = (r >> 16) % 8;
            if (action == 0) {
                uint256 balance = token.balanceOf(who);
                vm.prank(who);
                token.transfer(other, balance * ((r >> 32) % 101) / 100);
            } else if (action == 1) {
                tsla.mint(address(token), (r >> 40) % 1e24);
                if ((r >> 100) % 2 == 0) token.sync();
            } else if (action == 2) {
                aapl.mint(address(token), (r >> 40) % 1e12);
            } else if (action == 3) {
                vm.prank(who);
                uint256[] memory paid = token.claim();
                paidOut[0] += paid[0];
                paidOut[1] += paid[1];
            } else if (action == 4) {
                uint256 balance = token.balanceOf(who);
                vm.prank(who);
                token.burn(balance * ((r >> 32) % 51) / 100);
            } else if (action == 5) {
                uint256 balance = token.balanceOf(who);
                vm.prank(who);
                token.transfer(address(token), balance * ((r >> 32) % 51) / 100);
            } else if (action == 6 && step == 20) {
                token.excludeFromRewards(who);
            } else {
                skip((r >> 32) % 3 hours);
            }
            assertBooksBalance();
        }
        // Take in any payment no one synced yet, then let every stream run out.
        token.sync();
        skip(STREAM + 1);
        token.sync();
        assertBooksBalance();
        for (uint256 a; a < 2; ++a) {
            address asset = a == 0 ? address(tsla) : address(aapl);
            FortuneStockRewardsToken.RewardState memory state = token.rewardState(asset);
            assertEq(state.streaming, 0, "stream ended");
            uint256 claimableTotal;
            for (uint256 i; i < 4; ++i) {
                claimableTotal += token.claimableOf(asset, holders[i]);
            }
            // Everything owed is claimable, but for rounding (a wei per holder per release).
            assertLe(claimableTotal, state.owed);
            assertApproxEqAbs(claimableTotal, state.owed, 4 * 60, "owed is claimable");
        }
    }

    function assertBooksBalance() internal view {
        for (uint256 a; a < 2; ++a) {
            address asset = a == 0 ? address(tsla) : address(aapl);
            FortuneStockRewardsToken.RewardState memory state = token.previewRewardState(asset);
            uint256 held = MockStock(asset).balanceOf(address(token));
            assertEq(held, uint256(state.owed) + state.streaming, "held = owed + streaming");
            assertEq(state.totalReceived, paidOut[a] + state.owed + state.streaming, "received = paid + owed + streaming");
            uint256 claimableTotal;
            for (uint256 i; i < 4; ++i) {
                claimableTotal += token.claimableOf(asset, holders[i]);
            }
            assertLe(claimableTotal, state.owed, "claimable <= owed");
        }
    }
}
