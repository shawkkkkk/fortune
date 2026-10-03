// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {FortuneAssetRegistry} from "fortune/FortuneAssetRegistry.sol";
import {FortuneCurve} from "fortune/FortuneCurve.sol";
import {FortunePancakeV3GraduationAdapter} from "fortune/FortunePancakeV3GraduationAdapter.sol";
import {FortunePermanentLiquidityLocker} from "fortune/FortunePermanentLiquidityLocker.sol";
import {FortuneCurveDeployer} from "fortune/deployers/FortuneCurveDeployer.sol";
import {FortuneFeeRouterDeployer} from "fortune/deployers/FortuneFeeRouterDeployer.sol";
import {MockUsdOracle} from "fortune/test/MockUsdOracle.sol";
import {FortuneStockRewardsFactory} from "../src/FortuneStockRewardsFactory.sol";
import {FortuneStockRewardsToken} from "../src/FortuneStockRewardsToken.sol";
import {FortuneStockRewardsTokenDeployer} from "../src/FortuneStockRewardsTokenDeployer.sol";
import {FortuneTestStock} from "../src/testnet/FortuneTestStock.sol";

interface IPancakeV3SwapPool {
    function token0() external view returns (address);
    function swap(address recipient, bool zeroForOne, int256 amountSpecified, uint160 sqrtPriceLimitX96, bytes calldata data)
        external
        returns (int256 amount0, int256 amount1);
}

interface IPancakeV3FactoryView {
    function getPool(address tokenA, address tokenB, uint24 fee) external view returns (address);
}

