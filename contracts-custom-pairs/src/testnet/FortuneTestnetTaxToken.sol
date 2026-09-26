// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice BSC Testnet stand-in for a transfer-tax "stonk" token, so anyone
///         can try Fortune custom pairs without mainnet assets. Every transfer
///         burns `taxBps` of the amount. Refuses to deploy on BSC mainnet.
contract FortuneTestnetTaxToken is ERC20 {
    uint256 public constant FAUCET_AMOUNT = 1_000e18;
    uint256 public constant FAUCET_COOLDOWN = 1 hours;

    uint16 public immutable taxBps;
    mapping(address => uint256) public lastFaucetAt;

    event TransferTaxBurned(address indexed from, address indexed to, uint256 amount, uint256 tax);

    constructor(string memory name_, string memory symbol_, uint16 taxBps_, uint256 initialMint) ERC20(name_, symbol_) {
        require(block.chainid != 56, "TESTNET_ONLY");
        require(taxBps_ <= 2_500, "TAX_TOO_HIGH");
        taxBps = taxBps_;
        if (initialMint > 0) _mint(msg.sender, initialMint);
    }

    /// @notice 1,000 test tokens per wallet per hour.
    function faucet() external {
        require(block.timestamp >= lastFaucetAt[msg.sender] + FAUCET_COOLDOWN, "FAUCET_COOLDOWN");
        lastFaucetAt[msg.sender] = block.timestamp;
        _mint(msg.sender, FAUCET_AMOUNT);
    }

    function _update(address from, address to, uint256 value) internal override {
        if (from == address(0) || to == address(0) || taxBps == 0) {
            super._update(from, to, value);
            return;
        }
        uint256 tax = value * taxBps / 10_000;
        if (tax > 0) super._update(from, address(0), tax);
        super._update(from, to, value - tax);
        emit TransferTaxBurned(from, to, value, tax);
    }
}
