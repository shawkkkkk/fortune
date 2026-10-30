// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {StdInvariant} from "forge-std/StdInvariant.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {FortuneTestnetCounterEscrow as Escrow} from "../src/FortuneTestnetCounterEscrow.sol";

contract CounterAssetMock is ERC20 {
    bool public tax;
    bool public fail;
    address public callback;
    bool public reentryRejected;

    constructor() ERC20("Local counter fixture", "LCF") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function destroy(address from, uint256 amount) external {
        _burn(from, amount);
    }

    function configure(bool tax_, bool fail_, address callback_) external {
        tax = tax_;
        fail = fail_;
        callback = callback_;
    }

    function _update(address from, address to, uint256 amount) internal override {
        if (from != address(0) && to != address(0)) {
            require(!fail, "fixture rejected transfer");
            if (callback != address(0)) {
                (bool success,) = callback.call(abi.encodeCall(Escrow.claim, (1, address(0x1001))));
                reentryRejected = !success;
            }
            if (tax) {
                super._update(from, address(0), 1);
                amount -= 1;
            }
        }
        super._update(from, to, amount);
    }
}

contract CounterEscrowBase is Test {
    address internal constant GOV = address(0x9001);
    address internal constant GUARD = address(0x9002);
    address internal constant ALICE = address(0x1001);
    address internal constant BOB = address(0x1002);
    address internal constant EXCLUDED = address(0x1003);
    CounterAssetMock internal launch;
    CounterAssetMock internal asset;
    CounterAssetMock internal second;
    Escrow internal escrow;

    function setUp() public virtual {
        vm.chainId(97);
        launch = new CounterAssetMock();
        asset = new CounterAssetMock();
        second = new CounterAssetMock();
        address[] memory exclusions = new address[](1);
        exclusions[0] = EXCLUDED;
        escrow = new Escrow(GOV, GUARD, address(launch), _assets(), exclusions);
        asset.mint(GOV, 1e36);
        second.mint(GOV, 1e36);
    }

    function _assets() internal view returns (Escrow.Asset[] memory values) {
        values = new Escrow.Asset[](2);
        (address a, address b) =
            address(asset) < address(second) ? (address(asset), address(second)) : (address(second), address(asset));
        values[0] = Escrow.Asset(a, a.codehash);
        values[1] = Escrow.Asset(b, b.codehash);
    }

    function _allocation(uint256 a, uint256 b)
        internal
        pure
        returns (address[] memory recipients, uint256[] memory amounts)
    {
        recipients = new address[](2);
        recipients[0] = ALICE;
        recipients[1] = BOB;
        amounts = new uint256[](2);
        amounts[0] = a;
        amounts[1] = b;
    }

    function _fund(CounterAssetMock token, uint256 a, uint256 b) internal returns (uint256 id) {
        (address[] memory recipients, uint256[] memory amounts) = _allocation(a, b);
        vm.startPrank(GOV);
        escrow.setPaused(true);
        token.approve(address(escrow), a + b);
        id = escrow.fundRound(address(token), recipients, amounts);
        vm.stopPrank();
    }

    function _open() internal {
        vm.prank(GOV);
        escrow.setPaused(false);
    }
}

