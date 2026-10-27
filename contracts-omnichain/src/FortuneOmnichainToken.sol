// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {OFT} from "@layerzerolabs/oft-evm/contracts/OFT.sol";
import {
    SendParam,
    MessagingFee,
    MessagingReceipt,
    OFTReceipt
} from "@layerzerolabs/oft-evm/contracts/interfaces/IOFT.sol";
import {Origin} from "@layerzerolabs/oapp-evm/contracts/oapp/OAppReceiver.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @notice UNAUDITED, isolated EVM testnet engine. Not a Standard upgrade or a live bridge.
/// @dev The owner controls peers and bridge pause; the endpoint delegate retains messaging
/// configuration authority. These powers must be disclosed, not described as revoked.
contract FortuneOmnichainToken is OFT {
    error TestnetOnly();
    error InvalidConfiguration();
    error BridgeDisabled();
    error PauseBeforePeerChange();
    error UnsupportedTransfer();
    error SupplyCapExceeded();
    error DuplicateDelivery();

    uint256 public immutable deploymentChainId;
    uint256 public immutable globalSupplyCap;
    uint256 public immutable initialAllocation;
    bytes32 public immutable launchManifestHash;
    uint256 public permanentlyBurned;
    uint256 public peerCount;
    bool public bridgeEnabled;
    mapping(bytes32 => bool) public deliveredGuids;
    mapping(bytes32 => bool) public deliveredOrigins;

    event BridgeEnabled(bool enabled);
    event PermanentBurn(address indexed holder, uint256 amount);

    constructor(
        string memory name_,
        string memory symbol_,
        address endpoint_,
        address owner_,
        address genesisRecipient_,
        uint256 globalSupplyCap_,
        uint256 initialAllocation_,
        bytes32 manifestHash_
    ) OFT(name_, symbol_, endpoint_, owner_) Ownable(owner_) {
        if (block.chainid != 97 && block.chainid != 84532 && block.chainid != 11155111) {
            revert TestnetOnly();
        }
        if (
            endpoint_.code.length == 0 || genesisRecipient_ == address(0) || manifestHash_ == bytes32(0)
                || globalSupplyCap_ == 0 || globalSupplyCap_ / decimalConversionRate > type(uint64).max
                || globalSupplyCap_ % decimalConversionRate != 0 || initialAllocation_ % decimalConversionRate != 0
                || initialAllocation_ > globalSupplyCap_
        ) revert InvalidConfiguration();
        _checkIdentity(name_, 64);
        _checkIdentity(symbol_, 16);
        deploymentChainId = block.chainid;
        globalSupplyCap = globalSupplyCap_;
        initialAllocation = initialAllocation_;
        launchManifestHash = manifestHash_;
        if (initialAllocation_ != 0) _mint(genesisRecipient_, initialAllocation_);
    }

    function _checkIdentity(string memory value, uint256 maxBytes) private pure {
        bytes memory text = bytes(value);
        if (text.length == 0 || text.length > maxBytes) revert InvalidConfiguration();
        for (uint256 i; i < text.length; ++i) {
            if (uint8(text[i]) < 32 || uint8(text[i]) == 127) revert InvalidConfiguration();
        }
    }

    function setBridgeEnabled(bool enabled) external onlyOwner {
        if (enabled && peerCount == 0) revert InvalidConfiguration();
        bridgeEnabled = enabled;
        emit BridgeEnabled(enabled);
    }

    function setPeer(uint32 eid, bytes32 peer) public override onlyOwner {
        if (bridgeEnabled) revert PauseBeforePeerChange();
        if (eid == 0 || eid == endpoint.eid() || uint256(peer) >> 160 != 0) revert InvalidConfiguration();
        if (peers[eid] == bytes32(0) && peer != bytes32(0)) ++peerCount;
        else if (peers[eid] != bytes32(0) && peer == bytes32(0)) --peerCount;
        _setPeer(eid, peer);
    }

    /// @notice A permanent voluntary burn. Transport debits never increment this ledger.
    function burn(uint256 amount) external {
        _burn(msg.sender, amount);
        permanentlyBurned += amount;
        emit PermanentBurn(msg.sender, amount);
    }

    function _send(SendParam calldata p, MessagingFee calldata fee, address refund)
        internal
        override
        returns (MessagingReceipt memory, OFTReceipt memory)
    {
        if (
            p.to == bytes32(0) || uint256(p.to) >> 160 != 0 || p.composeMsg.length != 0 || p.oftCmd.length != 0
                || fee.lzTokenFee != 0 || refund == address(0)
        ) revert UnsupportedTransfer();
        return super._send(p, fee, refund);
    }

    function _debit(address from, uint256 amount, uint256 minimum, uint32 destination)
        internal
        override
        returns (uint256, uint256)
    {
        if (!bridgeEnabled) revert BridgeDisabled();
        if (amount < decimalConversionRate) revert UnsupportedTransfer();
        return super._debit(from, amount, minimum, destination);
    }

    function _lzReceive(
        Origin calldata origin,
        bytes32 guid,
        bytes calldata message,
        address executor,
        bytes calldata extraData
    ) internal override {
        if (!bridgeEnabled) revert BridgeDisabled();
        if (message.length != 40 || guid == bytes32(0) || origin.nonce == 0) revert UnsupportedTransfer();
        bytes32 recipient = bytes32(message[:32]);
        if (recipient == bytes32(0) || uint256(recipient) >> 160 != 0) revert UnsupportedTransfer();
        bytes32 originId = keccak256(abi.encode(origin.srcEid, origin.sender, origin.nonce));
        if (deliveredGuids[guid] || deliveredOrigins[originId]) revert DuplicateDelivery();
        deliveredGuids[guid] = true;
        deliveredOrigins[originId] = true;
        // Any failed credit rolls back both receipt guards, preserving original-message retry.
        super._lzReceive(origin, guid, message, executor, extraData);
    }

    function _credit(address to, uint256 amount, uint32 source) internal override returns (uint256) {
        if (amount == 0) revert UnsupportedTransfer();
        return super._credit(to, amount, source);
    }

    function _update(address from, address to, uint256 amount) internal override {
        if (block.chainid != deploymentChainId) revert TestnetOnly();
        if (from == address(0) && amount > globalSupplyCap - totalSupply()) revert SupplyCapExceeded();
        super._update(from, to, amount);
    }
}
