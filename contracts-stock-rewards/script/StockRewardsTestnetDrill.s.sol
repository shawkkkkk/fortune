// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {FortuneCurve} from "fortune/FortuneCurve.sol";
import {FortunePancakeV3GraduationAdapter} from "fortune/FortunePancakeV3GraduationAdapter.sol";
import {IPancakeV3FactoryLike} from "fortune/interfaces/IPancakeV3FactoryLike.sol";
import {FortuneStockRewardsFactory} from "../src/FortuneStockRewardsFactory.sol";
import {FortuneStockRewardsToken} from "../src/FortuneStockRewardsToken.sol";
import {FortuneTestStock} from "../src/testnet/FortuneTestStock.sol";

interface IPancakeV3SwapRouter {
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 deadline;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }

    function exactInputSingle(ExactInputSingleParams calldata params) external payable returns (uint256 amountOut);
}

/// @notice Real BSC Testnet lifecycle of a Stock Rewards launch paired with a
///         large-cap and a penny test stock. Run `launch()`, wait out the
///         Launch Shield, then `complete()`: fill both shares, graduate into
///         two locked PancakeSwap V3 pools, swap through one and collect its
///         fees for holders. A minute or more later, `claim()` collects the
///         wallet's streamed rewards in both stocks.
contract StockRewardsTestnetDrill is Script {
    uint24 internal constant POOL_FEE = 10_000;

    function launch() external {
        require(block.chainid == 97, "BSC_TESTNET_ONLY");
        uint256 key = vm.envUint("PRIVATE_KEY");
        FortuneStockRewardsFactory factory = FortuneStockRewardsFactory(vm.envAddress("STOCK_REWARDS_FACTORY"));
        address[] memory stocks = new address[](2);
        stocks[0] = vm.envAddress("STOCK_REWARDS_DRILL_LARGE_CAP");
        stocks[1] = vm.envAddress("STOCK_REWARDS_DRILL_PENNY");
        uint16[] memory weights = new uint16[](2);
        weights[0] = 6_000;
        weights[1] = 4_000;

        FortuneStockRewardsFactory.LaunchParams memory p;
        p.name = "Fortune Stock Rewards Drill";
        p.symbol = "SRDRILL";
        p.stocks = stocks;
        p.weightsBps = weights;
        p.graduationUsd1e18 = 100e18;
        p.creatorFeeBps = 50;
        p.holderFeeBps = 100;
        p.poolFee = POOL_FEE;
        p.description = "Automated Stock Rewards beta drill on BSC Testnet.";

        vm.startBroadcast(key);
        (address token, address curve) = factory.createLaunch(p);
        // Faucet shares for the fills and the post-graduation swap.
        FortuneTestStock(stocks[0]).faucet();
        FortuneTestStock(stocks[1]).faucet();
        vm.stopBroadcast();

        console2.log("STOCK_REWARDS_DRILL_TOKEN=%s", token);
        console2.log("STOCK_REWARDS_DRILL_CURVE=%s", curve);
    }

    function complete() external {
        require(block.chainid == 97, "BSC_TESTNET_ONLY");
        uint256 key = vm.envUint("PRIVATE_KEY");
        address wallet = vm.addr(key);
        FortuneStockRewardsFactory factory = FortuneStockRewardsFactory(vm.envAddress("STOCK_REWARDS_FACTORY"));
        FortuneCurve curve = FortuneCurve(vm.envAddress("STOCK_REWARDS_DRILL_CURVE"));
        FortuneStockRewardsToken token = FortuneStockRewardsToken(address(curve.launchToken()));
        IPancakeV3SwapRouter router = IPancakeV3SwapRouter(vm.envAddress("PANCAKE_V3_SWAP_ROUTER"));
        address largeCap = curve.quoteAssets(0);
        address penny = curve.quoteAssets(1);
        require(curve.launchElapsedSeconds() >= curve.EARLY_WALLET_CAP_SECONDS(), "WAIT_FOR_LAUNCH_SHIELD");

        vm.startBroadcast(key);
        // Each buy fills that stock's share and refunds the rest.
        IERC20(largeCap).approve(address(curve), type(uint256).max);
        IERC20(penny).approve(address(curve), type(uint256).max);
        uint256 bought = curve.buy(largeCap, 1e18, 1);
        token.approve(address(curve), bought / 4);
        curve.sell(largeCap, bought / 4, 1);
        curve.buy(largeCap, 10e18, 1);
        curve.buy(penny, 200e18, 1);
        require(curve.graduationReady(), "NOT_READY");

        uint24[] memory fees = new uint24[](2);
        fees[0] = POOL_FEE;
        fees[1] = POOL_FEE;
        bytes memory plan = abi.encode(
            FortunePancakeV3GraduationAdapter.GraduationPlan({
                fees: fees,
                maxSqrtPriceDeviationBps: 100,
                maxDustBps: 100,
                deadline: uint64(block.timestamp + 20 minutes)
            })
        );
        require(factory.graduate(address(curve), plan), "GRADUATION_FAILED");

        // A buy and a sell through the large-cap pool earn fees on both sides.
        IERC20(largeCap).approve(address(router), type(uint256).max);
        uint256 tokensOut = router.exactInputSingle(
            IPancakeV3SwapRouter.ExactInputSingleParams({
                tokenIn: largeCap,
                tokenOut: address(token),
                fee: POOL_FEE,
                recipient: wallet,
                deadline: block.timestamp + 20 minutes,
                amountIn: 0.1e18,
                amountOutMinimum: 1,
                sqrtPriceLimitX96: 0
            })
        );
        token.approve(address(router), tokensOut / 2);
        router.exactInputSingle(
            IPancakeV3SwapRouter.ExactInputSingleParams({
                tokenIn: address(token),
                tokenOut: largeCap,
                fee: POOL_FEE,
                recipient: wallet,
                deadline: block.timestamp + 20 minutes,
                amountIn: tokensOut / 2,
                amountOutMinimum: 1,
                sqrtPriceLimitX96: 0
            })
        );
        uint256 supplyBefore = token.totalSupply();
        uint256 collected = factory.collectPoolFees(address(token));
        uint256[] memory paid = token.claim();
        vm.stopBroadcast();

        IPancakeV3FactoryLike v3 = IPancakeV3FactoryLike(factory.pancakeV3Factory());
        address largeCapPool = v3.getPool(address(token), largeCap, POOL_FEE);
        address pennyPool = v3.getPool(address(token), penny, POOL_FEE);
        require(curve.graduated(), "NOT_GRADUATED");
        require(factory.positionIds(address(token)).length == 2, "POSITIONS_NOT_LOCKED");
        require(token.isExcluded(largeCapPool) && token.isExcluded(pennyPool), "POOLS_EARN");
        require(collected == 2, "FEES_NOT_COLLECTED");
        require(token.totalSupply() < supplyBefore, "TOKEN_FEES_NOT_BURNED");
        require(token.rewardState(largeCap).totalReceived > 0, "NO_LARGE_CAP_REWARDS");
        require(token.rewardState(penny).totalReceived > 0, "NO_PENNY_REWARDS");

        console2.log("STOCK_REWARDS_DRILL_LARGE_CAP_POOL=%s", largeCapPool);
        console2.log("STOCK_REWARDS_DRILL_PENNY_POOL=%s", pennyPool);
        console2.log("STOCK_REWARDS_DRILL_CLAIMED_LARGE_CAP=%s", paid[0]);
        console2.log("STOCK_REWARDS_DRILL_CLAIMED_PENNY=%s", paid[1]);
        console2.log("STOCK_REWARDS_ONCHAIN_EXECUTION_COMPLETE_AND_SUCCESSFUL");
    }

    function claim() external {
        require(block.chainid == 97, "BSC_TESTNET_ONLY");
        uint256 key = vm.envUint("PRIVATE_KEY");
        FortuneCurve curve = FortuneCurve(vm.envAddress("STOCK_REWARDS_DRILL_CURVE"));
        FortuneStockRewardsToken token = FortuneStockRewardsToken(address(curve.launchToken()));
        (, uint256[] memory shown) = token.claimable(vm.addr(key));
        vm.startBroadcast(key);
        uint256[] memory paid = token.claim();
        vm.stopBroadcast();
        require(paid[0] > 0 && paid[1] > 0, "NOTHING_STREAMED");
        require(paid[0] >= shown[0] && paid[1] >= shown[1], "PAID_LESS_THAN_SHOWN");
        console2.log("STOCK_REWARDS_DRILL_PAID_LARGE_CAP=%s", paid[0]);
        console2.log("STOCK_REWARDS_DRILL_PAID_PENNY=%s", paid[1]);
        console2.log("STOCK_REWARDS_CLAIM_COMPLETE_AND_SUCCESSFUL");
    }
}
