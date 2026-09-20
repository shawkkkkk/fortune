// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Burnable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";

/// @notice Fixed-supply ERC-20 created by FortuneFactory.
/// @dev No owner, post-launch mint, blacklist or fee mutation surface exists after construction.
///      Holders may burn their own tokens; FortuneCurve burns unsold inventory at successful graduation.
contract FortuneToken is ERC20, ERC20Burnable {
    uint16 public constant FORTUNE_TOKEN_VERSION = 2;

    address public immutable fortuneFactory;
    uint256 public immutable initialSupply;
    bytes32 public immutable launchManifest;

    constructor(
        address fortuneFactory_,
        string memory name_,
        string memory symbol_,
        uint256 supply_,
        bytes32 manifest_
    ) ERC20(name_, symbol_) {
        require(
            fortuneFactory_ != address(0),
            "ZERO_FACTORY"
        );
        require(supply_ > 0, "ZERO_SUPPLY");
        fortuneFactory = fortuneFactory_;
        initialSupply = supply_;
        launchManifest = manifest_;
        _mint(msg.sender, supply_);
    }
}
