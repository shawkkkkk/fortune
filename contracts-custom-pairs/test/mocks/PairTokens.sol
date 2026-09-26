// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Plain mintable ERC-20 with configurable decimals.
contract PlainToken is ERC20 {
    uint8 private immutable _decimals;

    constructor(string memory symbol_, uint8 decimals_) ERC20(symbol_, symbol_) {
        _decimals = decimals_;
    }

    function decimals() public view override returns (uint8) {
        return _decimals;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

/// @notice Takes `taxBps` of every transfer (not mints or burns) and sends it
///         to a collector, like most BSC "tax" tokens configured to tax all
///         transfers. The recipient receives amount - tax.
contract TaxToken is ERC20 {
    uint8 private immutable _decimals;
    uint16 public taxBps;
    address public immutable collector = address(0xC011EC7);
    mapping(address => bool) public exempt;

    constructor(string memory symbol_, uint8 decimals_, uint16 taxBps_) ERC20(symbol_, symbol_) {
        _decimals = decimals_;
        taxBps = taxBps_;
    }

    function decimals() public view override returns (uint8) {
        return _decimals;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function setTax(uint16 taxBps_) external {
        taxBps = taxBps_;
    }

    function setExempt(address account, bool value) external {
        exempt[account] = value;
    }

    function _update(address from, address to, uint256 value) internal override {
        if (from == address(0) || to == address(0) || taxBps == 0 || exempt[from] || exempt[to]) {
            super._update(from, to, value);
            return;
        }
        uint256 tax = value * taxBps / 10_000;
        super._update(from, collector, tax);
        super._update(from, to, value - tax);
    }
}

/// @notice Charges the tax on top: the sender loses amount + tax while the
///         recipient receives the full amount. Unsupported by design; the curve
///         must never let this drain the reserve backing holders.
contract TaxOnTopToken is ERC20 {
    uint16 public taxBps;
    address public immutable collector = address(0x70F);

    constructor(uint16 taxBps_) ERC20("Tax On Top", "TOP") {
        taxBps = taxBps_;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function _update(address from, address to, uint256 value) internal override {
        super._update(from, to, value);
        if (from != address(0) && to != address(0) && taxBps > 0) {
            uint256 tax = value * taxBps / 10_000;
            uint256 available = balanceOf(from);
            super._update(from, collector, tax < available ? tax : available);
        }
    }
}

/// @notice Share-based rebasing token: balances = shares * index / 1e18.
contract RebasingToken is ERC20 {
    uint256 public index = 1e18;
    mapping(address => uint256) private _shares;
    uint256 private _totalShares;

    constructor() ERC20("Rebasing", "REB") {}

    function mint(address to, uint256 amount) external {
        uint256 shares = amount * 1e18 / index;
        _shares[to] += shares;
        _totalShares += shares;
        emit Transfer(address(0), to, amount);
    }

    /// @param newIndex 1e18 = unchanged; 0.8e18 = every balance falls 20%.
    function rebase(uint256 newIndex) external {
        index = newIndex;
    }

    function totalSupply() public view override returns (uint256) {
        return _totalShares * index / 1e18;
    }

    function balanceOf(address account) public view override returns (uint256) {
        return _shares[account] * index / 1e18;
    }

    function _update(address from, address to, uint256 value) internal override {
        uint256 shares = value * 1e18 / index;
        if (from != address(0)) {
            require(_shares[from] >= shares, "REBASE_BALANCE");
            _shares[from] -= shares;
        } else {
            _totalShares += shares;
        }
        if (to != address(0)) _shares[to] += shares;
        else _totalShares -= shares;
        emit Transfer(from, to, value);
    }
}

/// @notice Issuer-controlled token with a global pause and a blacklist.
contract PausableBlacklistToken is ERC20 {
    bool public paused;
    mapping(address => bool) public blacklisted;

    constructor() ERC20("Issuer Stock", "STOCKX") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function setPaused(bool value) external {
        paused = value;
    }

    function setBlacklisted(address account, bool value) external {
        blacklisted[account] = value;
    }

    function _update(address from, address to, uint256 value) internal override {
        require(!paused, "PAUSED");
        require(!blacklisted[from] && !blacklisted[to], "BLACKLISTED");
        super._update(from, to, value);
    }
}

/// @notice USDT-style token whose transfer functions return nothing.
contract NoReturnToken {
    string public constant name = "No Return";
    string public constant symbol = "NRT";
    uint8 public constant decimals = 6;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amount) external {
        totalSupply += amount;
        balanceOf[to] += amount;
    }

    function transfer(address to, uint256 amount) external {
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
    }

    function transferFrom(address from, address to, uint256 amount) external {
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
    }

    function approve(address spender, uint256 amount) external {
        allowance[msg.sender][spender] = amount;
    }
}

interface IReentryTarget {
    function buy(uint256 amountIn, uint256 minTokensOut) external returns (uint256);
    function sell(uint256 tokenAmount, uint256 minPairOut) external returns (uint256);
    function graduate() external returns (uint256);
    function claimProtocolFees() external returns (uint256);
}

/// @notice Calls back into a target curve during every transfer and records
///         whether the reentrant call got through.
contract ReentrantToken is ERC20 {
    address public target;
    uint8 public mode;
    bool public reentered;
    bool public attempted;

    constructor() ERC20("Reentrant", "RENT") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function arm(address target_, uint8 mode_) external {
        target = target_;
        mode = mode_;
    }

    function _update(address from, address to, uint256 value) internal override {
        super._update(from, to, value);
        address t = target;
        if (t == address(0) || from == address(0) || to == address(0)) return;
        target = address(0);
        attempted = true;
        bool ok;
        if (mode == 1) (ok,) = t.call(abi.encodeCall(IReentryTarget.buy, (1, 0)));
        else if (mode == 2) (ok,) = t.call(abi.encodeCall(IReentryTarget.sell, (1, 0)));
        else if (mode == 3) (ok,) = t.call(abi.encodeCall(IReentryTarget.graduate, ()));
        else (ok,) = t.call(abi.encodeCall(IReentryTarget.claimProtocolFees, ()));
        if (ok) reentered = true;
        target = t;
    }
}

/// @notice Reverts when a recipient would hold more than `maxWallet`.
contract MaxWalletToken is ERC20 {
    uint256 public maxWallet;

    constructor(uint256 maxWallet_) ERC20("Max Wallet", "MAXW") {
        maxWallet = maxWallet_;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function setMaxWallet(uint256 value) external {
        maxWallet = value;
    }

    function _update(address from, address to, uint256 value) internal override {
        super._update(from, to, value);
        if (from != address(0) && to != address(0)) require(balanceOf(to) <= maxWallet, "MAX_WALLET");
    }
}

interface IMintablePool {
    function mint(address to) external returns (uint256);
}

/// @notice A hostile pair token: when it is sent to `pool`, its hook pushes
///         launch tokens it holds into that pool and mints LP for itself,
///         trying to take the graduation liquidity.
contract PoolHijackToken is ERC20 {
    address public pool;
    address public launchToken;
    address public dust;
    bool public hijacked;

    constructor() ERC20("Hijack", "HJK") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function arm(address pool_, address launchToken_) external {
        pool = pool_;
        launchToken = launchToken_;
    }

    function _update(address from, address to, uint256 value) internal override {
        super._update(from, to, value);
        if (to != pool || pool == address(0) || hijacked) return;
        hijacked = true;
        uint256 held = ERC20(launchToken).balanceOf(address(this));
        if (held > 1) {
            ERC20(launchToken).transfer(pool, held - 1);
            IMintablePool(pool).mint(address(this));
            // Leave a sliver of both tokens so the curve's own mint is nonzero.
            ERC20(launchToken).transfer(pool, 1);
            super._update(address(this), pool, 1);
        }
    }
}
