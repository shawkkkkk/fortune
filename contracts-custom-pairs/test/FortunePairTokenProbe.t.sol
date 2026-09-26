// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {FortunePairTokenProbe} from "../src/FortunePairTokenProbe.sol";
import {PlainToken, TaxToken, TaxOnTopToken, PausableBlacklistToken, NoReturnToken} from "./mocks/PairTokens.sol";

/// The website runs the probe through eth_call state overrides; vm.etch is the
/// same thing inside a test.
contract FortunePairTokenProbeTest is Test {
    address internal holder = makeAddr("holder");
    address internal curve = address(0xF0C0);
    address internal wallet = address(0xF0C1);
    address internal pool = address(0xF0C2);

    function setUp() public {
        bytes memory code = address(new FortunePairTokenProbe()).code;
        vm.etch(holder, code);
        vm.etch(curve, code);
        vm.etch(wallet, code);
        vm.etch(pool, code);
    }

    function _run(address token, uint256 amount) internal returns (FortunePairTokenProbe.Report memory) {
        return FortunePairTokenProbe(holder).run(token, amount, curve, wallet, pool);
    }

    function testPlainTokenHasNoTaxOnAnyLeg() public {
        PlainToken token = new PlainToken("PLAIN", 18);
        token.mint(holder, 10e18);
        FortunePairTokenProbe.Report memory r = _run(address(token), 1e18);
        assertEq(r.holderBalance, 10e18);
        assertTrue(r.seed.ok && r.payout.ok && r.pull.ok && r.toPool.ok);
        assertEq(r.seed.recipientReceived, 1e18);
        assertEq(r.payout.recipientReceived, 0.5e18);
        assertEq(r.pull.recipientReceived, 0.5e18);
        assertEq(r.toPool.recipientReceived, r.toPool.amount);
        assertEq(r.pull.senderSpent, r.pull.amount);
    }

    function testTransferTaxIsMeasuredOnEveryLeg() public {
        TaxToken token = new TaxToken("TAX", 18, 500);
        token.mint(holder, 10e18);
        FortunePairTokenProbe.Report memory r = _run(address(token), 1e18);
        assertEq(r.seed.recipientReceived, 0.95e18);
        assertEq(r.payout.amount, 0.475e18);
        assertEq(r.payout.recipientReceived, 0.475e18 * 95 / 100);
        assertEq(r.pull.recipientReceived, r.pull.amount * 95 / 100);
        assertEq(r.toPool.recipientReceived, r.toPool.amount * 95 / 100);
        assertEq(r.payout.senderSpent, r.payout.amount, "tax comes out of the amount, not on top");
    }

    function testTaxOnTopShowsAsExtraSenderSpend() public {
        TaxOnTopToken token = new TaxOnTopToken(300);
        token.mint(holder, 10e18);
        FortunePairTokenProbe.Report memory r = _run(address(token), 1e18);
        assertEq(r.seed.recipientReceived, 1e18);
        assertEq(r.seed.senderSpent, 1.03e18);
    }

    function testPausedTokenReportsRevertInsteadOfFailing() public {
        PausableBlacklistToken token = new PausableBlacklistToken();
        token.mint(holder, 10e18);
        token.setPaused(true);
        FortunePairTokenProbe.Report memory r = _run(address(token), 1e18);
        assertTrue(r.seed.attempted);
        assertFalse(r.seed.ok);
        assertGt(r.seed.revertData.length, 0);
        assertFalse(r.payout.attempted);
    }

    function testBlacklistedWalletShowsOnTheSellLeg() public {
        PausableBlacklistToken token = new PausableBlacklistToken();
        token.mint(holder, 10e18);
        token.setBlacklisted(wallet, true);
        FortunePairTokenProbe.Report memory r = _run(address(token), 1e18);
        assertTrue(r.seed.ok);
        assertFalse(r.payout.ok);
        assertTrue(r.toPool.ok);
    }

    function testUsdtStyleTokenWithoutReturnValue() public {
        NoReturnToken token = new NoReturnToken();
        token.mint(holder, 10e6);
        FortunePairTokenProbe.Report memory r = _run(address(token), 1e6);
        assertTrue(r.seed.ok && r.payout.ok && r.pull.ok && r.toPool.ok);
        assertEq(r.pull.recipientReceived, r.pull.amount);
    }
}
