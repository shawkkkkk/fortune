// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {FortuneCurve} from "fortune/FortuneCurve.sol";
import {FortuneStockRewardsFactory} from "../src/FortuneStockRewardsFactory.sol";
import {FortuneStockRewardsToken} from "../src/FortuneStockRewardsToken.sol";
import {FortuneTestStock} from "../src/testnet/FortuneTestStock.sol";
import {StockRewardsBase} from "./StockRewardsBase.sol";

/// Drives a live three-stock launch with random buys, sells, transfers,
/// burns, claims, donations and waits.
contract StockRewardsHandler is Test {
    FortuneStockRewardsToken public immutable token;
    FortuneCurve public immutable curve;
    address[] public stocks;
    address[] public actors;
    mapping(address => uint256) public paidOut;
    mapping(address => uint256) public stockDecimals;

    constructor(FortuneStockRewardsToken token_, FortuneCurve curve_, address[] memory stocks_, address[] memory actors_) {
        token = token_;
        curve = curve_;
        stocks = stocks_;
        actors = actors_;
        for (uint256 i; i < stocks_.length; ++i) {
            stockDecimals[stocks_[i]] = FortuneTestStock(stocks_[i]).decimals();
        }
    }

    function actorCount() external view returns (uint256) {
        return actors.length;
    }

    function stockCount() external view returns (uint256) {
        return stocks.length;
    }

    function buy(uint256 actorSeed, uint256 stockSeed, uint256 shares) external {
        if (curve.graduationReady()) return;
        address actor = actors[actorSeed % actors.length];
        address stock = stocks[stockSeed % stocks.length];
        uint256 amount = bound(shares, 1, 20) * 10 ** stockDecimals[stock] / 4;
        deal(stock, actor, IERC20(stock).balanceOf(actor) + amount);
        vm.startPrank(actor);
        IERC20(stock).approve(address(curve), amount);
        try curve.buy(stock, amount, 0) {} catch {}
        vm.stopPrank();
    }

    function sell(uint256 actorSeed, uint256 stockSeed, uint256 percent) external {
        if (curve.graduationReady()) return;
        address actor = actors[actorSeed % actors.length];
        address stock = stocks[stockSeed % stocks.length];
        uint256 amount = token.balanceOf(actor) * bound(percent, 1, 100) / 100;
        if (amount == 0) return;
        vm.startPrank(actor);
        token.approve(address(curve), amount);
        try curve.sell(stock, amount, 0) {} catch {}
        vm.stopPrank();
    }

    function transfer(uint256 fromSeed, uint256 toSeed, uint256 percent) external {
        address from = actors[fromSeed % actors.length];
        address to = actors[toSeed % actors.length];
        uint256 amount = token.balanceOf(from) * bound(percent, 0, 100) / 100;
        vm.prank(from);
        token.transfer(to, amount);
    }

    function burn(uint256 actorSeed, uint256 percent, bool viaTransfer) external {
        address actor = actors[actorSeed % actors.length];
        uint256 amount = token.balanceOf(actor) * bound(percent, 0, 50) / 100;
        vm.prank(actor);
        if (viaTransfer) token.transfer(address(token), amount);
        else token.burn(amount);
    }

    function claim(uint256 actorSeed) external {
        address actor = actors[actorSeed % actors.length];
        vm.prank(actor);
        uint256[] memory paid = token.claim();
        for (uint256 i; i < paid.length; ++i) {
            paidOut[stocks[i]] += paid[i];
        }
    }

    function donate(uint256 stockSeed, uint256 shares) external {
        address stock = stocks[stockSeed % stocks.length];
        uint256 amount = bound(shares, 0, 50) * 10 ** stockDecimals[stock] / 10;
        deal(stock, address(token), IERC20(stock).balanceOf(address(token)) + amount);
    }

    function sync() external {
        token.sync();
    }

    function wait(uint256 seconds_) external {
        skip(bound(seconds_, 0, 2 hours));
    }
}

contract FortuneStockRewardsInvariantTest is StockRewardsBase {
    StockRewardsHandler internal handler;
    FortuneStockRewardsToken internal token;
    FortuneCurve internal curve;

    function setUp() public override {
        super.setUp();
        address[] memory stocks = stocks3(tsla, aapl, amzn);
        FortuneStockRewardsFactory.LaunchParams memory p = params(stocks);
        // A high target keeps the curve trading for the whole run.
        p.graduationUsd1e18 = 1_000_000e18;
        (token, curve) = launch(p);
        skip(SHIELD_SECONDS);
        address[] memory actors = new address[](4);
        actors[0] = alice;
        actors[1] = bob;
        actors[2] = carol;
        actors[3] = makeAddr("dave");
        handler = new StockRewardsHandler(token, curve, stocks, actors);
        targetContract(address(handler));
    }

    /// Only actors hold circulating tokens, and all of it earns.
    function invariant_eligibleSupplyIsWhatHoldersHold() public view {
        uint256 held;
        for (uint256 i; i < handler.actorCount(); ++i) {
            held += token.balanceOf(handler.actors(i));
        }
        assertEq(token.eligibleSupply(), held);
        assertEq(token.balanceOf(address(token)), 0);
        assertEq(token.totalSupply(), held + token.balanceOf(address(curve)));
    }

    /// Every stock the token holds is either streaming or owed to holders,
    /// everything it ever received is accounted for, and holders can never
    /// claim more than is owed.
    function invariant_rewardBooksBalance() public view {
        for (uint256 s; s < handler.stockCount(); ++s) {
            address stock = handler.stocks(s);
            FortuneStockRewardsToken.RewardState memory state = token.previewRewardState(stock);
            assertEq(IERC20(stock).balanceOf(address(token)), uint256(state.owed) + state.streaming, "solvent");
            assertEq(state.totalReceived, handler.paidOut(stock) + state.owed + state.streaming, "conserved");
            uint256 claimableTotal;
            for (uint256 i; i < handler.actorCount(); ++i) {
                claimableTotal += token.claimableOf(stock, handler.actors(i));
            }
            assertLe(claimableTotal, state.owed, "claimable <= owed");
        }
    }

    /// The curve's own accounting is untouched by the rewards token.
    function invariant_curveHoldsItsReserves() public view {
        for (uint256 s; s < handler.stockCount(); ++s) {
            address stock = handler.stocks(s);
            assertGe(IERC20(stock).balanceOf(address(curve)), curve.reserve(stock));
        }
    }
}