contract FortuneTestnetCounterEscrowTest is CounterEscrowBase {
    function testFundClaimRotateAndKeepOldEntitlements() public {
        assertTrue(escrow.paused());
        uint256 one = _fund(asset, 11, 23);
        uint256 two = _fund(second, 37, 41);
        (address[] memory recipients, uint256[] memory amounts) = _allocation(11, 23);
        (address token, uint256 funded, uint256 remaining, bytes32 commitment) = escrow.rounds(one);
        assertEq(token, address(asset));
        assertEq(funded, 34);
        assertEq(remaining, 34);
        assertEq(
            commitment, keccak256(abi.encode(uint256(97), address(escrow), one, address(asset), recipients, amounts))
        );
        _open();
        vm.prank(EXCLUDED); // Relayer never receives the funds.
        escrow.claim(one, ALICE);
        escrow.claim(two, BOB);
        escrow.claim(one, BOB);
        assertEq(asset.balanceOf(ALICE), 11);
        assertEq(asset.balanceOf(BOB), 23);
        assertEq(asset.balanceOf(EXCLUDED), 0);
        assertEq(escrow.reserved(address(asset)), 0);
        assertEq(escrow.reserved(address(second)), 37);
        escrow.claim(two, ALICE);
        assertEq(escrow.reserved(address(second)), 0);
    }

    function testFundingCannotReuseDonationsOrAnotherRound() public {
        _fund(asset, 10, 20);
        asset.mint(address(escrow), 99);
        (address[] memory recipients, uint256[] memory amounts) = _allocation(10, 20);
        vm.prank(GOV); // No new allowance.
        vm.expectRevert();
        escrow.fundRound(address(asset), recipients, amounts);
        assertEq(escrow.nextRound(), 2);
        assertEq(escrow.reserved(address(asset)), 30);
        _fund(asset, 7, 8);
        assertEq(escrow.reserved(address(asset)), 45);
        _open();
        escrow.claim(1, ALICE);
        escrow.claim(1, BOB);
        escrow.claim(2, ALICE);
        escrow.claim(2, BOB);
        assertEq(asset.balanceOf(address(escrow)), 99); // No sweep or refund authority.
    }

    function testOnlyGovernorFundsAndOpensGuardianCanOnlyPause() public {
        (address[] memory recipients, uint256[] memory amounts) = _allocation(1, 2);
        vm.prank(GUARD);
        vm.expectRevert(Escrow.Unauthorized.selector);
        escrow.fundRound(address(asset), recipients, amounts);
        vm.prank(ALICE);
        vm.expectRevert(Escrow.Unauthorized.selector);
        escrow.setPaused(true);
        vm.prank(GUARD);
        vm.expectRevert(Escrow.Unauthorized.selector);
        escrow.setPaused(false);
        _fund(asset, 1, 2);
        vm.expectRevert(Escrow.WrongPauseState.selector);
        escrow.claim(1, ALICE);
        _open();
        vm.prank(GOV);
        vm.expectRevert(Escrow.WrongPauseState.selector);
        escrow.fundRound(address(asset), recipients, amounts);
        vm.prank(GUARD);
        escrow.setPaused(true);
        vm.expectRevert(Escrow.WrongPauseState.selector);
        escrow.claim(1, ALICE);
        assertEq(escrow.claimable(1, ALICE), 1);
        _open();
        escrow.claim(1, ALICE);
    }

    function testDoubleWrongRoundAndUnallocatedClaimsFailWithoutChangingLiabilities() public {
        _fund(asset, 3, 5);
        _open();
        escrow.claim(1, ALICE);
        vm.expectRevert(Escrow.NothingToClaim.selector);
        escrow.claim(1, ALICE);
        vm.expectRevert(Escrow.NothingToClaim.selector);
        escrow.claim(2, BOB);
        vm.expectRevert(Escrow.NothingToClaim.selector);
        escrow.claim(1, EXCLUDED);
        assertEq(escrow.reserved(address(asset)), 5);
        assertEq(escrow.claimable(1, BOB), 5);
    }

    function testRejectInvalidAndExcludedAllocationsBeforeFunding() public {
        (address[] memory recipients, uint256[] memory amounts) = _allocation(1, 2);
        vm.startPrank(GOV);
        asset.approve(address(escrow), 100);
        recipients[1] = ALICE;
        vm.expectRevert(Escrow.InvalidAllocation.selector);
        escrow.fundRound(address(asset), recipients, amounts);
        recipients[0] = BOB;
        recipients[1] = ALICE;
        vm.expectRevert(Escrow.InvalidAllocation.selector);
        escrow.fundRound(address(asset), recipients, amounts);
        recipients[0] = ALICE;
        recipients[1] = EXCLUDED;
        vm.expectRevert(Escrow.InvalidAllocation.selector);
        escrow.fundRound(address(asset), recipients, amounts);
        recipients[0] = address(0);
        vm.expectRevert(Escrow.InvalidAllocation.selector);
        escrow.fundRound(address(asset), recipients, amounts);
        recipients[0] = ALICE;
        recipients[1] = BOB;
        amounts[1] = 0;
        vm.expectRevert(Escrow.InvalidAllocation.selector);
        escrow.fundRound(address(asset), recipients, amounts);
        vm.expectRevert(Escrow.InvalidAllocation.selector);
        escrow.fundRound(address(asset), new address[](129), new uint256[](129));
        vm.expectRevert(Escrow.InvalidAllocation.selector);
        escrow.fundRound(address(asset), new address[](0), new uint256[](0));
        vm.expectRevert(Escrow.InvalidAllocation.selector);
        escrow.fundRound(address(asset), recipients, new uint256[](1));
        vm.expectRevert(Escrow.UntrustedAsset.selector);
        escrow.fundRound(address(launch), recipients, amounts);
        vm.stopPrank();
        assertEq(escrow.nextRound(), 1);
        assertEq(asset.balanceOf(address(escrow)), 0);
    }

    function testExactFundingAndFailedClaimsRollBackAllState() public {
        asset.configure(true, false, address(0));
        (address[] memory recipients, uint256[] memory amounts) = _allocation(4, 6);
        vm.startPrank(GOV);
        asset.approve(address(escrow), 10);
        vm.expectRevert(Escrow.InexactTransfer.selector);
        escrow.fundRound(address(asset), recipients, amounts);
        vm.stopPrank();
        assertEq(escrow.nextRound(), 1);
        assertEq(escrow.reserved(address(asset)), 0);
        asset.configure(false, false, address(0));
        _fund(asset, 4, 6);
        _open();
        asset.configure(true, false, address(0));
        vm.expectRevert(Escrow.InexactTransfer.selector);
        escrow.claim(1, ALICE);
        asset.configure(false, true, address(0));
        vm.expectRevert();
        escrow.claim(1, ALICE);
        assertEq(escrow.claimable(1, ALICE), 4);
        assertEq(escrow.reserved(address(asset)), 10);
        asset.configure(false, false, address(0));
        escrow.claim(1, ALICE);
    }

    function testInsolvencyAndChangedCodeBlockClaimsWithoutConsumingEntitlements() public {
        _fund(asset, 10, 20);
        _open();
        asset.destroy(address(escrow), 1);
        vm.expectRevert(Escrow.Insolvent.selector);
        escrow.claim(1, ALICE);
        assertEq(escrow.claimable(1, ALICE), 10);
        asset.mint(address(escrow), 1);
        vm.etch(address(asset), hex"60006000fd");
        vm.expectRevert(Escrow.UntrustedAsset.selector);
        escrow.claim(1, ALICE);
        assertEq(escrow.reserved(address(asset)), 30);
    }

    function testReentrancyRejectedAndCannotRedirectPayment() public {
        _fund(asset, 9, 17);
        _open();
        asset.configure(false, false, address(escrow));
        escrow.claim(1, ALICE);
        assertTrue(asset.reentryRejected());
        assertEq(asset.balanceOf(ALICE), 9);
        assertEq(escrow.reserved(address(asset)), 17);
    }

    function testWrongChainAtConstructionAndEveryMutableEntry() public {
        _fund(asset, 1, 2);
        Escrow.Asset[] memory assets = _assets();
        vm.chainId(1);
        vm.expectRevert(Escrow.WrongChain.selector);
        new Escrow(GOV, GUARD, address(launch), assets, new address[](0));
        vm.expectRevert(Escrow.WrongChain.selector);
        escrow.setPaused(false);
        (address[] memory recipients, uint256[] memory amounts) = _allocation(1, 2);
        vm.expectRevert(Escrow.WrongChain.selector);
        escrow.fundRound(address(asset), recipients, amounts);
        vm.expectRevert(Escrow.WrongChain.selector);
        escrow.claim(1, ALICE);
    }

    function testConstructorRejectsDuplicateUnsupportedAndUnpinnedAssets() public {
        Escrow.Asset[] memory assets = _assets();
        assets[1] = assets[0];
        vm.expectRevert(Escrow.InvalidConfiguration.selector);
        new Escrow(GOV, GUARD, address(launch), assets, new address[](0));
        assets = _assets();
        assets[0].codeHash = bytes32(uint256(1));
        vm.expectRevert(Escrow.InvalidConfiguration.selector);
        new Escrow(GOV, GUARD, address(launch), assets, new address[](0));
        vm.expectRevert(Escrow.InvalidConfiguration.selector);
        new Escrow(GOV, GOV, address(launch), _assets(), new address[](0));
        vm.expectRevert(Escrow.InvalidConfiguration.selector);
        new Escrow(GOV, GUARD, address(launch), new Escrow.Asset[](1), new address[](0));
    }

    function testFuzzFundingAndClaimConservation(uint128 a, uint128 b) public {
        uint256 x = bound(uint256(a), 1, 1e30);
        uint256 y = bound(uint256(b), 1, 1e30);
        _fund(asset, x, y);
        _open();
        escrow.claim(1, BOB);
        assertEq(escrow.reserved(address(asset)), x);
        assertEq(asset.balanceOf(address(escrow)), x);
        escrow.claim(1, ALICE);
        assertEq(escrow.reserved(address(asset)), 0);
        assertEq(asset.balanceOf(ALICE) + asset.balanceOf(BOB), x + y);
    }
}

