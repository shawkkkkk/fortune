// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console2} from "forge-std/Test.sol";
import {FortuneTestnetStrategyVault as Vault} from "../src/FortuneTestnetStrategyVault.sol";
import {StrategyAssetMock} from "./FortuneTestnetStrategyVault.t.sol";

interface IStrategyPositionManager {
    struct MintParams {
        address token0;
        address token1;
        uint24 fee;
        int24 tickLower;
        int24 tickUpper;
        uint256 amount0Desired;
        uint256 amount1Desired;
        uint256 amount0Min;
        uint256 amount1Min;
        address recipient;
        uint256 deadline;
    }
    function createAndInitializePoolIfNecessary(address token0, address token1, uint24 fee, uint160 sqrtPriceX96)
        external
        payable
        returns (address pool);
    function mint(MintParams calldata params)
        external
        payable
        returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1);
}

/// @dev Local fork transactions and synthetic assets only; no broadcasts or deployed Fortune vault.
contract FortuneTestnetStrategyVaultForkTest is Test {
    address constant FACTORY = 0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865;
    address constant ROUTER = 0x1b81D678ffb9C0263b24A97847620C99d213eB14;
    address constant POSITIONS = 0x427bF5b37357632377eCbEC9de3626C71A5396c1;
    address constant AGENT = address(0xA6E);
    address constant GUARDIAN = address(0x600D);
    address constant TREASURY = address(0x700D);
    Vault vault;
    StrategyAssetMock a;
    StrategyAssetMock b;

    function setUp() public {
        string memory rpc = vm.envOr("FORTUNE_STRATEGY_FORK_RPC_URL", string(""));
        if (bytes(rpc).length == 0) {
            vm.skip(true);
            return;
        }
        uint256 selectedBlock = vm.envOr("FORTUNE_STRATEGY_FORK_BLOCK", uint256(0));
        if (selectedBlock == 0) vm.createSelectFork(rpc);
        else vm.createSelectFork(rpc, selectedBlock);
        assertEq(block.chainid, 97, "strategy venue fork must be BSC Testnet");
        console2.log("Read-only BSC Testnet fork block", block.number);
        require(FACTORY.code.length != 0 && ROUTER.code.length != 0 && POSITIONS.code.length != 0, "venue unavailable");
        a = new StrategyAssetMock();
        b = new StrategyAssetMock();
        a.mint(address(this), 30000 ether);
        b.mint(address(this), 30000 ether);
        (address t0, address t1) = address(a) < address(b) ? (address(a), address(b)) : (address(b), address(a));
        address pool =
            IStrategyPositionManager(POSITIONS).createAndInitializePoolIfNecessary(t0, t1, 500, uint160(1 << 96));
        a.approve(POSITIONS, 10000 ether);
        b.approve(POSITIONS, 10000 ether);
        IStrategyPositionManager(POSITIONS)
            .mint(
                IStrategyPositionManager.MintParams({
                token0: t0,
                token1: t1,
                fee: 500,
                tickLower: -887270,
                tickUpper: 887270,
                amount0Desired: 10000 ether,
                amount1Desired: 10000 ether,
                amount0Min: 9900 ether,
                amount1Min: 9900 ether,
                recipient: address(this),
                deadline: block.timestamp + 120
            })
            );
        Vault.Infrastructure memory infra =
            Vault.Infrastructure(ROUTER, FACTORY, pool, ROUTER.codehash, FACTORY.codehash, pool.codehash, 500);
        vault = new Vault(
            address(this),
            GUARDIAN,
            TREASURY,
            infra,
            Vault.AssetConfig(address(a), address(a).codehash, 100 ether, 1000 ether, 100 ether),
            Vault.AssetConfig(address(b), address(b).codehash, 100 ether, 1000 ether, 100 ether)
        );
        a.transfer(address(vault), 1000 ether);
        b.transfer(address(vault), 1000 ether);
        vault.setOperator(AGENT);
        uint128 floor = uint128((uint256(1) << 96) * 99 / 100);
        vault.setPricingFloor(floor, floor, block.timestamp + 1 hours);
        vault.unpause();
    }

    function _order(address token, uint256 amount) internal view returns (Vault.Order memory) {
        return Vault.Order(token, amount, 0, block.timestamp + 60, vault.authorizationEpoch(), vault.nextNonce());
    }

    function test_RealPancakeRouterBothDirectionsAndEmergencyRecovery() public {
        Vault.Order memory first = _order(address(a), 10 ether);
        uint256 beforeA = a.balanceOf(address(vault));
        uint256 beforeB = b.balanceOf(address(vault));
        vm.prank(AGENT);
        uint256 out = vault.executeSwap(first);
        assertEq(beforeA - a.balanceOf(address(vault)), 10 ether);
        assertEq(b.balanceOf(address(vault)) - beforeB, out);
        assertGe(out, 9.9 ether);
        assertEq(a.allowance(address(vault), ROUTER), 0);
        Vault.Order memory second = _order(address(b), 5 ether);
        vm.prank(AGENT);
        uint256 back = vault.executeSwap(second);
        assertGe(back, 4.95 ether);
        assertEq(a.allowance(address(vault), ROUTER), 0);
        assertEq(b.allowance(address(vault), ROUTER), 0);
        assertEq(vault.nextNonce(), 2);
        vm.prank(GUARDIAN);
        vault.revokeOperator();
        Vault.Order memory afterRevoke = _order(address(a), 1 ether);
        vm.prank(AGENT);
        vm.expectRevert(Vault.Unauthorized.selector);
        vault.executeSwap(afterRevoke);
        vault.withdrawToTreasury(address(a), 100 ether);
        assertEq(a.balanceOf(TREASURY), 100 ether);
    }

    function test_RealPancakeUnfillableMinimumRollsBack() public {
        Vault.Order memory order = _order(address(a), 10 ether);
        order.minAmountOut = 100 ether;
        uint256 beforeA = a.balanceOf(address(vault));
        uint256 beforeB = b.balanceOf(address(vault));
        vm.prank(AGENT);
        vm.expectRevert();
        vault.executeSwap(order);
        assertEq(a.balanceOf(address(vault)), beforeA);
        assertEq(b.balanceOf(address(vault)), beforeB);
        assertEq(vault.nextNonce(), 0);
        assertEq(a.allowance(address(vault), ROUTER), 0);
        (, uint256 spent,,) = vault.spendWindow(address(a));
        assertEq(spent, 0);
    }
}
