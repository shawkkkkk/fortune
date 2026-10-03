// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice BSC Testnet stand-in for a tokenized stock, so anyone can try Stock
///         Rewards launches without mainnet assets. Has no value and is not
///         backed by anything. Refuses to deploy on BSC mainnet.
contract FortuneTestStock is ERC20 {
    uint256 public constant FAUCET_COOLDOWN = 1 hours;

    uint8 internal immutable _tokenDecimals;
    /// Whole shares minted per faucet call, in base units.
    uint256 public immutable faucetAmount;
    mapping(address => uint256) public lastFaucetAt;

    constructor(string memory name_, string memory symbol_, uint8 decimals_, uint256 faucetShares)
        ERC20(name_, symbol_)
    {
        require(block.chainid != 56, "TESTNET_ONLY");
        require(decimals_ <= 18 && faucetShares > 0 && faucetShares <= 1e6, "BAD_CONFIG");
        _tokenDecimals = decimals_;
        faucetAmount = faucetShares * 10 ** decimals_;
    }

    function decimals() public view override returns (uint8) {
        return _tokenDecimals;
    }

    /// @notice `faucetAmount` test shares per wallet per hour.
    function faucet() external {
        require(block.timestamp >= lastFaucetAt[msg.sender] + FAUCET_COOLDOWN, "FAUCET_COOLDOWN");
        lastFaucetAt[msg.sender] = block.timestamp;
        _mint(msg.sender, faucetAmount);
    }
}
