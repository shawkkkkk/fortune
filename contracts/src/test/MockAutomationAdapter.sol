// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IFortuneAutomationAdapter} from "../interfaces/IFortuneAutomationAdapter.sol";

contract MockAutomationAdapter is IFortuneAutomationAdapter {
    uint8 public lastPurpose;
    address public lastLaunchToken;
    address public lastAsset;
    uint256 public lastAmount;
    address public lastCaller;

    function execute(
        uint8 purpose,
        address launchToken,
        address inputAsset,
        uint256 amount,
        bytes calldata
    ) external {
        lastCaller = msg.sender;
        lastPurpose = purpose;
        lastLaunchToken = launchToken;
        lastAsset = inputAsset;
        lastAmount = amount;
    }
}
