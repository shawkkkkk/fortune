// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IPermanentBurnToken {
    function deploymentChainId() external view returns (uint256);
    function launchManifestHash() external view returns (bytes32);
    function bridgeEnabled() external view returns (bool);
    function balanceOf(address) external view returns (uint256);
    function totalSupply() external view returns (uint256);
    function permanentlyBurned() external view returns (uint256);
    function burn(uint256) external;
}

/// @notice Unaudited chain97 burn-only inventory; not proof of fee origin or buybacks.
contract FortuneTestnetBurnVault is ReentrancyGuard {
    address public immutable governor;
    address public immutable guardian;
    address public immutable token;
    bytes32 public immutable runtimeHash;
    bytes32 public immutable manifestHash;
    uint128 public immutable maxPerBurn;
    bool public paused = true;
    uint256 public totalBurned;
    uint256 public burnCount;
    error WrongChain();
    error Unauthorized();
    error InvalidPolicy();
    error Paused();
    error InvalidAmount();
    error InexactBurn();
    event PauseChanged(bool paused);
    event InventoryBurned(uint256 indexed sequence, address indexed caller, uint256 amount, uint256 cumulative);

    constructor(address gov, address guard, address asset, bytes32 codeHash, bytes32 manifest, uint128 maximum) {
        if (block.chainid != 97) revert WrongChain();
        if (
            gov == address(0) || guard == address(0) || gov == guard || gov == address(this) || guard == address(this)
                || asset == gov || asset == guard || asset == address(this) || codeHash == bytes32(0)
                || manifest == bytes32(0) || maximum == 0
        ) revert InvalidPolicy();
        governor = gov;
        guardian = guard;
        token = asset;
        runtimeHash = codeHash;
        manifestHash = manifest;
        maxPerBurn = maximum;
        _token();
    }

    modifier chain97() {
        if (block.chainid != 97) revert WrongChain();
        _;
    }

    function _token() private view returns (IPermanentBurnToken t) {
        if (token.code.length == 0 || token.codehash != runtimeHash) revert InvalidPolicy();
        t = IPermanentBurnToken(token);
        if (t.deploymentChainId() != 97 || t.launchManifestHash() != manifestHash || t.bridgeEnabled()) {
            revert InvalidPolicy();
        }
    }

    function setPaused(bool value) external chain97 nonReentrant {
        if (msg.sender != governor && (msg.sender != guardian || !value)) revert Unauthorized();
        if (!value) _token();
        paused = value;
        emit PauseChanged(value);
    }

    /// @notice Anyone may burn existing inventory while open; there is no transfer/approval/sweep path.
    function burn(uint128 amount) external chain97 nonReentrant {
        if (paused) revert Paused();
        if (amount == 0 || amount > maxPerBurn) revert InvalidAmount();
        IPermanentBurnToken t = _token();
        uint256 balance = t.balanceOf(address(this));
        uint256 supply = t.totalSupply();
        uint256 permanent = t.permanentlyBurned();
        if (balance < amount || supply < amount) revert InvalidAmount();
        t.burn(amount);
        _token();
        if (
            t.balanceOf(address(this)) != balance - amount || t.totalSupply() != supply - amount
                || t.permanentlyBurned() != permanent + amount
        ) revert InexactBurn();
        totalBurned += amount;
        emit InventoryBurned(++burnCount, msg.sender, amount, totalBurned);
    }
}
