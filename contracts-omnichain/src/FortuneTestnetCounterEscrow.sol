// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @notice Unaudited BSC Testnet funded holder-round settlement primitive.
/// @dev Governor supplies eligibility/allocation, not proven by this escrow. No swaps, fees, winners or recovery drain.
contract FortuneTestnetCounterEscrow is ReentrancyGuard {
    using SafeERC20 for IERC20;

    struct Asset {
        address token;
        bytes32 codeHash;
    }

    struct Round {
        address asset;
        uint256 funded;
        uint256 remaining;
        bytes32 allocationHash;
    }

    struct Snapshot {
        uint256 expectedRound;
        uint256 blockNumber;
        bytes32 blockHash;
        uint256 deadline;
    }

    address public immutable governor;
    address public immutable guardian;
    address public immutable launchToken;
    bool public paused = true;
    uint256 public nextRound = 1;
    mapping(address => bytes32) public assetCodeHash;
    mapping(address => bool) public excluded;
    mapping(address => uint256) public reserved;
    mapping(uint256 => Round) public rounds;
    mapping(uint256 => mapping(address => uint256)) public claimable;

    mapping(uint256 => Snapshot) public roundSnapshots;

    error InvalidSnapshot();
    error InvalidConfiguration();
    error WrongChain();
    error Unauthorized();
    error WrongPauseState();
    error InvalidAllocation();
    error UntrustedAsset();
    error InexactTransfer();
    error Insolvent();
    error NothingToClaim();

    event SnapshotBound(uint256 indexed round, uint256 blockNumber, bytes32 blockHash, uint256 deadline);
    event PauseChanged(bool paused);
    event RoundFunded(
        uint256 indexed round, address indexed asset, uint256 amount, uint256 recipients, bytes32 allocationHash
    );
    event Claimed(uint256 indexed round, address indexed recipient, address indexed asset, uint256 amount);

    constructor(
        address governor_,
        address guardian_,
        address launchToken_,
        Asset[] memory assets,
        address[] memory exclusions
    ) {
        if (block.chainid != 97) revert WrongChain();
        if (
            governor_ == address(0) || guardian_ == address(0) || governor_ == guardian_
                || launchToken_.code.length == 0 || assets.length < 2 || assets.length > 10 || exclusions.length > 32
        ) {
            revert InvalidConfiguration();
        }
        governor = governor_;
        guardian = guardian_;
        launchToken = launchToken_;
        excluded[address(0)] = true;
        excluded[address(this)] = true;
        excluded[launchToken_] = true;
        address previous;
        for (uint256 i; i < assets.length; ++i) {
            Asset memory a = assets[i];
            if (
                a.token <= previous || a.token == launchToken_ || a.token.code.length == 0 || a.codeHash == bytes32(0)
                    || a.token.codehash != a.codeHash
            ) revert InvalidConfiguration();
            assetCodeHash[a.token] = a.codeHash;
            previous = a.token;
        }
        previous = address(0);
        for (uint256 i; i < exclusions.length; ++i) {
            address account = exclusions[i];
            if (account <= previous || excluded[account]) revert InvalidConfiguration();
            excluded[account] = true;
            previous = account;
        }
    }

    modifier onTestnet() {
        if (block.chainid != 97) revert WrongChain();
        _;
    }

    function setPaused(bool value) external onTestnet nonReentrant {
        if (msg.sender != governor && (msg.sender != guardian || !value)) revert Unauthorized();
        paused = value;
        emit PauseChanged(value);
    }

    function _asset(address token) private view returns (IERC20) {
        bytes32 expected = assetCodeHash[token];
        if (expected == bytes32(0) || token.code.length == 0 || token.codehash != expected) revert UntrustedAsset();
        return IERC20(token);
    }

    /// @notice Paused staging; exact funding comes from the governor, never an existing pot or donation.
    /// @dev Sorted, bounded explicit recipients avoid an unverified Merkle-tree sum exceeding its funding.
    function fundRound(address token, address[] calldata recipients, uint256[] calldata amounts)
        external
        onTestnet
        nonReentrant
        returns (uint256 id)
    {
        return _fundRound(token, recipients, amounts);
    }

    /// @notice Optional funding bound to an expected round, recent canonical block and fixed expiry.
    /// @dev A block hash binds a reference, not the truth of holder eligibility or fee provenance.
    function fundSnapshotRound(
        address token,
        address[] calldata recipients,
        uint256[] calldata amounts,
        Snapshot calldata snapshot
    ) external onTestnet nonReentrant returns (uint256 id) {
        if (msg.sender != governor) revert Unauthorized();
        if (!paused) revert WrongPauseState();
        if (
            snapshot.expectedRound != nextRound || snapshot.blockNumber >= block.number
                || block.number - snapshot.blockNumber < 20 || block.number - snapshot.blockNumber > 255
                || snapshot.blockHash == bytes32(0) || blockhash(snapshot.blockNumber) != snapshot.blockHash
                || block.timestamp > snapshot.deadline || snapshot.deadline > block.timestamp + 120
        ) revert InvalidSnapshot();
        id = _fundRound(token, recipients, amounts);
        roundSnapshots[id] = snapshot;
        emit SnapshotBound(id, snapshot.blockNumber, snapshot.blockHash, snapshot.deadline);
    }

    function _fundRound(address token, address[] calldata recipients, uint256[] calldata amounts)
        private
        returns (uint256 id)
    {
        if (msg.sender != governor) revert Unauthorized();
        if (!paused) revert WrongPauseState();
        IERC20 asset = _asset(token);
        uint256 count = recipients.length;
        if (count == 0 || count > 128 || amounts.length != count) revert InvalidAllocation();
        uint256 total;
        address previous;
        for (uint256 i; i < count; ++i) {
            if (recipients[i] <= previous || excluded[recipients[i]] || amounts[i] == 0) revert InvalidAllocation();
            total += amounts[i];
            previous = recipients[i];
        }
        uint256 beforeBalance = asset.balanceOf(address(this));
        if (beforeBalance < reserved[token]) revert Insolvent();
        uint256 beforeFunder = asset.balanceOf(governor);
        asset.safeTransferFrom(governor, address(this), total);
        if (
            asset.balanceOf(address(this)) != beforeBalance + total || beforeFunder < total
                || asset.balanceOf(governor) != beforeFunder - total
        ) revert InexactTransfer();
        id = nextRound++;
        // Domain-bound allocation commitment is disclosure, not independent eligibility evidence.
        bytes32 allocationHash = keccak256(abi.encode(block.chainid, address(this), id, token, recipients, amounts));
        rounds[id] = Round(token, total, total, allocationHash);
        reserved[token] += total;
        for (uint256 i; i < count; ++i) {
            claimable[id][recipients[i]] = amounts[i];
        }
        emit RoundFunded(id, token, total, count, allocationHash);
    }

    /// @notice Anyone may deliver a recipient's whole entitlement, only to that recipient.
    function claim(uint256 id, address recipient) external onTestnet nonReentrant {
        if (paused) revert WrongPauseState();
        _claim(id, recipient);
    }

    /// @notice Atomically deliver 1–32 sorted round entitlements to one fixed recipient.
    /// @dev Any missing entitlement or failed transfer reverts the entire batch; no partial progress.
    function claimMany(uint256[] calldata ids, address recipient) external onTestnet nonReentrant {
        if (paused) revert WrongPauseState();
        if (ids.length == 0 || ids.length > 32) revert InvalidAllocation();
        uint256 previous;
        for (uint256 i; i < ids.length; ++i) {
            if (ids[i] <= previous) revert InvalidAllocation();
            previous = ids[i];
        }
        for (uint256 i; i < ids.length; ++i) {
            _claim(ids[i], recipient);
        }
    }

    function _claim(uint256 id, address recipient) private {
        uint256 amount = claimable[id][recipient];
        if (amount == 0) revert NothingToClaim();
        Round storage round = rounds[id];
        IERC20 asset = _asset(round.asset);
        uint256 beforeBalance = asset.balanceOf(address(this));
        if (beforeBalance < reserved[round.asset]) revert Insolvent();
        uint256 beforeRecipient = asset.balanceOf(recipient);
        claimable[id][recipient] = 0;
        round.remaining -= amount;
        reserved[round.asset] -= amount;
        asset.safeTransfer(recipient, amount);
        if (
            asset.balanceOf(address(this)) != beforeBalance - amount
                || asset.balanceOf(recipient) != beforeRecipient + amount
        ) revert InexactTransfer();
        emit Claimed(id, recipient, round.asset, amount);
    }
}
