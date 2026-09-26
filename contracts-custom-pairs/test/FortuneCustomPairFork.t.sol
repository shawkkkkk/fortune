// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {FortuneCustomPairFactory} from "../src/FortuneCustomPairFactory.sol";
import {FortuneCustomPairCurve} from "../src/FortuneCustomPairCurve.sol";
import {FortuneCustomPairToken} from "../src/FortuneCustomPairToken.sol";
import {IPancakeV2PairLike} from "../src/interfaces/IPancakeV2.sol";
import {TaxToken} from "./mocks/PairTokens.sol";

interface IPancakeRouterLike {
    function swapExactTokensForTokensSupportingFeeOnTransferTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external;
}

/// @notice Runs against real PancakeSwap V2 on a BSC mainnet fork. Skipped
///         unless BSC_FORK_RPC_URL is set (CI uses a public BSC endpoint).
contract FortuneCustomPairForkTest is Test {
    address internal constant PANCAKE_V2_FACTORY = 0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73;
    address internal constant PANCAKE_V2_ROUTER = 0x10ED43C718714eb63d5aA57B78B54704E256024E;
    address internal constant WBNB = 0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c;
    // bStocks Apple (AAPLB), from Fortune's verified BNB Chain pair universe.
    address internal constant AAPLB = 0x431a3BEE82E2ca41e49895CbECE5bB0F76A89b7A;

    FortuneCustomPairFactory internal factory;
    address internal creator = makeAddr("creator");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");

    function setUp() public {
        string memory rpc = vm.envOr("BSC_FORK_RPC_URL", string(""));
        if (bytes(rpc).length == 0) {
            vm.skip(true);
            return;
        }
        vm.createSelectFork(rpc);
        factory = new FortuneCustomPairFactory(address(this), PANCAKE_V2_FACTORY, 50, makeAddr("treasury"));
    }

    function _launch(address pairToken, uint256 target) internal returns (FortuneCustomPairCurve curve) {
        FortuneCustomPairFactory.LaunchParams memory p;
        p.name = "Fork Stonk";
        p.symbol = "FSTONK";
        p.supply = 1_000_000_000e18;
        p.pairToken = pairToken;
        p.graduationTarget = target;
        p.creatorFeeBps = 50;
        vm.prank(creator);
        (, address curveAddress) = factory.createLaunch(p);
        curve = FortuneCustomPairCurve(curveAddress);
        vm.warp(vm.getBlockTimestamp() + 16);
    }

    function _buy(FortuneCustomPairCurve curve, address who, uint256 amount) internal returns (uint256 tokens) {
        vm.startPrank(who);
        curve.pairToken().approve(address(curve), amount);
        tokens = curve.buy(amount, 0);
        vm.stopPrank();
    }

    function _poolPriceX18(FortuneCustomPairCurve curve) internal view returns (uint256) {
        IPancakeV2PairLike pool = IPancakeV2PairLike(curve.pool());
        (uint112 r0, uint112 r1,) = pool.getReserves();
        (uint256 pairReserve, uint256 launchReserve) =
            pool.token0() == address(curve.pairToken()) ? (uint256(r0), uint256(r1)) : (uint256(r1), uint256(r0));
        return pairReserve * 1e36 / launchReserve;
    }

    function _swap(address tokenIn, address tokenOut, uint256 amountIn, address who) internal returns (uint256 received) {
        address[] memory path = new address[](2);
        path[0] = tokenIn;
        path[1] = tokenOut;
        uint256 before = IERC20(tokenOut).balanceOf(who);
        vm.startPrank(who);
        IERC20(tokenIn).approve(PANCAKE_V2_ROUTER, amountIn);
        IPancakeRouterLike(PANCAKE_V2_ROUTER).swapExactTokensForTokensSupportingFeeOnTransferTokens(
            amountIn, 0, path, who, block.timestamp
        );
        vm.stopPrank();
        received = IERC20(tokenOut).balanceOf(who) - before;
    }

    function _graduateAndCheck(FortuneCustomPairCurve curve) internal {
        assertTrue(curve.graduationReady());
        uint256 finalPrice = curve.spotPriceX18();
        uint256 liquidity = curve.graduate();
        assertGt(liquidity, 0);
        IPancakeV2PairLike pool = IPancakeV2PairLike(curve.pool());
        assertEq(IERC20(address(pool)).balanceOf(curve.DEAD()), liquidity, "LP burned");
        uint256 poolPrice = _poolPriceX18(curve);
        uint256 diff = poolPrice > finalPrice ? poolPrice - finalPrice : finalPrice - poolPrice;
        assertLe(diff * 1_000_000, finalPrice, "real Pancake pool opens at the curve price");
    }

    function testForkTaxedPairGraduatesToRealPancakeAndTrades() public {
        TaxToken pair = new TaxToken("FORKTAX", 18, 500);
        FortuneCustomPairCurve curve = _launch(address(pair), 20e18);
        FortuneCustomPairToken token = curve.launchToken();
        assertEq(IPancakeV2FactoryView(PANCAKE_V2_FACTORY).getPair(address(token), address(pair)), curve.pool());

        pair.mint(alice, 100e18);
        uint256 tokens = _buy(curve, alice, 5e18);
        vm.startPrank(alice);
        token.approve(address(curve), tokens / 2);
        curve.sell(tokens / 2, 0);
        vm.stopPrank();
        _buy(curve, alice, 60e18);
        _graduateAndCheck(curve);

        pair.mint(bob, 1e18);
        uint256 bought = _swap(address(pair), address(token), 1e18, bob);
        assertGt(bought, 0);
        uint256 sold = _swap(address(token), address(pair), bought, bob);
        assertGt(sold, 0);
    }

    function testForkRealTokenizedStockPair() public {
        require(AAPLB.code.length > 0, "AAPLB missing on this fork");
        uint256 unit = 1e18;
        deal(AAPLB, alice, 100 * unit, true);
        assertEq(IERC20(AAPLB).balanceOf(alice), 100 * unit);

        FortuneCustomPairCurve curve = _launch(AAPLB, 20 * unit);
        assertEq(curve.pairDecimals(), 18);
        uint256 tokens = _buy(curve, alice, 2 * unit);
        vm.startPrank(alice);
        curve.launchToken().approve(address(curve), tokens);
        curve.sell(tokens, 0);
        vm.stopPrank();
        _buy(curve, alice, 60 * unit);
        _graduateAndCheck(curve);
    }

    function testForkWbnbPair() public {
        deal(WBNB, alice, 100e18);
        FortuneCustomPairCurve curve = _launch(WBNB, 10e18);
        _buy(curve, alice, 30e18);
        _graduateAndCheck(curve);
        deal(WBNB, bob, 1e18);
        assertGt(_swap(WBNB, address(curve.launchToken()), 1e18, bob), 0);
    }
}

interface IPancakeV2FactoryView {
    function getPair(address tokenA, address tokenB) external view returns (address);
}
