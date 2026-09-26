// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Burnable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import {IPancakeV2FactoryLike} from "./interfaces/IPancakeV2.sol";

/// @notice Fixed-supply launch token for a Fortune custom-pair curve.
/// @dev Deployed by its curve, which receives the whole supply. There is no
///      owner, mint, fee, blacklist or pause. The one restriction: nobody can
///      send tokens to the launch's own PancakeSwap V2 pair until the curve
///      graduates, so that pool can only ever open at the curve's price.
contract FortuneCustomPairToken is ERC20, ERC20Burnable {
    uint16 public constant FORTUNE_CUSTOM_PAIR_TOKEN_VERSION = 1;

    address public immutable curve;
    address public immutable pairToken;
    address public immutable pool;
    uint256 public immutable initialSupply;

    bool public poolOpen;

    event PoolOpened(address indexed pool);

    error PoolLockedUntilGraduation();
    error OnlyCurve();

    constructor(
        string memory name_,
        string memory symbol_,
        uint256 supply_,
        address pairToken_,
        address pancakeFactory_
    ) ERC20(name_, symbol_) {
        require(supply_ > 0, "ZERO_SUPPLY");
        require(pairToken_ != address(0) && pancakeFactory_ != address(0), "ZERO_ADDRESS");
        curve = msg.sender;
        pairToken = pairToken_;
        initialSupply = supply_;
        // Created in the launch transaction, so no one can prepare it first.
        pool = IPancakeV2FactoryLike(pancakeFactory_).createPair(address(this), pairToken_);
        require(pool != address(0), "NO_POOL");
        _mint(msg.sender, supply_);
    }

    /// @notice Called once by the curve inside its graduation transaction.
    function openPool() external {
        if (msg.sender != curve) revert OnlyCurve();
        if (!poolOpen) {
            poolOpen = true;
            emit PoolOpened(pool);
        }
    }

    function _update(address from, address to, uint256 value) internal override {
        if (to == pool && !poolOpen) revert PoolLockedUntilGraduation();
        super._update(from, to, value);
    }
}
