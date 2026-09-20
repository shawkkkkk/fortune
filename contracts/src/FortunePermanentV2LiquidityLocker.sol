// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @notice Permanent custody for fungible Pancake V2 LP tokens created by
///         Fortune tax-token graduations.
/// @dev There is deliberately no LP withdrawal, transfer or rescue function.
contract FortunePermanentV2LiquidityLocker is ReentrancyGuard {
    struct LockedPair {
        address launchToken;
        address quoteAsset;
        address pair;
        uint256 lpAmount;
        uint64 lockedAt;
        bool registered;
    }

    address public immutable factory;

    mapping(address => bool) public approvedDepositor;
    mapping(address => LockedPair) private _locks;
    address[] public lockedPairs;
    mapping(address => uint256) public accountedLp;

    event DepositorApprovalSet(
        address indexed depositor,
        bool approved
    );
    event V2LiquidityLocked(
        address indexed pair,
        address indexed launchToken,
        address indexed quoteAsset,
        uint256 lpAmount
    );

    constructor(
        address factory_
    ) {
        require(
            factory_ != address(0),
            "ZERO_FACTORY"
        );
        factory = factory_;
    }

    function setApprovedDepositor(
        address depositor,
        bool approved
    ) external {
        require(
            msg.sender == factory,
            "ONLY_FACTORY"
        );
        require(
            depositor != address(0),
            "ZERO_DEPOSITOR"
        );

        approvedDepositor[
            depositor
        ] = approved;

        emit DepositorApprovalSet(
            depositor,
            approved
        );
    }

    /// @notice Registers LP tokens already transferred/minted into this locker.
    function registerLiquidity(
        address pair,
        address launchToken,
        address quoteAsset,
        uint256 lpAmount
    ) external nonReentrant {
        require(
            approvedDepositor[
                msg.sender
            ],
            "DEPOSITOR_NOT_APPROVED"
        );
        require(
            pair != address(0) &&
                launchToken != address(0) &&
                quoteAsset != address(0),
            "ZERO_ADDRESS"
        );
        require(
            pair.code.length > 0,
            "PAIR_NO_CODE"
        );
        require(
            lpAmount > 0,
            "ZERO_LP"
        );

        uint256 nextAccounted =
            accountedLp[pair] +
            lpAmount;

        require(
            IERC20(pair)
                .balanceOf(
                    address(this)
                ) >=
                nextAccounted,
            "LP_NOT_RECEIVED"
        );

        accountedLp[pair] =
            nextAccounted;

        LockedPair storage record =
            _locks[pair];

        if (!record.registered) {
            record.launchToken =
                launchToken;
            record.quoteAsset =
                quoteAsset;
            record.pair =
                pair;
            record.lockedAt =
                uint64(
                    block.timestamp
                );
            record.registered =
                true;
            lockedPairs.push(
                pair
            );
        } else {
            require(
                record.launchToken ==
                    launchToken &&
                    record.quoteAsset ==
                    quoteAsset,
                "PAIR_METADATA_MISMATCH"
            );
        }

        record.lpAmount +=
            lpAmount;

        emit V2LiquidityLocked(
            pair,
            launchToken,
            quoteAsset,
            lpAmount
        );
    }

    function lockedPair(
        address pair
    )
        external
        view
        returns (LockedPair memory)
    {
        return _locks[pair];
    }

    function lockedPairCount()
        external
        view
        returns (uint256)
    {
        return lockedPairs.length;
    }
}
