// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";

interface IOwnable2StepLike {
    function owner() external view returns (address);
    function pendingOwner() external view returns (address);
}

/// @notice Validates the Ownable2Step handoff created by DeployProduction and
///         prints the governance calls required to accept ownership.
/// @dev This script never broadcasts and never needs a governance private key.
contract PrepareGovernanceAcceptance is Script {
    function run() external {
        require(block.chainid == 56, "BSC_MAINNET_ONLY");

        address governance = vm.envAddress("FORTUNE_GOVERNANCE");
        require(governance != address(0), "ZERO_GOVERNANCE");
        require(governance.code.length > 0, "GOVERNANCE_MUST_BE_CONTRACT");

        address[4] memory targets = [
            vm.envAddress("FORTUNE_FACTORY"),
            vm.envAddress("FORTUNE_REGISTRY"),
            vm.envAddress("FORTUNE_AUTOMATION_REGISTRY"),
            vm.envAddress("FORTUNE_ORACLE")
        ];

        bytes memory acceptCalldata =
            abi.encodeWithSignature("acceptOwnership()");

        console2.log("FORTUNE GOVERNANCE ACCEPTANCE PREFLIGHT");
        console2.log("Governance", governance);

        for (uint256 i; i < targets.length; ++i) {
            address target = targets[i];
            require(target.code.length > 0, "TARGET_NO_CODE");

            IOwnable2StepLike ownable = IOwnable2StepLike(target);
            address currentOwner = ownable.owner();

            if (currentOwner == governance) {
                console2.log("Already accepted", target);
                continue;
            }

            require(
                ownable.pendingOwner() == governance,
                "GOVERNANCE_NOT_PENDING_OWNER"
            );

            console2.log("Target", target);
            console2.logBytes(acceptCalldata);
        }

        console2.log(
            "Submit each pending acceptOwnership() call through the governance wallet."
        );
        console2.log("No ownership transaction was broadcast.");
    }
}
