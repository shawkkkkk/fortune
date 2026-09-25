// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {FortuneRewardTokenV2} from "../src/FortuneRewardTokenV2.sol";

contract ResearchPair is ERC20 {
    constructor() ERC20("Pair Asset", "PAIR") {}
    function mint(address to, uint256 amount) external { _mint(to, amount); }
}

contract FortuneRewardTokenV2Test is Test {
    ResearchPair pair;
    FortuneRewardTokenV2 token;
    address alice = address(0xA11CE);
    address bob = address(0xB0B);
    address pool = address(0x1001);
    address hook = address(0x1002);
    address locker = address(0x1003);

    function setUp() public {
        pair = new ResearchPair();
        address[] memory exclusions = new address[](3);
        exclusions[0] = pool; exclusions[1] = hook; exclusions[2] = locker;
        token = new FortuneRewardTokenV2("Fortune Research", "TEST", address(pair), alice, 1_000 ether, exclusions);
        pair.mint(address(this), 10_000 ether);
        pair.approve(address(token), type(uint256).max);
    }

    function testTransferPreservesPastRewardsAndNewBuyerStartsAtZero() public {
        token.fundRewards(100 ether);
        vm.prank(alice); token.transfer(bob, 500 ether);
        assertApproxEqAbs(token.claimableRewardOf(alice), 100 ether, 1);
        assertEq(token.claimableRewardOf(bob), 0);
        token.fundRewards(100 ether);
        assertApproxEqAbs(token.claimableRewardOf(alice), 150 ether, 1);
        assertApproxEqAbs(token.claimableRewardOf(bob), 50 ether, 1);
        vm.prank(alice); token.claim();
        vm.prank(bob); token.claim();
        assertLe(token.totalFunded() - token.totalClaimed(), 2);
        assertEq(pair.balanceOf(address(token)) + token.totalClaimed(), token.totalFunded());
    }

    function testExcludedPoolNeverEarnsAndOutgoingHolderKeepsHistory() public {
        vm.prank(alice); token.transfer(pool, 400 ether);
        assertEq(token.eligibleSupply(), 600 ether);
        token.fundRewards(60 ether);
        assertEq(token.accumulativeRewardOf(pool), 0);
        assertEq(token.claimableRewardOf(pool), 0);
        vm.prank(pool); assertEq(token.claim(), 0);
        vm.prank(pool); token.transfer(bob, 400 ether);
        assertEq(token.claimableRewardOf(bob), 0);
        token.fundRewards(100 ether);
        assertApproxEqAbs(token.claimableRewardOf(alice), 120 ether, 1);
        assertApproxEqAbs(token.claimableRewardOf(bob), 40 ether, 1);
        assertEq(token.claimableRewardOf(pool), 0);
    }

    function testBurnRetainsEarnedRewardsAndCannotSendFeeTokensElsewhere() public {
        token.fundRewards(100 ether);
        vm.prank(alice); token.burn(400 ether);
        assertEq(token.totalBurned(), 400 ether);
        assertEq(token.totalSupply(), 600 ether);
        assertApproxEqAbs(token.claimableRewardOf(alice), 100 ether, 1);
        token.fundRewards(60 ether);
        vm.prank(alice); token.claim();
        assertApproxEqAbs(pair.balanceOf(alice), 160 ether, 1);
    }

    function testFuzzClaimSolvencyAcrossTransferAndBurn(uint96 first, uint96 second, uint96 transferAmount, uint96 burnAmount) public {
        uint256 a = bound(uint256(first), 1, 1_000 ether);
        uint256 b = bound(uint256(second), 1, 1_000 ether);
        uint256 moved = bound(uint256(transferAmount), 1, 500 ether);
        uint256 burned = bound(uint256(burnAmount), 0, 500 ether);
        token.fundRewards(a);
        vm.prank(alice); token.transfer(bob, moved);
        vm.prank(alice); token.burn(burned);
        token.fundRewards(b);
        uint256 available = pair.balanceOf(address(token));
        assertLe(token.claimableRewardOf(alice) + token.claimableRewardOf(bob), available);
        vm.prank(alice); token.claim();
        vm.prank(bob); token.claim();
        assertLe(token.totalClaimed(), token.totalFunded());
        assertEq(pair.balanceOf(address(token)) + token.totalClaimed(), token.totalFunded());
    }
}
