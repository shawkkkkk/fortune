// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Mintable ERC-20 with configurable decimals.
contract MockStock is ERC20 {
    uint8 internal immutable _tokenDecimals;

    constructor(string memory symbol_, uint8 decimals_) ERC20(symbol_, symbol_) {
        _tokenDecimals = decimals_;
    }

    function decimals() public view virtual override returns (uint8) {
        return _tokenDecimals;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

/// @notice A stock whose issuer can pause it: while paused, `balanceOf` and
///         transfers revert, the way some upgradeable tokens behave mid-upgrade.
contract PausableStock is MockStock {
    bool public paused;

    constructor(string memory symbol_) MockStock(symbol_, 18) {}

    function setPaused(bool value) external {
        paused = value;
    }

    function balanceOf(address account) public view override returns (uint256) {
        require(!paused, "PAUSED");
        return super.balanceOf(account);
    }

    function _update(address from, address to, uint256 value) internal override {
        require(!paused, "PAUSED");
        super._update(from, to, value);
    }
}

/// @notice `balanceOf` burns all the gas it is given, or replies with a huge
///         payload, depending on the mode; transfers work normally.
contract HostileReadStock is MockStock {
    uint8 public mode; // 0 normal, 1 gas bomb, 2 return bomb

    constructor(string memory symbol_) MockStock(symbol_, 18) {}

    function setMode(uint8 value) external {
        mode = value;
    }

    function balanceOf(address account) public view override returns (uint256) {
        if (mode == 1) {
            uint256 x;
            while (gasleft() > 1_000) {
                x = uint256(keccak256(abi.encode(x)));
            }
            return x;
        }
        if (mode == 2) {
            assembly {
                return(0, 1000000)
            }
        }
        return super.balanceOf(account);
    }
}

/// @notice Returns nothing from `transfer`, like USDT on Ethereum.
contract NoReturnStock {
    string public constant symbol = "NORET";
    uint8 public constant decimals = 18;
    mapping(address => uint256) public balanceOf;
    uint256 public totalSupply;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
        totalSupply += amount;
    }

    function transfer(address to, uint256 amount) external {
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
    }
}

/// @notice Returns false from `transfer` without moving anything when told to.
contract FalseReturnStock is MockStock {
    bool public refuse;

    constructor(string memory symbol_) MockStock(symbol_, 18) {}

    function setRefuse(bool value) external {
        refuse = value;
    }

    function transfer(address to, uint256 amount) public override returns (bool) {
        if (refuse) return false;
        return super.transfer(to, amount);
    }
}

interface ITransferHook {
    function onStockReceived(address token, uint256 amount) external;
}

/// @notice Calls the recipient after every transfer to it, like ERC-777 hooks.
contract HookStock is MockStock {
    constructor(string memory symbol_) MockStock(symbol_, 18) {}

    function _update(address from, address to, uint256 value) internal override {
        super._update(from, to, value);
        if (from != address(0) && to.code.length > 0) {
            try ITransferHook(to).onStockReceived(address(this), value) {} catch {}
        }
    }
}
