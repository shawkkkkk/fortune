// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {FortuneCustomPairFactory} from "../src/FortuneCustomPairFactory.sol";
import {FortuneCustomPairCurve} from "../src/FortuneCustomPairCurve.sol";
import {FortuneCustomPairToken} from "../src/FortuneCustomPairToken.sol";
import {MockPancakeV2Factory} from "./mocks/MockPancakeV2.sol";
import {TaxToken} from "./mocks/PairTokens.sol";

contract CustomPairHandler is Test {
    FortuneCustomPairCurve public immutable curve;
    FortuneCustomPairToken public immutable token;
    TaxToken public immutable pair;
    address[4] internal actors;
    uint256 public buys;
    uint256 public sells;

    constructor(FortuneCustomPairCurve curve_, TaxToken pair_) {
        curve = curve_;
        token = curve_.launchToken();
        pair = pair_;
        actors = [makeAddr("h1"), makeAddr("h2"), makeAddr("h3"), makeAddr("h4")];
        for (uint256 i; i < actors.length; ++i) pair.mint(actors[i], 10_000e18);
    }

    function actorAt(uint256 i) external view returns (address) {
        return actors[i];
    }

    function buy(uint256 actorSeed, uint256 amount) external {
        address who = actors[actorSeed % actors.length];
        amount = bound(amount, 1e9, 200e18);
        if (pair.balanceOf(who) < amount) return;
        vm.startPrank(who);
        pair.approve(address(curve), amount);
        try curve.buy(amount, 0) {
            buys++;
        } catch {}
        vm.stopPrank();
    }

    function sell(uint256 actorSeed, uint256 amount) external {
        address who = actors[actorSeed % actors.length];
        uint256 held = token.balanceOf(who);
        if (held == 0) return;
        amount = bound(amount, 1, held);
        vm.startPrank(who);
        token.approve(address(curve), amount);
        try curve.sell(amount, 0) {
            sells++;
        } catch {}
        vm.stopPrank();
    }

    function warp(uint256 seconds_) external {
        vm.warp(vm.getBlockTimestamp() + bound(seconds_, 1, 3 days));
    }

    function donate(uint256 amount) external {
        amount = bound(amount, 1, 5e18);
        pair.mint(address(curve), amount);
    }

    function graduate() external {
        try curve.graduate() {} catch {}
    }

    function claimFees() external {
        try curve.claimProtocolFees() {} catch {}
        vm.prank(curve.creatorFeeRecipient());
        try curve.claimCreatorFees() {} catch {}
    }
}

contract FortuneCustomPairInvariantTest is Test {
    FortuneCustomPairCurve internal curve;
    FortuneCustomPairToken internal token;
    TaxToken internal pair;
    CustomPairHandler internal handler;

    function setUp() public {
        vm.warp(1_800_000_000);
        MockPancakeV2Factory pancake = new MockPancakeV2Factory();
        FortuneCustomPairFactory factory =
            new FortuneCustomPairFactory(address(this), address(pancake), 50, makeAddr("treasury"));
        pair = new TaxToken("TAX", 18, 300);
        FortuneCustomPairFactory.LaunchParams memory p;
        p.name = "Invariant";
        p.symbol = "INV";
        p.supply = 1_000_000_000e18;
        p.pairToken = address(pair);
        p.graduationTarget = 1_500e18;
        p.creatorFeeBps = 100;
        (address tokenAddress, address curveAddress) = factory.createLaunch(p);
        curve = FortuneCustomPairCurve(curveAddress);
        token = FortuneCustomPairToken(tokenAddress);
        handler = new CustomPairHandler(curve, pair);
        targetContract(address(handler));
    }

    function _heldByActors() internal view returns (uint256 total) {
        for (uint256 i; i < 4; ++i) total += token.balanceOf(handler.actorAt(i));
    }

    function invariant_pairBalanceCoversEverythingOwed() public view {
        assertGe(
            pair.balanceOf(address(curve)),
            curve.reserve() + curve.shieldReserve() + curve.protocolFeesOwed() + curve.creatorFeesOwed()
        );
    }

    function invariant_circulatingIsExactlyWhatHoldersHave() public view {
        if (curve.graduated()) return;
        assertEq(curve.circulating(), _heldByActors());
        assertEq(token.balanceOf(address(curve)) + curve.circulating(), token.totalSupply());
    }

    function invariant_curveNeverSellsMoreThanItsFormulaAllows() public view {
        if (curve.graduated()) return;
        uint256 a0 = curve.virtualReserve();
        uint256 r = curve.reserve();
        // circulating <= sold(R) = S * R / (a0 + R)
        assertLe(curve.circulating() * (a0 + r), curve.launchSupply() * r);
    }

    function invariant_reserveNeverPassesTargetByMoreThanRounding() public view {
        assertLe(curve.reserve(), curve.graduationTarget() + 2);
    }

    function invariant_poolLockedUntilGraduation() public view {
        if (!curve.graduated()) {
            assertFalse(token.poolOpen());
            assertEq(token.balanceOf(curve.pool()), 0);
        }
    }

    /// After any sequence, every holder can still sell everything while the curve is open.
    function afterInvariant() external {
        if (curve.graduationReady() || curve.graduated() || curve.rescueActive()) return;
        for (uint256 i; i < 4; ++i) {
            address who = handler.actorAt(i);
            uint256 held = token.balanceOf(who);
            if (held == 0) continue;
            (,, uint256 pairSent) = curve.previewSell(held);
            if (pairSent == 0) continue;
            vm.startPrank(who);
            token.approve(address(curve), held);
            curve.sell(held, 0);
            vm.stopPrank();
        }
        assertLe(curve.circulating(), 1e9);
    }
}
