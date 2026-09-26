// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {CustomPairBase} from "./CustomPairBase.sol";
import {FortuneCustomPairCurve} from "../src/FortuneCustomPairCurve.sol";
import {FortuneCustomPairToken} from "../src/FortuneCustomPairToken.sol";
import {TaxToken} from "./mocks/PairTokens.sol";

contract FortuneCustomPairFuzzTest is CustomPairBase {
    function testFuzzRoundTripNeverProfits(uint96 amountIn, uint96 priorBuy, uint16 taxBps, uint8 secondsIn) public {
        taxBps = uint16(bound(taxBps, 0, 2_000));
        uint256 target = 50e18;
        amountIn = uint96(bound(amountIn, 1e9, 20e18));
        priorBuy = uint96(bound(priorBuy, 0, 20e18));
        TaxToken pair = new TaxToken("TAX", 18, taxBps);
        (FortuneCustomPairCurve curve,) = launch(address(pair), target);
        vm.warp(vm.getBlockTimestamp() + 16 + bound(secondsIn, 0, 100));

        if (priorBuy > 1e9) {
            fund(address(pair), bob, priorBuy);
            buyAs(bob, curve, priorBuy);
        }
        if (curve.graduationReady()) return;

        fund(address(pair), alice, amountIn);
        uint256 tokens = buyAs(alice, curve, amountIn);
        if (curve.graduationReady() || tokens == 0) return;
        (,, uint256 pairSent) = curve.previewSell(tokens);
        if (pairSent == 0) return;
        sellAs(alice, curve, tokens);
        assertLe(pair.balanceOf(alice), amountIn, "a buy and sell never returns more than was paid");
        assertGe(pair.balanceOf(address(curve)), liabilities(curve));
    }

    function testFuzzGraduationKeepsPriceContinuity(uint16 taxBps, uint128 targetSeed, uint96 firstBuy, uint8 shieldSecond)
        public
    {
        taxBps = uint16(bound(taxBps, 0, 2_500));
        uint256 target = bound(targetSeed, 1e12, 1e30);
        TaxToken pair = new TaxToken("TAX", 18, taxBps);
        (FortuneCustomPairCurve curve, FortuneCustomPairToken token) = launch(address(pair), target);

        // An optional shielded buy in the opening seconds, then a normal one.
        vm.warp(vm.getBlockTimestamp() + bound(shieldSecond, 0, 6));
        uint256 opening = bound(firstBuy, 0, target / 50);
        if (opening > 0) {
            fund(address(pair), bob, opening);
            vm.startPrank(bob);
            pair.approve(address(curve), opening);
            try curve.buy(opening, 0) {} catch {}
            vm.stopPrank();
        }
        vm.warp(vm.getBlockTimestamp() + 16);
        uint256 fill = target * 3;
        fund(address(pair), alice, fill);
        buyAs(alice, curve, fill);
        assertTrue(curve.graduationReady());

        uint256 finalPrice = curve.spotPriceX18();
        curve.graduate();
        assertRelApprox(poolPriceX18(curve), finalPrice, 5, "pool opens at the curve's final price");
        assertEq(token.balanceOf(address(curve)), 0);
        assertGe(pair.balanceOf(address(curve)), curve.protocolFeesOwed() + curve.creatorFeesOwed());
    }

    /// Random trading between three wallets with a random transfer tax. After
    /// every step the curve is solvent and holds exactly the unsold supply; at
    /// the end every wallet can still sell everything.
    function testFuzzSolvencyAcrossTradeSequences(uint256 seed, uint16 taxBps) public {
        taxBps = uint16(bound(taxBps, 0, 1_500));
        TaxToken pair = new TaxToken("TAX", 18, taxBps);
        (FortuneCustomPairCurve curve, FortuneCustomPairToken token) = launch(address(pair), 1_000e18);
        address[3] memory wallets = [alice, bob, carol];
        for (uint256 i; i < wallets.length; ++i) fund(address(pair), wallets[i], 1_000e18);

        for (uint256 step; step < 24; ++step) {
            seed = uint256(keccak256(abi.encode(seed, step)));
            address who = wallets[seed % 3];
            uint256 action = (seed >> 8) % 4;
            if (action == 0) {
                vm.warp(vm.getBlockTimestamp() + (seed >> 16) % 7);
            } else if (action == 1 || action == 2) {
                uint256 amount = bound(seed >> 32, 1e12, 40e18);
                if (pair.balanceOf(who) < amount) continue;
                vm.startPrank(who);
                pair.approve(address(curve), amount);
                try curve.buy(amount, 0) {} catch {}
                vm.stopPrank();
            } else {
                uint256 held = token.balanceOf(who);
                if (held == 0) continue;
                uint256 amount = bound(seed >> 32, 1, held);
                vm.startPrank(who);
                token.approve(address(curve), amount);
                try curve.sell(amount, 0) {} catch {}
                vm.stopPrank();
            }

            assertGe(pair.balanceOf(address(curve)), liabilities(curve), "solvent");
            assertEq(
                token.balanceOf(alice) + token.balanceOf(bob) + token.balanceOf(carol), curve.circulating(), "circulating"
            );
            assertEq(token.balanceOf(address(curve)) + curve.circulating(), SUPPLY, "inventory");
        }

        if (curve.graduationReady()) return;
        for (uint256 i; i < wallets.length; ++i) {
            uint256 held = token.balanceOf(wallets[i]);
            if (held == 0) continue;
            (,, uint256 pairSent) = curve.previewSell(held);
            if (pairSent == 0) continue;
            sellAs(wallets[i], curve, held);
        }
        assertLe(curve.circulating(), 1e9, "everyone could exit");
        assertGe(pair.balanceOf(address(curve)), liabilities(curve));
    }
}