/// @notice The whole Stock Rewards lifecycle against real PancakeSwap V3 on a
///         BSC Testnet fork. Skipped unless BSC_TESTNET_RPC_URL is set.
contract FortuneStockRewardsForkTest is Test {
    address internal constant PANCAKE_V3_FACTORY = 0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865;
    address internal constant PANCAKE_V3_POSITION_MANAGER = 0x427bF5b37357632377eCbEC9de3626C71A5396c1;
    address internal constant PANCAKE_V2_FACTORY = 0x6725F303b657a9451d8BA641348b6761A6CC7a17;
    uint160 internal constant MIN_SQRT_RATIO = 4295128739;
    uint160 internal constant MAX_SQRT_RATIO = 1461446703485210103287273052203988822378723970342;
    uint24 internal constant POOL_FEE = 10_000;

    FortuneAssetRegistry internal registry;
    MockUsdOracle internal oracle;
    FortuneStockRewardsFactory internal factory;
    FortuneTestStock internal tsla;
    FortuneTestStock internal aapl;

    address internal creator = makeAddr("creator");
    address internal treasury = makeAddr("treasury");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");

    function setUp() public {
        string memory rpc = vm.envOr("BSC_TESTNET_RPC_URL", string(""));
        if (bytes(rpc).length == 0) {
            vm.skip(true);
            return;
        }
        vm.createSelectFork(rpc);
        registry = new FortuneAssetRegistry(address(this));
        oracle = new MockUsdOracle(address(this));
        tsla = list("Tesla (test)", "tTSLA", 18, 250e18);
        aapl = list("Apple (test)", "tAAPL", 6, 230e18);
        factory = new FortuneStockRewardsFactory(
            address(this),
            address(registry),
            address(new FortuneCurveDeployer()),
            address(new FortuneFeeRouterDeployer()),
            address(new FortuneStockRewardsTokenDeployer()),
            PANCAKE_V3_FACTORY,
            PANCAKE_V2_FACTORY,
            treasury
        );
        FortunePermanentLiquidityLocker locker =
            new FortunePermanentLiquidityLocker(address(factory), PANCAKE_V3_POSITION_MANAGER);
        FortunePancakeV3GraduationAdapter adapter = new FortunePancakeV3GraduationAdapter(
            address(factory), address(registry), PANCAKE_V3_FACTORY, PANCAKE_V3_POSITION_MANAGER, address(locker)
        );
        factory.initialize(address(adapter), address(locker));
    }

    function list(string memory name, string memory symbol, uint8 decimals, uint256 price)
        internal
        returns (FortuneTestStock stock)
    {
        stock = new FortuneTestStock(name, symbol, decimals, 100);
        oracle.setPrice(address(stock), price);
        registry.configureAsset(
            address(stock),
            FortuneAssetRegistry.AssetConfig({
                oracle: address(oracle),
                maxOracleAge: 3600,
                quoteEnabled: true,
                rewardEnabled: true,
                graduationEnabled: true,
                active: true,
                category: "stock"
            })
        );
    }

    function testFullLifecycleOnRealPancakeV3() public {
        address[] memory stocks = new address[](2);
        stocks[0] = address(tsla);
        stocks[1] = address(aapl);
        uint16[] memory weights = new uint16[](2);
        weights[0] = 5_000;
        weights[1] = 5_000;
        FortuneStockRewardsFactory.LaunchParams memory p;
        p.name = "Fork Basket";
        p.symbol = "FBSKT";
        p.stocks = stocks;
        p.weightsBps = weights;
        p.graduationUsd1e18 = 20_000e18;
        p.creatorFeeBps = 50;
        p.holderFeeBps = 100;
        p.poolFee = POOL_FEE;
        vm.prank(creator);
        (address tokenAddress, address curveAddress) = factory.createLaunch(p);
        FortuneStockRewardsToken token = FortuneStockRewardsToken(tokenAddress);
        FortuneCurve curve = FortuneCurve(curveAddress);
        skip(16);

        // Curve phase: Bob fills TSLA's half of the target, Alice AAPL's.
        buy(bob, curve, tsla, 50e18);
        buy(alice, curve, aapl, 50e6);
        assertTrue(curve.graduationReady(), "target reached");
        assertGt(tsla.balanceOf(address(token)), 0);
        assertGt(aapl.balanceOf(address(token)), 0);

        uint24[] memory fees = new uint24[](2);
        fees[0] = POOL_FEE;
        fees[1] = POOL_FEE;
        bytes memory data = abi.encode(
            FortunePancakeV3GraduationAdapter.GraduationPlan({
                fees: fees,
                maxSqrtPriceDeviationBps: 100,
                maxDustBps: 100,
                deadline: uint64(block.timestamp + 10 minutes)
            })
        );
        assertTrue(factory.graduate(address(curve), data), "graduated");
        uint256[] memory ids = factory.positionIds(address(token));
        assertEq(ids.length, 2);
        address tslaPool = IPancakeV3FactoryView(PANCAKE_V3_FACTORY).getPool(address(token), address(tsla), POOL_FEE);
        address aaplPool = IPancakeV3FactoryView(PANCAKE_V3_FACTORY).getPool(address(token), address(aapl), POOL_FEE);
        assertTrue(token.isExcluded(tslaPool) && token.isExcluded(aaplPool));
        assertTrue(token.isPancakePool(tslaPool) && token.isPancakePool(aaplPool));
        assertEq(token.eligibleSupply(), token.balanceOf(alice) + token.balanceOf(bob));

        // Real swaps both ways through the TSLA pool earn 1% fees on each side.
        skip(STREAM_AND_A_BIT);
        vm.prank(alice);
        token.claim();
        vm.prank(bob);
        token.claim();
        uint256 aliceTslaBefore = tsla.balanceOf(alice);
        deal(address(tsla), address(this), 1e18);
        swap(tslaPool, address(tsla), 1e18);
        swap(tslaPool, address(token), token.balanceOf(address(this)) / 2);

        uint256 supplyBefore = token.totalSupply();
        uint256 tslaBefore = tsla.balanceOf(address(token));
        assertEq(factory.collectPoolFees(address(token)), 2);
        // The 1% tier's fee, less PancakeSwap V3's protocol share (32% on BSC).
        assertApproxEqAbs(tsla.balanceOf(address(token)) - tslaBefore, 0.0068e18, 0.0001e18, "68% of 1% of the swap");
        assertLt(token.totalSupply(), supplyBefore, "launch-token fees burned");
        assertEq(token.balanceOf(address(token)), 0);

        skip(STREAM_AND_A_BIT);
        vm.prank(alice);
        uint256[] memory paid = token.claim();
        assertGt(paid[0], 0, "Alice earns TSLA though she paid in AAPL");
        assertEq(tsla.balanceOf(alice) - aliceTslaBefore, paid[0]);
    }

    uint256 internal constant STREAM_AND_A_BIT = 6 hours + 1;

    /// Partial fills refund what a full share cannot take.
    function buy(address who, FortuneCurve curve, FortuneTestStock stock, uint256 amount) internal {
        deal(address(stock), who, amount);
        vm.startPrank(who);
        stock.approve(address(curve), amount);
        curve.buy(address(stock), amount, 0);
        vm.stopPrank();
    }

    function swap(address pool, address tokenIn, uint256 amountIn) internal {
        bool zeroForOne = IPancakeV3SwapPool(pool).token0() == tokenIn;
        IPancakeV3SwapPool(pool).swap(
            address(this),
            zeroForOne,
            int256(amountIn),
            zeroForOne ? MIN_SQRT_RATIO + 1 : MAX_SQRT_RATIO - 1,
            abi.encode(tokenIn)
        );
    }

    function pancakeV3SwapCallback(int256 amount0Delta, int256 amount1Delta, bytes calldata data) external {
        address tokenIn = abi.decode(data, (address));
        uint256 owed = uint256(amount0Delta > 0 ? amount0Delta : amount1Delta);
        IERC20(tokenIn).transfer(msg.sender, owed);
    }
}
