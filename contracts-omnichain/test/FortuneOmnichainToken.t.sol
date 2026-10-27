// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {TestHelperOz5} from "@layerzerolabs/test-devtools-evm-foundry/contracts/TestHelperOz5.sol";
import {OptionsBuilder} from "@layerzerolabs/oapp-evm/contracts/oapp/libs/OptionsBuilder.sol";
import {Origin} from "@layerzerolabs/oapp-evm/contracts/oapp/OAppReceiver.sol";
import {
    SendParam,
    MessagingFee,
    MessagingReceipt,
    OFTReceipt
} from "@layerzerolabs/oft-evm/contracts/interfaces/IOFT.sol";
import {FortuneOmnichainToken} from "../src/FortuneOmnichainToken.sol";
import {EndpointV2Mock} from "@layerzerolabs/test-devtools-evm-foundry/contracts/mocks/EndpointV2Mock.sol";

/// @dev Local LayerZero endpoint/message-library fixtures, NOT a live network drill.
contract FortuneOmnichainTokenTest is TestHelperOz5 {
    using OptionsBuilder for bytes;
    FortuneOmnichainToken a;
    FortuneOmnichainToken b;
    address constant ALICE = address(0xA11CE);
    address constant BOB = address(0xB0B);
    uint256 constant CAP = 1_000_000_000 ether;
    bytes32 constant MANIFEST = keccak256("fortune-testnet-two-leg-manifest");

    function setUp() public override {
        super.setUp();
        vm.chainId(97);
        setUpEndpoints(2, LibraryType.SimpleMessageLib);
        a = _token(endpoints[1], 600_000_000 ether);
        b = _token(endpoints[2], 400_000_000 ether);
        address[] memory apps = new address[](2);
        apps[0] = address(a);
        apps[1] = address(b);
        wireOApps(apps);
        a.setBridgeEnabled(true);
        b.setBridgeEnabled(true);
        vm.deal(ALICE, 100 ether);
        vm.deal(address(this), 100 ether);
    }

    function _token(address endpoint_, uint256 allocation) private returns (FortuneOmnichainToken) {
        return new FortuneOmnichainToken(
            "Fortune Omni Test", "FOT", endpoint_, address(this), ALICE, CAP, allocation, MANIFEST
        );
    }

    function _params(uint256 amount) private pure returns (SendParam memory) {
        return SendParam(
            2,
            bytes32(uint256(uint160(BOB))),
            amount,
            amount / 1e12 * 1e12,
            OptionsBuilder.newOptions().addExecutorLzReceiveOption(300_000, 0),
            "",
            ""
        );
    }

    function _send(uint256 amount) private returns (MessagingReceipt memory receipt, OFTReceipt memory oft) {
        SendParam memory p = _params(amount);
        MessagingFee memory fee = a.quoteSend(p, false);
        vm.prank(ALICE);
        return a.send{value: fee.nativeFee}(p, fee, ALICE);
    }

    function testGenesisAndPowers() public {
        assertEq(a.totalSupply() + b.totalSupply(), CAP);
        assertEq(a.globalSupplyCap(), CAP);
        assertEq(a.initialAllocation(), 600_000_000 ether);
        assertEq(a.launchManifestHash(), MANIFEST);
        assertEq(a.owner(), address(this));
        assertEq(a.peerCount(), 1);
        assertEq(a.sharedDecimals(), 6);
        assertFalse(a.approvalRequired());
        (bool minted,) = address(a).call(abi.encodeWithSignature("mint(address,uint256)", ALICE, 1 ether));
        assertFalse(minted, "no owner mint function");
    }

    function testBridgeStartsDisabledAndNeedsPeer() public {
        FortuneOmnichainToken c = _token(endpoints[1], 0);
        assertFalse(c.bridgeEnabled());
        vm.expectRevert(FortuneOmnichainToken.InvalidConfiguration.selector);
        c.setBridgeEnabled(true);
    }

    function testPeerChangesRequirePauseAndOwner() public {
        vm.expectRevert(FortuneOmnichainToken.PauseBeforePeerChange.selector);
        a.setPeer(2, bytes32(uint256(uint160(BOB))));
        vm.prank(ALICE);
        vm.expectRevert();
        a.setBridgeEnabled(false);
        a.setBridgeEnabled(false);
        vm.prank(ALICE);
        vm.expectRevert();
        a.setPeer(2, bytes32(uint256(uint160(BOB))));
        a.setPeer(2, bytes32(0));
        assertEq(a.peerCount(), 0);
        a.setPeer(2, bytes32(uint256(uint160(address(b)))));
        assertEq(a.peerCount(), 1);
        a.setPeer(2, bytes32(uint256(uint160(address(b)))));
        assertEq(a.peerCount(), 1);
        vm.expectRevert(FortuneOmnichainToken.InvalidConfiguration.selector);
        a.setPeer(1, bytes32(0));
    }

    function testBurnMintDustAndInFlightSupply() public {
        uint256 initial = a.balanceOf(ALICE);
        (, OFTReceipt memory oft) = _send(3.5 ether + 123);
        assertEq(oft.amountSentLD, 3.5 ether);
        assertEq(oft.amountReceivedLD, 3.5 ether);
        assertEq(a.balanceOf(ALICE), initial - 3.5 ether);
        assertEq(a.totalSupply() + b.totalSupply() + oft.amountSentLD, CAP);
        assertEq(a.permanentlyBurned(), 0, "transport is not a permanent burn");
        verifyPackets(2, address(b));
        assertEq(b.balanceOf(BOB), 3.5 ether);
        assertEq(a.totalSupply() + b.totalSupply(), CAP);
    }

    function testFuzzTransportConservation(uint128 raw) public {
        uint256 amount = bound(uint256(raw), 1e12, 100_000 ether);
        (, OFTReceipt memory oft) = _send(amount);
        assertEq(a.totalSupply() + b.totalSupply() + oft.amountSentLD, CAP);
        verifyPackets(2, address(b));
        assertEq(a.totalSupply() + b.totalSupply(), CAP);
        assertEq(b.balanceOf(BOB), oft.amountReceivedLD);
        assertEq(a.permanentlyBurned() + b.permanentlyBurned(), 0);
    }

    function testPermanentBurnSeparateFromTransport() public {
        vm.prank(ALICE);
        a.burn(10 ether + 1);
        _send(1 ether);
        verifyPackets(2, address(b));
        assertEq(a.permanentlyBurned(), 10 ether + 1);
        assertEq(a.totalSupply() + b.totalSupply() + a.permanentlyBurned(), CAP);
    }

    function testEndpointDeliveryPauseRetryAndDuplicateRejection() public {
        (MessagingReceipt memory receipt,) = _send(1 ether);
        b.setBridgeEnabled(false);
        vm.expectRevert(FortuneOmnichainToken.BridgeDisabled.selector);
        this.deliverPending();
        assertEq(b.balanceOf(BOB), 0);
        b.setBridgeEnabled(true);
        verifyPackets(2, address(b));
        assertEq(b.balanceOf(BOB), 1 ether);
        Origin memory origin = Origin(1, bytes32(uint256(uint160(address(a)))), receipt.nonce);
        bytes memory message = abi.encodePacked(bytes32(uint256(uint160(BOB))), uint64(1_000_000));
        vm.expectRevert();
        EndpointV2Mock(endpoints[2]).lzReceive(origin, address(b), receipt.guid, message, "");
        assertEq(b.balanceOf(BOB), 1 ether);
        assertEq(a.totalSupply() + b.totalSupply(), CAP);
    }

    function deliverPending() external {
        verifyPackets(2, address(b));
    }

    function testPausedSendAndDustOnlySendFailWithoutDebit() public {
        a.setBridgeEnabled(false);
        SendParam memory p = _params(1 ether);
        MessagingFee memory fee = a.quoteSend(p, false);
        vm.prank(ALICE);
        vm.expectRevert(FortuneOmnichainToken.BridgeDisabled.selector);
        a.send{value: fee.nativeFee}(p, fee, ALICE);
        a.setBridgeEnabled(true);
        p = _params(1e12 - 1);
        fee = a.quoteSend(p, false);
        vm.prank(ALICE);
        vm.expectRevert(FortuneOmnichainToken.UnsupportedTransfer.selector);
        a.send{value: fee.nativeFee}(p, fee, ALICE);
        assertEq(a.totalSupply(), 600_000_000 ether);
    }

    function testSlippageAndInsufficientFeeRollBackDebit() public {
        SendParam memory p = _params(1 ether + 1);
        p.minAmountLD = 1 ether + 1;
        vm.expectRevert();
        a.quoteSend(p, false);
        p = _params(1 ether);
        MessagingFee memory fee = a.quoteSend(p, false);
        assertGt(fee.nativeFee, 0);
        vm.prank(ALICE);
        vm.expectRevert();
        a.send(p, fee, ALICE);
        assertEq(a.totalSupply(), 600_000_000 ether);
    }

    function testNoComposingNonEvmRecipientOrCommands() public {
        SendParam memory p = _params(1 ether);
        MessagingFee memory fee = a.quoteSend(p, false);
        p.composeMsg = hex"01";
        vm.prank(ALICE);
        vm.expectRevert(FortuneOmnichainToken.UnsupportedTransfer.selector);
        a.send(p, fee, ALICE);
        p.composeMsg = "";
        p.oftCmd = hex"01";
        vm.prank(ALICE);
        vm.expectRevert(FortuneOmnichainToken.UnsupportedTransfer.selector);
        a.send(p, fee, ALICE);
        p.oftCmd = "";
        p.to = bytes32(uint256(1) << 200);
        vm.prank(ALICE);
        vm.expectRevert(FortuneOmnichainToken.UnsupportedTransfer.selector);
        a.send(p, fee, ALICE);
        p.to = bytes32(0);
        vm.prank(ALICE);
        vm.expectRevert(FortuneOmnichainToken.UnsupportedTransfer.selector);
        a.send(p, fee, ALICE);
        assertEq(a.totalSupply(), 600_000_000 ether);
    }

    function _delivery(Origin memory origin, bytes32 guid, bytes memory message) private {
        vm.prank(endpoints[2]);
        b.lzReceive(origin, guid, message, address(this), "");
    }

    function testAuthenticatedInboundRetryAndReplay() public {
        Origin memory origin = Origin(1, bytes32(uint256(uint160(address(a)))), 10);
        bytes memory message = abi.encodePacked(bytes32(uint256(uint160(BOB))), uint64(1_000_000));
        bytes32 guid = keccak256("retry-fixture");
        b.setBridgeEnabled(false);
        vm.expectRevert(FortuneOmnichainToken.BridgeDisabled.selector);
        _delivery(origin, guid, message);
        assertFalse(b.deliveredGuids(guid));
        b.setBridgeEnabled(true);
        _delivery(origin, guid, message);
        assertEq(b.balanceOf(BOB), 1 ether);
        vm.expectRevert(FortuneOmnichainToken.DuplicateDelivery.selector);
        _delivery(origin, guid, message);
        vm.expectRevert(FortuneOmnichainToken.DuplicateDelivery.selector);
        _delivery(origin, keccak256("changed-guid"), message);
    }

    function testEndpointAndPeerAuthentication() public {
        Origin memory origin = Origin(1, bytes32(uint256(uint160(address(a)))), 10);
        bytes memory message = abi.encodePacked(bytes32(uint256(uint160(BOB))), uint64(1));
        vm.expectRevert();
        b.lzReceive(origin, keccak256("untrusted"), message, address(this), "");
        origin.sender = bytes32(uint256(uint160(ALICE)));
        vm.expectRevert();
        _delivery(origin, keccak256("wrong-peer"), message);
        assertEq(b.balanceOf(BOB), 0);
    }

    function testInboundCapFailureDoesNotConsumeReceipt() public {
        Origin memory origin = Origin(1, bytes32(uint256(uint160(address(a)))), 10);
        bytes32 guid = keccak256("cap-fixture");
        bytes memory message = abi.encodePacked(bytes32(uint256(uint160(BOB))), uint64(700_000_000 * 1e6));
        vm.expectRevert(FortuneOmnichainToken.SupplyCapExceeded.selector);
        _delivery(origin, guid, message);
        assertFalse(b.deliveredGuids(guid));
        assertEq(b.totalSupply(), 400_000_000 ether);
    }

    function testMalformedInboundDoesNotMint() public {
        Origin memory origin = Origin(1, bytes32(uint256(uint160(address(a)))), 20);
        bytes32 guid = keccak256("invalid-inbound");
        bytes memory valid = abi.encodePacked(bytes32(uint256(uint160(BOB))), uint64(1));
        vm.expectRevert(FortuneOmnichainToken.UnsupportedTransfer.selector);
        _delivery(origin, guid, hex"00");
        vm.expectRevert(FortuneOmnichainToken.UnsupportedTransfer.selector);
        _delivery(origin, bytes32(0), valid);
        bytes memory nonEvm = abi.encodePacked(bytes32(uint256(1) << 200), uint64(1));
        vm.expectRevert(FortuneOmnichainToken.UnsupportedTransfer.selector);
        _delivery(origin, guid, nonEvm);
        bytes memory zero = abi.encodePacked(bytes32(uint256(uint160(BOB))), uint64(0));
        vm.expectRevert(FortuneOmnichainToken.UnsupportedTransfer.selector);
        _delivery(origin, guid, zero);
        assertFalse(b.deliveredGuids(guid));
        origin.nonce = 0;
        vm.expectRevert(FortuneOmnichainToken.UnsupportedTransfer.selector);
        _delivery(origin, guid, valid);
        assertEq(b.totalSupply(), 400_000_000 ether);
    }

    function testConstructorRejectsMainnetAndWrongAllocation() public {
        vm.chainId(56);
        vm.expectRevert(FortuneOmnichainToken.TestnetOnly.selector);
        _token(endpoints[1], 1 ether);
        vm.chainId(97);
        vm.expectRevert(FortuneOmnichainToken.InvalidConfiguration.selector);
        _token(endpoints[1], CAP + 1 ether);
        vm.expectRevert(FortuneOmnichainToken.InvalidConfiguration.selector);
        _token(endpoints[1], 1);
    }

    function testRuntimeChainMismatchFails() public {
        vm.chainId(56);
        vm.prank(ALICE);
        vm.expectRevert(FortuneOmnichainToken.TestnetOnly.selector);
        a.transfer(BOB, 1);
    }
}
