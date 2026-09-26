// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {FortuneCustomPairFactory} from "../src/FortuneCustomPairFactory.sol";
import {FortuneCustomPairCurve} from "../src/FortuneCustomPairCurve.sol";
import {FortuneCustomPairToken} from "../src/FortuneCustomPairToken.sol";
import {MockPancakeV2Factory, MockPancakeV2Pair} from "./mocks/MockPancakeV2.sol";

interface IMintable {
    function mint(address to, uint256 amount) external;
}

abstract contract CustomPairBase is Test {
    uint256 internal constant SUPPLY = 1_000_000_000e18;
    uint16 internal constant PROTOCOL_FEE_BPS = 50;
    uint16 internal constant CREATOR_FEE_BPS = 50;

    MockPancakeV2Factory internal pancake;
    FortuneCustomPairFactory internal factory;

    address internal owner = makeAddr("owner");
    address internal treasury = makeAddr("treasury");
    address internal creator = makeAddr("creator");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal carol = makeAddr("carol");

    function setUp() public virtual {
        vm.warp(1_800_000_000);
        pancake = new MockPancakeV2Factory();
        factory = new FortuneCustomPairFactory(owner, address(pancake), PROTOCOL_FEE_BPS, treasury);
    }

    function params(address pairToken, uint256 target) internal pure returns (FortuneCustomPairFactory.LaunchParams memory p) {
        p.name = "Fortune Stonk";
        p.symbol = "STONK";
        p.supply = SUPPLY;
        p.pairToken = pairToken;
        p.graduationTarget = target;
        p.creatorFeeBps = CREATOR_FEE_BPS;
        p.description = "Paired with any BEP-20.";
        p.imageURI = "https://example.com/stonk.png";
    }

    function launch(address pairToken, uint256 target)
        internal
        returns (FortuneCustomPairCurve curve, FortuneCustomPairToken token)
    {
        vm.prank(creator);
        (address tokenAddress, address curveAddress) = factory.createLaunch(params(pairToken, target));
        curve = FortuneCustomPairCurve(curveAddress);
        token = FortuneCustomPairToken(tokenAddress);
    }

    /// Launch, then move past the Launch Shield so buys are untaxed and uncapped.
    function launchOpen(address pairToken, uint256 target)
        internal
        returns (FortuneCustomPairCurve curve, FortuneCustomPairToken token)
    {
        (curve, token) = launch(pairToken, target);
        vm.warp(block.timestamp + 16);
    }

    function fund(address pairToken, address who, uint256 amount) internal {
        IMintable(pairToken).mint(who, amount);
    }

    function buyAs(address who, FortuneCustomPairCurve curve, uint256 amountIn) internal returns (uint256 tokensOut) {
        IERC20 pair = curve.pairToken();
        vm.startPrank(who);
        pair.approve(address(curve), amountIn);
        tokensOut = curve.buy(amountIn, 0);
        vm.stopPrank();
    }

    function sellAs(address who, FortuneCustomPairCurve curve, uint256 tokenAmount) internal returns (uint256 delivered) {
        vm.startPrank(who);
        IERC20(address(curve.launchToken())).approve(address(curve), tokenAmount);
        delivered = curve.sell(tokenAmount, 0);
        vm.stopPrank();
    }

    function liabilities(FortuneCustomPairCurve curve) internal view returns (uint256) {
        return curve.reserve() + curve.shieldReserve() + curve.protocolFeesOwed() + curve.creatorFeesOwed();
    }

    /// Pool price in pair base units per whole launch token, scaled by 1e18.
    function poolPriceX18(FortuneCustomPairCurve curve) internal view returns (uint256) {
        MockPancakeV2Pair pool = MockPancakeV2Pair(curve.pool());
        (uint112 r0, uint112 r1,) = pool.getReserves();
        (uint256 pairReserve, uint256 launchReserve) =
            pool.token0() == address(curve.pairToken()) ? (uint256(r0), uint256(r1)) : (uint256(r1), uint256(r0));
        return pairReserve * 1e36 / launchReserve;
    }

    function assertRelApprox(uint256 a, uint256 b, uint256 maxDeltaPpm, string memory label) internal pure {
        uint256 diff = a > b ? a - b : b - a;
        assertLe(diff * 1_000_000, (a > b ? a : b) * maxDeltaPpm, label);
    }
}
