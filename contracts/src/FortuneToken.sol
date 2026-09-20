// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Fixed-supply ERC-20 created by FortuneFactory.
/// @dev No owner, mint, blacklist or fee mutation surface exists after construction.
contract FortuneToken is ERC20 {
    uint256 public immutable initialSupply;
    bytes32 public immutable launchManifest;

    constructor(
        string memory name_,
        string memory symbol_,
        uint256 supply_,
        bytes32 manifest_
    ) ERC20(name_, symbol_) {
        require(supply_ > 0, "ZERO_SUPPLY");
        initialSupply = supply_;
        launchManifest = manifest_;
        _mint(msg.sender, supply_);
    }
}
