// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {Test} from "forge-std/Test.sol";
import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {FortuneTestnetPositionCustody as C} from "../src/FortuneTestnetPositionCustody.sol";
import {StrategyAssetMock, StrategyFactoryMock, StrategyPoolMock} from "./FortuneTestnetStrategyVault.t.sol";

contract CustodyManagerMock is ERC721 {
    address public immutable factory;
    address public token0;
    address public token1;
    uint128 public liquidity = 100;
    uint256 public mode;
    bool public reentryRejected;

    constructor(address f, address a, address b, address owner) ERC721("Fixture", "FP") {
        factory = f;
        token0 = a;
        token1 = b;
        _mint(owner, 1);
    }

    function configure(uint256 m) external {
        mode = m;
    }

    function changeLiquidity(uint128 n) external {
        liquidity = n;
    }

    function positions(uint256)
        external
        view
        returns (uint96, address, address, address, uint24, int24, int24, uint128, uint256, uint256, uint128, uint128)
    {
        return (0, getApproved(1), token0, token1, 500, -10, 10, liquidity, 0, 0, 0, 0);
    }

    function transferFrom(address from, address to, uint256 id) public override {
        if (mode == 1) return;
        if (mode == 2) revert("fixture rejected");
        if (mode == 3) {
            (bool ok,) = msg.sender.call(abi.encodeCall(C.releaseToTreasury, ()));
            reentryRejected = !ok;
        }
        super.transferFrom(from, to, id);
        if (mode == 4) liquidity--;
    }
}

contract FortuneTestnetPositionCustodyTest is Test {
    address constant GOV = address(0x1111);
    address constant GUARD = address(0x2222);
    address constant TREASURY = address(0x3333);
    C custody;
    CustodyManagerMock manager;
    StrategyFactoryMock factory;
    StrategyPoolMock pool;
    C.Policy p;

    function pin(address a) internal view returns (C.Pin memory) {
        return C.Pin(a, a.codehash);
    }

    function setUp() public {
        vm.chainId(97);
        address a = address(new StrategyAssetMock());
        address b = address(new StrategyAssetMock());
        if (a > b) (a, b) = (b, a);
        factory = new StrategyFactoryMock();
        pool = new StrategyPoolMock(address(factory), a, b);
        factory.setPool(address(pool));
        manager = new CustodyManagerMock(address(factory), a, b, GOV);
        p = C.Policy(
            pin(address(manager)), pin(address(factory)), pin(address(pool)), pin(a), pin(b), 1, 500, -10, 10, 100
        );
        custody = new C(GOV, GUARD, TREASURY, p);
        vm.prank(GOV);
        manager.approve(address(custody), 1);
    }

    function deposit() internal {
        vm.startPrank(GOV);
        custody.setPaused(false);
        custody.deposit();
        vm.stopPrank();
    }

    function testActualCustodyFixedTreasuryAndOneTimeExit() public {
        assertTrue(custody.paused());
        deposit();
        assertEq(manager.ownerOf(1), address(custody));
        assertTrue(custody.held());
        assertEq(manager.getApproved(1), address(0));
        vm.prank(GUARD);
        custody.setPaused(true);
        vm.prank(GOV);
        custody.releaseToTreasury();
        assertEq(manager.ownerOf(1), TREASURY);
        assertFalse(custody.held());
        assertTrue(custody.released());
        vm.prank(GOV);
        vm.expectRevert(C.WrongState.selector);
        custody.releaseToTreasury();
        vm.prank(GOV);
        custody.setPaused(false);
        vm.prank(GOV);
        vm.expectRevert(C.WrongState.selector);
        custody.deposit();
    }

    function testRolesPauseAndChain() public {
        vm.expectRevert(C.Unauthorized.selector);
        custody.deposit();
        vm.prank(GOV);
        vm.expectRevert(C.WrongState.selector);
        custody.deposit();
        vm.prank(GUARD);
        vm.expectRevert(C.Unauthorized.selector);
        custody.setPaused(false);
        deposit();
        vm.prank(GOV);
        vm.expectRevert(C.WrongState.selector);
        custody.releaseToTreasury();
        vm.chainId(1);
        vm.prank(GOV);
        vm.expectRevert(C.WrongChain.selector);
        custody.setPaused(true);
        vm.prank(GOV);
        vm.expectRevert(C.WrongChain.selector);
        custody.deposit();
        vm.prank(GOV);
        vm.expectRevert(C.WrongChain.selector);
        custody.releaseToTreasury();
        vm.expectRevert(C.WrongChain.selector);
        new C(GOV, GUARD, TREASURY, p);
    }

    function testTransferFailuresRollBackStateAndOwnership() public {
        vm.prank(GOV);
        custody.setPaused(false);
        for (uint256 mode = 1; mode <= 4; mode++) {
            if (mode == 3) continue;
            manager.configure(mode);
            vm.prank(GOV);
            vm.expectRevert();
            custody.deposit();
            assertFalse(custody.held());
            assertEq(manager.ownerOf(1), GOV);
            assertEq(manager.liquidity(), 100);
        }
        manager.configure(0);
        vm.prank(GOV);
        custody.deposit();
        vm.prank(GOV);
        custody.setPaused(true);
        for (uint256 mode = 1; mode <= 4; mode++) {
            if (mode == 3) continue;
            manager.configure(mode);
            vm.prank(GOV);
            vm.expectRevert();
            custody.releaseToTreasury();
            assertTrue(custody.held());
            assertFalse(custody.released());
            assertEq(manager.ownerOf(1), address(custody));
        }
        manager.configure(0);
        vm.prank(GOV);
        custody.releaseToTreasury();
    }

    function testPinnedRouteCodeAndExactLiquidityFailClosed() public {
        deposit();
        vm.prank(GOV);
        custody.setPaused(true);
        manager.changeLiquidity(99);
        vm.prank(GOV);
        vm.expectRevert(C.UntrustedPosition.selector);
        custody.releaseToTreasury();
        manager.changeLiquidity(100);
        factory.setPool(address(0));
        vm.prank(GOV);
        vm.expectRevert(C.UntrustedPosition.selector);
        custody.releaseToTreasury();
        factory.setPool(address(pool));
        vm.etch(address(pool), hex"60006000fd");
        vm.prank(GOV);
        vm.expectRevert(C.UntrustedPosition.selector);
        custody.releaseToTreasury();
        assertTrue(custody.held());
    }

    function testReentryAndNoApprovals() public {
        manager.configure(3);
        deposit();
        assertTrue(manager.reentryRejected());
        assertEq(manager.getApproved(1), address(0));
        vm.prank(GOV);
        custody.setPaused(true);
        vm.prank(GOV);
        custody.releaseToTreasury();
        assertTrue(manager.reentryRejected());
    }

    function testFuzzWrongExpectedLiquidityRejects(uint128 wrong) public {
        vm.assume(wrong != 100);
        p.expectedLiquidity = wrong;
        vm.expectRevert();
        new C(GOV, GUARD, TREASURY, p);
    }

    function testBadConfiguration() public {
        vm.expectRevert(C.InvalidPolicy.selector);
        new C(GOV, GOV, TREASURY, p);
        p.token1 = p.token0;
        vm.expectRevert(C.InvalidPolicy.selector);
        new C(GOV, GUARD, TREASURY, p);
    }
}
