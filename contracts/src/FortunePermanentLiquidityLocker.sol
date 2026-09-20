// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {IFortunePositionManager} from "./interfaces/IFortunePositionManager.sol";

/// @notice Permanent custody for Fortune graduation LP-position NFTs.
/// @dev There is intentionally no withdrawal/transfer function for locked positions.
contract FortunePermanentLiquidityLocker is IERC721Receiver, ReentrancyGuard {
    struct LockedPosition {
        address launchToken;
        address feeRecipient;
        bytes32 poolKeyHash;
        uint64 lockedAt;
        bool registered;
    }

    address public immutable factory;
    IFortunePositionManager public immutable positionManager;

    mapping(address => bool) public approvedDepositor;
    mapping(uint256 => LockedPosition) private _positions;
    uint256[] public lockedTokenIds;

    event DepositorApprovalSet(
        address indexed depositor,
        bool approved
    );
    event LiquidityPositionLocked(
        uint256 indexed tokenId,
        address indexed launchToken,
        address indexed feeRecipient,
        bytes32 poolKeyHash
    );
    event LiquidityFeesCollected(
        uint256 indexed tokenId,
        address indexed feeRecipient,
        uint256 amount0,
        uint256 amount1
    );

    constructor(
        address factory_,
        address positionManager_
    ) {
        require(
            factory_ != address(0) &&
                positionManager_ != address(0),
            "ZERO_ADDRESS"
        );

        factory = factory_;
        positionManager =
            IFortunePositionManager(positionManager_);
    }

    function setApprovedDepositor(
        address depositor,
        bool approved
    ) external {
        require(msg.sender == factory, "ONLY_FACTORY");
        require(depositor != address(0), "ZERO_DEPOSITOR");

        approvedDepositor[depositor] = approved;
        emit DepositorApprovalSet(depositor, approved);
    }

    /// @notice Register a position after an approved graduation adapter has
    ///         transferred it into this locker in the same transaction.
    function registerPosition(
        uint256 tokenId,
        address launchToken,
        address feeRecipient,
        bytes32 poolKeyHash
    ) external {
        require(
            approvedDepositor[msg.sender],
            "DEPOSITOR_NOT_APPROVED"
        );
        require(
            positionManager.ownerOf(tokenId) ==
                address(this),
            "POSITION_NOT_LOCKED"
        );
        require(
            !_positions[tokenId].registered,
            "POSITION_ALREADY_REGISTERED"
        );
        require(
            launchToken != address(0) &&
                feeRecipient != address(0),
            "ZERO_ADDRESS"
        );

        _positions[tokenId] = LockedPosition({
            launchToken: launchToken,
            feeRecipient: feeRecipient,
            poolKeyHash: poolKeyHash,
            lockedAt: uint64(block.timestamp),
            registered: true
        });
        lockedTokenIds.push(tokenId);

        emit LiquidityPositionLocked(
            tokenId,
            launchToken,
            feeRecipient,
            poolKeyHash
        );
    }

    /// @notice Anyone may harvest fees, but proceeds always go directly to the
    ///         immutable fee recipient registered for this locked position.
    function collectFees(uint256 tokenId)
        external
        nonReentrant
        returns (uint256 amount0, uint256 amount1)
    {
        LockedPosition memory position =
            _positions[tokenId];
        require(position.registered, "POSITION_NOT_REGISTERED");

        (amount0, amount1) = positionManager.collect(
            IFortunePositionManager.CollectParams({
                tokenId: tokenId,
                recipient: position.feeRecipient,
                amount0Max: type(uint128).max,
                amount1Max: type(uint128).max
            })
        );

        emit LiquidityFeesCollected(
            tokenId,
            position.feeRecipient,
            amount0,
            amount1
        );
    }

    function position(uint256 tokenId)
        external
        view
        returns (LockedPosition memory)
    {
        return _positions[tokenId];
    }

    function lockedPositionCount()
        external
        view
        returns (uint256)
    {
        return lockedTokenIds.length;
    }

    function onERC721Received(
        address operator,
        address,
        uint256,
        bytes calldata
    ) external view returns (bytes4) {
        require(
            msg.sender == address(positionManager),
            "ONLY_POSITION_MANAGER"
        );
        require(
            approvedDepositor[operator],
            "DEPOSITOR_NOT_APPROVED"
        );

        return IERC721Receiver.onERC721Received.selector;
    }
}
