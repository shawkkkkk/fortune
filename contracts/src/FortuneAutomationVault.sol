// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {FortuneAutomationRegistry} from "./FortuneAutomationRegistry.sol";
import {IFortuneAutomationAdapter} from "./interfaces/IFortuneAutomationAdapter.sol";

/// @notice Holds one launch's automated fee allocation for one declared purpose.
/// @dev There is deliberately no arbitrary owner sweep.
contract FortuneAutomationVault is ReentrancyGuard {
    using SafeERC20 for IERC20;

    FortuneAutomationRegistry public immutable registry;
    FortuneAutomationRegistry.Purpose public immutable purpose;
    address public immutable launchToken;
    address public immutable executor;

    uint256 public executions;
    uint256 public lastExecutionAt;

    event AutomationExecuted(
        uint256 indexed executionId,
        FortuneAutomationRegistry.Purpose indexed purpose,
        address indexed adapter,
        address inputAsset,
        uint256 amount
    );

    constructor(
        address registry_,
        FortuneAutomationRegistry.Purpose purpose_,
        address launchToken_,
        address executor_
    ) {
        require(
            registry_ != address(0) &&
                launchToken_ != address(0) &&
                executor_ != address(0),
            "ZERO_ADDRESS"
        );

        registry = FortuneAutomationRegistry(registry_);
        purpose = purpose_;
        launchToken = launchToken_;
        executor = executor_;
    }

    function execute(
        address inputAsset,
        uint256 amount,
        address adapter,
        bytes calldata data
    ) external nonReentrant {
        require(msg.sender == executor, "ONLY_EXECUTOR");
        require(inputAsset != address(0) && adapter != address(0), "ZERO_ADDRESS");
        require(amount > 0, "ZERO_AMOUNT");
        require(
            registry.isApproved(purpose, adapter),
            "ADAPTER_NOT_APPROVED"
        );

        IERC20 token = IERC20(inputAsset);
        require(token.balanceOf(address(this)) >= amount, "INSUFFICIENT_BALANCE");

        token.safeTransfer(adapter, amount);

        IFortuneAutomationAdapter(adapter).execute(
            uint8(purpose),
            launchToken,
            inputAsset,
            amount,
            data
        );

        executions += 1;
        lastExecutionAt = block.timestamp;

        emit AutomationExecuted(
            executions,
            purpose,
            adapter,
            inputAsset,
            amount
        );
    }
}
