// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {FortuneTestnetBurnVault as V} from "../src/FortuneTestnetBurnVault.sol";

contract BurnAssetMock is ERC20 {
    uint256 public deploymentChainId = 97;
    bytes32 public launchManifestHash = bytes32(uint256(1));
    bool public bridgeEnabled;
    uint256 public permanentlyBurned;
    uint256 public mode;
    constructor() ERC20("fixture", "FIX") {}

    function mint(address to, uint256 n) external {
        _mint(to, n);
    }

    function configure(uint256 chain, bytes32 manifest, bool bridge, uint256 m) external {
        deploymentChainId = chain;
        launchManifestHash = manifest;
        bridgeEnabled = bridge;
        mode = m;
    }

    function burn(uint256 n) external {
        if (mode == 1) return;
        if (mode != 3) _burn(msg.sender, n);
        if (mode != 2) permanentlyBurned += n;
    }
}

contract BurnVaultTest is Test {
    address constant GOV = address(1);
    address constant GUARD = address(2);
    address constant OTHER = address(3);
    BurnAssetMock asset;
    V vault;

    function setUp() public {
        vm.chainId(97);
        asset = new BurnAssetMock();
        vault = new V(GOV, GUARD, address(asset), address(asset).codehash, bytes32(uint256(1)), 100);
    }

    function open() internal {
        vm.prank(GOV);
        vault.setPaused(false);
    }

    function testPausedRolesAndPermissionlessExactBurn() public {
        asset.mint(address(vault), 150);
        vm.expectRevert(V.Paused.selector);
        vault.burn(100);
        vm.prank(GUARD);
        vm.expectRevert(V.Unauthorized.selector);
        vault.setPaused(false);
        vm.prank(OTHER);
        vm.expectRevert(V.Unauthorized.selector);
        vault.setPaused(true);
        open();
        vm.prank(OTHER);
        vault.burn(100);
        assertEq(vault.totalBurned(), 100);
        assertEq(vault.burnCount(), 1);
        assertEq(asset.totalSupply(), 50);
        assertEq(asset.balanceOf(address(vault)), 50);
        assertEq(asset.permanentlyBurned(), 100);
        vm.expectRevert(V.InvalidAmount.selector);
        vault.burn(100);
        vault.burn(50);
        assertEq(vault.totalBurned(), 150);
        assertEq(vault.burnCount(), 2);
        vm.prank(GUARD);
        vault.setPaused(true);
        vm.expectRevert(V.Paused.selector);
        vault.burn(1);
    }

    function testPolicyAndChainFailClosed() public {
        open();
        asset.mint(address(vault), 100);
        asset.configure(97, bytes32(uint256(1)), true, 0);
        vm.expectRevert(V.InvalidPolicy.selector);
        vault.burn(10);
        asset.configure(1, bytes32(uint256(1)), false, 0);
        vm.expectRevert(V.InvalidPolicy.selector);
        vault.burn(10);
        asset.configure(97, bytes32(uint256(2)), false, 0);
        vm.expectRevert(V.InvalidPolicy.selector);
        vault.burn(10);
        asset.configure(97, bytes32(uint256(1)), false, 0);
        vm.chainId(56);
        vm.expectRevert(V.WrongChain.selector);
        vault.burn(10);
        vm.expectRevert(V.WrongChain.selector);
        vault.setPaused(true);
        vm.expectRevert(V.WrongChain.selector);
        new V(GOV, GUARD, address(asset), address(asset).codehash, bytes32(uint256(1)), 100);
        vm.chainId(97);
        vm.etch(address(asset), hex"00");
        vm.expectRevert(V.InvalidPolicy.selector);
        vault.burn(10);
    }

    function testInexactBurnRollsBackInventoryCountersAndExplicitRetry() public {
        open();
        asset.mint(address(vault), 100);
        for (uint256 m = 1; m <= 3; ++m) {
            asset.configure(97, bytes32(uint256(1)), false, m);
            vm.expectRevert(V.InexactBurn.selector);
            vault.burn(100);
            assertEq(asset.balanceOf(address(vault)), 100);
            assertEq(asset.totalSupply(), 100);
            assertEq(asset.permanentlyBurned(), 0);
            assertEq(vault.burnCount(), 0);
            assertEq(vault.totalBurned(), 0);
        }
        asset.configure(97, bytes32(uint256(1)), false, 0);
        vault.burn(100);
        assertEq(asset.totalSupply(), 0);
        assertEq(vault.totalBurned(), 100);
    }

    function testBadConstructorPolicyRejects() public {
        vm.expectRevert(V.InvalidPolicy.selector);
        new V(GOV, GOV, address(asset), address(asset).codehash, bytes32(uint256(1)), 100);
        vm.expectRevert(V.InvalidPolicy.selector);
        new V(GOV, GUARD, address(asset), bytes32(uint256(1)), bytes32(uint256(1)), 100);
        vm.expectRevert(V.InvalidPolicy.selector);
        new V(GOV, GUARD, address(asset), address(asset).codehash, bytes32(0), 100);
        vm.expectRevert(V.InvalidPolicy.selector);
        new V(GOV, GUARD, address(asset), address(asset).codehash, bytes32(uint256(1)), 0);
    }

    function testFuzzBurnConservationAndCaps(uint128 raw) public {
        uint128 amount = uint128(bound(raw, 1, 100));
        asset.mint(address(vault), amount);
        open();
        vm.expectRevert(V.InvalidAmount.selector);
        vault.burn(0);
        vm.expectRevert(V.InvalidAmount.selector);
        vault.burn(101);
        vault.burn(amount);
        assertEq(asset.totalSupply(), 0);
        assertEq(asset.permanentlyBurned(), amount);
        assertEq(vault.totalBurned(), amount);
        assertEq(asset.balanceOf(address(vault)), 0);
    }
}

contract BurnHandler is Test {
    BurnAssetMock public asset;
    V public vault;
    uint256 public donated;

    constructor(BurnAssetMock a, V v) {
        asset = a;
        vault = v;
    }

    function donate(uint96 raw) external {
        uint256 n = bound(raw, 1, 1000);
        asset.mint(address(vault), n);
        donated += n;
    }

    function destroy(uint128 raw) external {
        uint256 balance = asset.balanceOf(address(vault));
        if (balance == 0) return;
        vault.burn(uint128(bound(raw, 1, balance < 100 ? balance : 100)));
    }
}

contract BurnVaultInvariantTest is Test {
    BurnAssetMock asset;
    V vault;
    BurnHandler handler;

    function setUp() public {
        vm.chainId(97);
        asset = new BurnAssetMock();
        vault = new V(address(this), address(2), address(asset), address(asset).codehash, bytes32(uint256(1)), 100);
        vault.setPaused(false);
        handler = new BurnHandler(asset, vault);
        bytes4[] memory selectors = new bytes4[](2);
        selectors[0] = handler.donate.selector;
        selectors[1] = handler.destroy.selector;
        targetSelector(FuzzSelector(address(handler), selectors));
        targetContract(address(handler));
    }

    function invariantInventoryOnlyBecomesPermanentBurn() public view {
        assertEq(asset.totalSupply(), asset.balanceOf(address(vault)));
        assertEq(handler.donated(), asset.totalSupply() + vault.totalBurned());
        assertEq(asset.permanentlyBurned(), vault.totalBurned());
    }
}