contract CounterEscrowHandler is Test {
    Escrow public escrow;
    CounterAssetMock public asset;
    uint256 public funded;
    uint256 public paid;

    constructor(Escrow e, CounterAssetMock a) {
        escrow = e;
        asset = a;
    }

    function fund(uint96 a, uint96 b) external {
        if (escrow.nextRound() > 128) return;
        address[] memory recipients = new address[](2);
        recipients[0] = address(0x1001);
        recipients[1] = address(0x1002);
        uint256[] memory amounts = new uint256[](2);
        amounts[0] = uint256(a) + 1;
        amounts[1] = uint256(b) + 1;
        vm.startPrank(address(0x9001));
        escrow.setPaused(true);
        asset.approve(address(escrow), amounts[0] + amounts[1]);
        escrow.fundRound(address(asset), recipients, amounts);
        vm.stopPrank();
        funded += amounts[0] + amounts[1];
    }

    function claim(uint256 raw, bool bob) external {
        if (escrow.nextRound() == 1) return;
        uint256 id = bound(raw, 1, escrow.nextRound() - 1);
        address account = bob ? address(0x1002) : address(0x1001);
        uint256 amount = escrow.claimable(id, account);
        vm.prank(address(0x9001));
        escrow.setPaused(false);
        if (amount != 0) {
            escrow.claim(id, account);
            paid += amount;
        }
    }
}

contract FortuneTestnetCounterEscrowInvariantTest is CounterEscrowBase {
    CounterEscrowHandler internal handler;

    function setUp() public override {
        super.setUp();
        handler = new CounterEscrowHandler(escrow, asset);
        bytes4[] memory selectors = new bytes4[](2);
        selectors[0] = handler.fund.selector;
        selectors[1] = handler.claim.selector;
        targetSelector(FuzzSelector(address(handler), selectors));
        targetContract(address(handler));
    }

    function invariantFundsAlwaysCoverUnpaidEntitlements() public view {
        uint256 remaining;
        for (uint256 id = 1; id < escrow.nextRound(); ++id) {
            (, uint256 total, uint256 unpaid,) = escrow.rounds(id);
            assertLe(unpaid, total);
            assertEq(unpaid, escrow.claimable(id, ALICE) + escrow.claimable(id, BOB));
            remaining += unpaid;
        }
        assertEq(remaining, escrow.reserved(address(asset)));
        assertEq(remaining, asset.balanceOf(address(escrow)));
        assertEq(handler.funded(), handler.paid() + remaining);
        assertEq(handler.paid(), asset.balanceOf(ALICE) + asset.balanceOf(BOB));
    }
}
