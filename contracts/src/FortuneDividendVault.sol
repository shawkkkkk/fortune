// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IFortuneDividendSnapshotToken {
    function stateNonce()
        external
        view
        returns (uint64);

    function eligibleSupplyAtNonce(
        uint64 nonce
    ) external view returns (uint256);

    function eligibleBalanceAtNonce(
        address account,
        uint64 nonce
    ) external view returns (uint256);
}

/// @notice Pull-based holder reward vault for Fortune tax tokens.
/// @dev Rewards are attached to immutable token-state nonces. Claims never require
///      iterating over holders, and token transfers never call this vault.
contract FortuneDividendVault is ReentrancyGuard {
    using SafeERC20 for IERC20;

    struct Epoch {
        uint64 stateNonce;
        uint192 rewardAmount;
        uint256 eligibleSupply;
    }

    address public immutable factory;
    IFortuneDividendSnapshotToken public immutable launchToken;
    IERC20 public immutable rewardAsset;

    address public processor;
    bool public processorBound;
    uint256 public totalFunded;
    uint256 public totalClaimed;

    Epoch[] public epochs;
    mapping(uint256 => mapping(address => bool)) public claimed;

    event ProcessorBound(address indexed processor);
    event RewardEpochCreated(
        uint256 indexed epochId,
        uint64 indexed stateNonce,
        uint256 rewardAmount,
        uint256 eligibleSupply
    );
    event DividendClaimed(
        address indexed account,
        uint256 amount,
        uint256 epochCount
    );

    constructor(
        address factory_,
        address launchToken_,
        address rewardAsset_
    ) {
        require(
            factory_ != address(0) &&
                launchToken_ != address(0) &&
                rewardAsset_ != address(0),
            "ZERO_ADDRESS"
        );
        require(
            launchToken_.code.length > 0 &&
                rewardAsset_.code.length > 0,
            "MISSING_CODE"
        );

        factory = factory_;
        launchToken =
            IFortuneDividendSnapshotToken(
                launchToken_
            );
        rewardAsset =
            IERC20(rewardAsset_);
    }

    function bindProcessor(
        address processor_
    ) external {
        require(
            msg.sender == factory,
            "ONLY_FACTORY"
        );
        require(
            !processorBound,
            "PROCESSOR_ALREADY_BOUND"
        );
        require(
            processor_ != address(0) &&
                processor_.code.length > 0,
            "BAD_PROCESSOR"
        );

        processor = processor_;
        processorBound = true;

        emit ProcessorBound(
            processor_
        );
    }

    function fund(
        uint256 amount
    ) external nonReentrant returns (uint256 epochId) {
        require(
            msg.sender == processor,
            "ONLY_PROCESSOR"
        );
        require(
            amount > 0,
            "ZERO_REWARD"
        );

        uint64 nonce =
            launchToken.stateNonce();
        uint256 eligibleSupply =
            launchToken
                .eligibleSupplyAtNonce(
                    nonce
                );

        require(
            eligibleSupply > 0,
            "NO_ELIGIBLE_HOLDERS"
        );
        require(
            amount <=
                type(uint192).max,
            "REWARD_TOO_LARGE"
        );

        uint256 beforeBalance =
            rewardAsset.balanceOf(
                address(this)
            );

        rewardAsset.safeTransferFrom(
            msg.sender,
            address(this),
            amount
        );

        require(
            rewardAsset.balanceOf(
                address(this)
            ) -
                beforeBalance ==
                amount,
            "NON_STANDARD_REWARD"
        );

        epochs.push(
            Epoch({
                stateNonce: nonce,
                rewardAmount: uint192(amount),
                eligibleSupply: eligibleSupply
            })
        );

        epochId =
            epochs.length - 1;
        totalFunded +=
            amount;

        emit RewardEpochCreated(
            epochId,
            nonce,
            amount,
            eligibleSupply
        );
    }

    function claim(
        uint256[] calldata epochIds
    )
        external
        nonReentrant
        returns (uint256 amount)
    {
        require(
            epochIds.length > 0 &&
                epochIds.length <= 100,
            "BAD_EPOCH_BATCH"
        );

        for (
            uint256 i;
            i < epochIds.length;
            ++i
        ) {
            uint256 epochId =
                epochIds[i];
            require(
                epochId <
                    epochs.length,
                "BAD_EPOCH"
            );

            if (
                claimed[epochId][
                    msg.sender
                ]
            ) {
                continue;
            }

            claimed[epochId][
                msg.sender
            ] = true;

            Epoch memory epoch =
                epochs[epochId];

            uint256 balance =
                launchToken
                    .eligibleBalanceAtNonce(
                        msg.sender,
                        epoch.stateNonce
                    );

            if (balance == 0) {
                continue;
            }

            amount +=
                uint256(
                    epoch.rewardAmount
                ) *
                balance /
                epoch.eligibleSupply;
        }

        require(
            amount > 0,
            "NOTHING_TO_CLAIM"
        );

        totalClaimed +=
            amount;

        rewardAsset.safeTransfer(
            msg.sender,
            amount
        );

        emit DividendClaimed(
            msg.sender,
            amount,
            epochIds.length
        );
    }

    function claimable(
        address account,
        uint256[] calldata epochIds
    ) external view returns (uint256 amount) {
        for (
            uint256 i;
            i < epochIds.length;
            ++i
        ) {
            uint256 epochId =
                epochIds[i];

            if (
                epochId >=
                    epochs.length ||
                claimed[epochId][
                    account
                ]
            ) {
                continue;
            }

            Epoch memory epoch =
                epochs[epochId];

            uint256 balance =
                launchToken
                    .eligibleBalanceAtNonce(
                        account,
                        epoch.stateNonce
                    );

            if (balance > 0) {
                amount +=
                    uint256(
                        epoch.rewardAmount
                    ) *
                    balance /
                    epoch.eligibleSupply;
            }
        }
    }

    function epochCount()
        external
        view
        returns (uint256)
    {
        return epochs.length;
    }
}
