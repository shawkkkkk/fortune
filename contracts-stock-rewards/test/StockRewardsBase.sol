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
import {MockV3Factory, MockV3PositionManager, MockV2Factory} from "./mocks/MockPancake.sol";

abstract contract StockRewardsBase is Test {
    uint256 internal constant SHIELD_SECONDS = 16;
    uint256 internal constant STREAM = 6 hours;
    uint256 internal constant TARGET = 50_000e18;

    FortuneAssetRegistry internal registry;
    MockUsdOracle internal oracle;
    MockV3Factory internal v3;
    MockV2Factory internal v2;
    MockV3PositionManager internal npm;
    FortuneStockRewardsFactory internal factory;
    FortunePermanentLiquidityLocker internal locker;
    FortunePancakeV3GraduationAdapter internal adapter;

    FortuneTestStock internal tsla;
    FortuneTestStock internal nvda;
    FortuneTestStock internal aapl;
    FortuneTestStock internal amzn;
    FortuneTestStock internal msft;

    address internal owner = makeAddr("owner");
    address internal treasury = makeAddr("treasury");
    address internal creator = makeAddr("creator");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal carol = makeAddr("carol");

    function setUp() public virtual {
        vm.warp(1_800_000_000);
        registry = new FortuneAssetRegistry(owner);
        oracle = new MockUsdOracle(owner);
        tsla = listStock("Tesla (test)", "tTSLA", 18, 250e18);
        nvda = listStock("NVIDIA (test)", "tNVDA", 18, 120e18);
        aapl = listStock("Apple (test)", "tAAPL", 6, 230e18);
        amzn = listStock("Amazon (test)", "tAMZN", 8, 190e18);
        msft = listStock("Microsoft (test)", "tMSFT", 18, 420e18);

        v3 = new MockV3Factory();
        v2 = new MockV2Factory();
        npm = new MockV3PositionManager(v3);
        factory = new FortuneStockRewardsFactory(
            owner,
            address(registry),
            address(new FortuneCurveDeployer()),
            address(new FortuneFeeRouterDeployer()),
            address(new FortuneStockRewardsTokenDeployer()),
            address(v3),
            address(v2),
            treasury
        );
        locker = new FortunePermanentLiquidityLocker(address(factory), address(npm));
        adapter = new FortunePancakeV3GraduationAdapter(
            address(factory), address(registry), address(v3), address(npm), address(locker)
        );
        vm.prank(owner);
        factory.initialize(address(adapter), address(locker));
    }

    function listStock(string memory name, string memory symbol, uint8 decimals, uint256 priceUsd)
        internal
        returns (FortuneTestStock stock)
    {
        stock = new FortuneTestStock(name, symbol, decimals, 100);
        vm.startPrank(owner);
        oracle.setPrice(address(stock), priceUsd);
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
        vm.stopPrank();
    }

    function stocks2(FortuneTestStock a, FortuneTestStock b) internal pure returns (address[] memory list) {
        list = new address[](2);
        list[0] = address(a);
        list[1] = address(b);
    }

    function stocks3(FortuneTestStock a, FortuneTestStock b, FortuneTestStock c)
        internal
        pure
        returns (address[] memory list)
    {
        list = new address[](3);
        list[0] = address(a);
        list[1] = address(b);
        list[2] = address(c);
    }

    function equalWeights(uint256 count) internal pure returns (uint16[] memory weights) {
        weights = new uint16[](count);
        uint256 assigned;
        for (uint256 i; i < count; ++i) {
            weights[i] = i == count - 1 ? uint16(10_000 - assigned) : uint16(10_000 / count);
            assigned += weights[i];
        }
    }

    function params(address[] memory stocks) internal pure returns (FortuneStockRewardsFactory.LaunchParams memory p) {
        p.name = "Magnificent Basket";
        p.symbol = "MAGB";
        p.stocks = stocks;
        p.weightsBps = equalWeights(stocks.length);
        p.graduationUsd1e18 = TARGET;
        p.creatorFeeBps = 50;
        p.holderFeeBps = 75;
        p.poolFee = 10_000;
        p.description = "Holders earn every stock in the basket.";
        p.imageURI = "https://example.com/magb.png";
    }

    function launch(FortuneStockRewardsFactory.LaunchParams memory p)
        internal
        returns (FortuneStockRewardsToken token, FortuneCurve curve)
    {
        vm.prank(creator);
        (address tokenAddress, address curveAddress) = factory.createLaunch(p);
        token = FortuneStockRewardsToken(tokenAddress);
        curve = FortuneCurve(curveAddress);
    }

    /// Launch, then move past the Launch Shield so buys are untaxed and uncapped.
    function launchOpen(address[] memory stocks) internal returns (FortuneStockRewardsToken token, FortuneCurve curve) {
        (token, curve) = launch(params(stocks));
        skip(SHIELD_SECONDS);
    }

    function amountForUsd(FortuneTestStock stock, uint256 usd1e18) internal view returns (uint256) {
        (uint256 price,) = oracle.priceUsd(address(stock));
        return usd1e18 * 10 ** stock.decimals() / price;
    }

    function buy(address who, FortuneCurve curve, FortuneTestStock stock, uint256 amountIn)
        internal
        returns (uint256 tokensOut)
    {
        deal(address(stock), who, IERC20(address(stock)).balanceOf(who) + amountIn);
        vm.startPrank(who);
        stock.approve(address(curve), amountIn);
        tokensOut = curve.buy(address(stock), amountIn, 0);
        vm.stopPrank();
    }

    function buyUsd(address who, FortuneCurve curve, FortuneTestStock stock, uint256 usd1e18)
        internal
        returns (uint256 tokensOut)
    {
        return buy(who, curve, stock, amountForUsd(stock, usd1e18));
    }

    function sell(address who, FortuneCurve curve, FortuneTestStock stock, uint256 tokenAmount)
        internal
        returns (uint256 quoteOut)
    {
        vm.startPrank(who);
        IERC20(address(curve.launchToken())).approve(address(curve), tokenAmount);
        quoteOut = curve.sell(address(stock), tokenAmount, 0);
        vm.stopPrank();
    }

    /// Fills each stock's share of the target in turn until the curve is
    /// ready to graduate. A buy into a full share reverts and is skipped.
    function fillToGraduation(FortuneCurve curve, address[] memory stocks, address buyer) internal {
        uint256 round;
        while (!curve.graduationReady()) {
            FortuneTestStock stock = FortuneTestStock(stocks[round % stocks.length]);
            uint256 amount = amountForUsd(stock, TARGET);
            deal(address(stock), buyer, IERC20(address(stock)).balanceOf(buyer) + amount);
            vm.startPrank(buyer);
            stock.approve(address(curve), amount);
            try curve.buy(address(stock), amount, 0) {} catch {}
            vm.stopPrank();
            ++round;
            require(round < 4 * stocks.length, "NEVER_GRADUATED");
        }
    }

    function plan(uint256 count, uint24 fee) internal view returns (bytes memory) {
        uint24[] memory fees = new uint24[](count);
        for (uint256 i; i < count; ++i) {
            fees[i] = fee;
        }
        return abi.encode(
            FortunePancakeV3GraduationAdapter.GraduationPlan({
                fees: fees,
                maxSqrtPriceDeviationBps: 100,
                maxDustBps: 100,
                deadline: uint64(block.timestamp + 10 minutes)
            })
        );
    }

    function graduate(FortuneCurve curve) internal returns (bool) {
        return factory.graduate(address(curve), plan(curve.quoteAssetCount(), 10_000));
    }
}
