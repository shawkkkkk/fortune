// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @notice Unaudited chain97 scoped-work settlement, not agent spending or verified delivery.
contract FortuneTestnetWorkEscrow is ReentrancyGuard {
    using SafeERC20 for IERC20;
    enum State {
        Missing,
        Funded,
        Accepted,
        Disputed,
        Settled
    }

    struct Asset {
        address token;
        bytes32 codeHash;
        uint128 maxPerJob;
    }

    struct Job {
        address client;
        address worker;
        address asset;
        uint128 amount;
        uint64 acceptBy;
        uint64 deliverBy;
        bytes32 termsHash;
        State state;
    }
    address public immutable governor;
    address public immutable guardian;
    address public immutable arbitrator;
    bool public paused = true;
    uint256 public nextJob = 1;
    mapping(address => bytes32) public assetCodeHash;
    mapping(address => uint128) public maxPerJob;
    mapping(address => uint256) public reserved;
    mapping(uint256 => Job) public jobs;
    mapping(address => mapping(bytes32 => uint256)) public fundingJobs;
    error FundingIdUsed();
    event FundingBound(uint256 indexed id, address indexed client, bytes32 indexed fundingId);
    mapping(uint256 => uint256) public latestResultRevision;
    mapping(uint256 => mapping(uint256 => bytes32)) public resultHashes;
    error InvalidResult();
    event ResultSubmitted(uint256 indexed id, address indexed worker, uint256 indexed revision, bytes32 resultHash);
    event ResultApproved(uint256 indexed id, uint256 indexed revision, bytes32 resultHash);
    error WrongChain();
    error Unauthorized();
    error Paused();
    error InvalidConfiguration();
    error InvalidJob();
    error WrongState();
    error UntrustedAsset();
    error InexactTransfer();
    error Insolvent();
    event PauseChanged(bool paused);
    event JobFunded(
        uint256 indexed id,
        address indexed client,
        address indexed worker,
        address asset,
        uint256 amount,
        bytes32 termsHash,
        uint64 acceptBy,
        uint64 deliverBy
    );
    event JobAccepted(uint256 indexed id);
    event JobDisputed(uint256 indexed id, address indexed openedBy);
    event JobSettled(uint256 indexed id, uint256 workerAmount, uint256 clientRefund, address indexed settledBy);

    constructor(address gov, address guard, address arb, Asset[] memory assets) {
        if (block.chainid != 97) revert WrongChain();
        if (
            gov == address(0) || guard == address(0) || arb == address(0) || gov == guard || gov == arb || guard == arb
                || gov == address(this) || guard == address(this) || arb == address(this) || assets.length == 0
                || assets.length > 10
        ) revert InvalidConfiguration();
        governor = gov;
        guardian = guard;
        arbitrator = arb;
        address previous;
        for (uint256 i; i < assets.length; ++i) {
            Asset memory a = assets[i];
            if (
                a.token <= previous || a.token == gov || a.token == guard || a.token == arb || a.token.code.length == 0
                    || a.codeHash == bytes32(0) || a.token.codehash != a.codeHash || a.maxPerJob == 0
            ) revert InvalidConfiguration();
            assetCodeHash[a.token] = a.codeHash;
            maxPerJob[a.token] = a.maxPerJob;
            previous = a.token;
        }
    }
    modifier chain97() {
        if (block.chainid != 97) revert WrongChain();
        _;
    }
    modifier open() {
        if (paused) revert Paused();
        _;
    }

    function setPaused(bool value) external chain97 nonReentrant {
        if (msg.sender != governor && (msg.sender != guardian || !value)) revert Unauthorized();
        paused = value;
        emit PauseChanged(value);
    }

    function _asset(address token) private view returns (IERC20) {
        if (assetCodeHash[token] == bytes32(0) || token.code.length == 0 || token.codehash != assetCodeHash[token]) {
            revert UntrustedAsset();
        }
        return IERC20(token);
    }

    function fund(address worker, address token, uint128 amount, bytes32 termsHash, uint64 acceptBy, uint64 deliverBy)
        external
        chain97
        open
        nonReentrant
        returns (uint256 id)
    {
        return _fund(worker, token, amount, termsHash, acceptBy, deliverBy);
    }

    /// @notice Optional permanent client-scoped ID; all successful-ID reuse rejects.
    function fundWithId(
        bytes32 fundingId,
        address worker,
        address token,
        uint128 amount,
        bytes32 termsHash,
        uint64 acceptBy,
        uint64 deliverBy
    ) external chain97 open nonReentrant returns (uint256 id) {
        if (fundingId == bytes32(0)) revert InvalidJob();
        if (fundingJobs[msg.sender][fundingId] != 0) revert FundingIdUsed();
        fundingJobs[msg.sender][fundingId] = nextJob;
        id = _fund(worker, token, amount, termsHash, acceptBy, deliverBy);
        emit FundingBound(id, msg.sender, fundingId);
    }

    function _fund(address worker, address token, uint128 amount, bytes32 termsHash, uint64 acceptBy, uint64 deliverBy)
        private
        returns (uint256 id)
    {
        if (
            worker == address(0) || worker == msg.sender || worker == address(this) || worker == arbitrator
                || msg.sender == arbitrator || msg.sender == address(this) || termsHash == bytes32(0) || amount == 0
                || amount > maxPerJob[token] || acceptBy <= block.timestamp || acceptBy > block.timestamp + 1 days
                || deliverBy <= acceptBy || deliverBy > block.timestamp + 7 days
        ) revert InvalidJob();
        IERC20 asset = _asset(token);
        uint256 beforeBalance = asset.balanceOf(address(this));
        uint256 beforeClient = asset.balanceOf(msg.sender);
        if (beforeBalance < reserved[token]) revert Insolvent();
        asset.safeTransferFrom(msg.sender, address(this), amount);
        if (
            asset.balanceOf(address(this)) != beforeBalance + amount || beforeClient < amount
                || asset.balanceOf(msg.sender) != beforeClient - amount
        ) revert InexactTransfer();
        id = nextJob++;
        jobs[id] = Job(msg.sender, worker, token, amount, acceptBy, deliverBy, termsHash, State.Funded);
        reserved[token] += amount;
        emit JobFunded(id, msg.sender, worker, token, amount, termsHash, acceptBy, deliverBy);
    }

    function accept(uint256 id) external chain97 open nonReentrant {
        Job storage j = jobs[id];
        if (msg.sender != j.worker) revert Unauthorized();
        if (j.state != State.Funded || block.timestamp > j.acceptBy) revert WrongState();
        _asset(j.asset);
        j.state = State.Accepted;
        emit JobAccepted(id);
    }

    /// @notice Client may cancel before acceptance; after expiry anyone can return the exact client payment.
    function cancel(uint256 id) external chain97 open nonReentrant {
        Job storage j = jobs[id];
        if (j.state != State.Funded) revert WrongState();
        if (msg.sender != j.client && block.timestamp <= j.acceptBy) revert Unauthorized();
        _settle(id, 0);
    }

    event PaymentWaived(uint256 indexed id, address indexed worker, uint256 resultRevision);

    /// @notice Worker voluntarily returns all principal to the original client; no work/IP verdict.
    function waivePayment(uint256 id, uint256 expectedRevision) external chain97 open nonReentrant {
        Job storage j = jobs[id];
        if (msg.sender != j.worker) revert Unauthorized();
        if (j.state != State.Accepted) revert WrongState();
        if (expectedRevision != latestResultRevision[id]) revert InvalidResult();
        _settle(id, 0);
        emit PaymentWaived(id, msg.sender, expectedRevision);
    }

    /// @notice Explicit client approval after worker acceptance, never an inferred delivery verdict.
    function approvePayment(uint256 id) external chain97 open nonReentrant {
        Job storage j = jobs[id];
        if (msg.sender != j.client) revert Unauthorized();
        if (j.state != State.Accepted) revert WrongState();
        _settle(id, j.amount);
    }

    /// @notice Worker-supplied commitment only: not proof of delivery, identity, IP or quality.
    function submitResult(uint256 id, uint256 expectedRevision, bytes32 resultHash) external chain97 open nonReentrant {
        Job storage j = jobs[id];
        if (msg.sender != j.worker) revert Unauthorized();
        if (j.state != State.Accepted || block.timestamp > j.deliverBy) revert WrongState();
        uint256 previous = latestResultRevision[id];
        if (
            expectedRevision != previous || previous >= 32 || resultHash == bytes32(0)
                || resultHash == resultHashes[id][previous]
        ) revert InvalidResult();
        _asset(j.asset);
        uint256 revision = previous + 1;
        latestResultRevision[id] = revision;
        resultHashes[id][revision] = resultHash;
        emit ResultSubmitted(id, msg.sender, revision, resultHash);
    }

    /// @notice Optional payment consent bound to the exact latest worker revision.
    function approveResult(uint256 id, uint256 revision, bytes32 resultHash) external chain97 open nonReentrant {
        Job storage j = jobs[id];
        if (msg.sender != j.client) revert Unauthorized();
        if (j.state != State.Accepted) revert WrongState();
        if (
            revision == 0 || revision != latestResultRevision[id] || resultHash == bytes32(0)
                || resultHashes[id][revision] != resultHash
        ) revert InvalidResult();
        _settle(id, j.amount);
        emit ResultApproved(id, revision, resultHash);
    }

    function dispute(uint256 id) external chain97 open nonReentrant {
        Job storage j = jobs[id];
        if (j.state != State.Accepted) revert WrongState();
        if (msg.sender != j.client && msg.sender != j.worker && block.timestamp <= j.deliverBy) revert Unauthorized();
        _asset(j.asset);
        j.state = State.Disputed;
        emit JobDisputed(id, msg.sender);
    }

    /// @notice Fixed trusted arbitrator chooses the split; this contract does not verify work or fairness.
    function resolve(uint256 id, uint128 workerAmount) external chain97 open nonReentrant {
        if (msg.sender != arbitrator) revert Unauthorized();
        if (jobs[id].state != State.Disputed) revert WrongState();
        _settle(id, workerAmount);
    }

    function _settle(uint256 id, uint128 workerAmount) private {
        Job storage j = jobs[id];
        if (workerAmount > j.amount) revert InvalidJob();
        IERC20 asset = _asset(j.asset);
        if (asset.balanceOf(address(this)) < reserved[j.asset]) revert Insolvent();
        uint256 refund = uint256(j.amount) - workerAmount;
        j.state = State.Settled;
        reserved[j.asset] -= j.amount;
        _pay(asset, j.worker, workerAmount);
        _pay(asset, j.client, refund);
        emit JobSettled(id, workerAmount, refund, msg.sender);
    }

    function _pay(IERC20 asset, address to, uint256 amount) private {
        if (amount == 0) return;
        uint256 beforeVault = asset.balanceOf(address(this));
        uint256 beforeRecipient = asset.balanceOf(to);
        asset.safeTransfer(to, amount);
        if (asset.balanceOf(address(this)) != beforeVault - amount || asset.balanceOf(to) != beforeRecipient + amount) {
            revert InexactTransfer();
        }
    }
}
