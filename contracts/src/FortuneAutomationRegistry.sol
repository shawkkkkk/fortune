// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @notice Protocol-level allowlist of automation adapters by purpose.
/// @dev Adapter changes are visible onchain. Production ownership should be a timelock/multisig.
contract FortuneAutomationRegistry is Ownable2Step {
    enum Purpose {
        HolderRewards,
        BuybackBurn,
        LiquidityReinforcement
    }

    mapping(uint8 => mapping(address => bool)) public approved;

    event AdapterApprovalSet(
        Purpose indexed purpose,
        address indexed adapter,
        bool approved
    );

    constructor(address initialOwner) Ownable(initialOwner) {}

    function setAdapter(
        Purpose purpose,
        address adapter,
        bool isApproved
    ) external onlyOwner {
        require(adapter != address(0), "ZERO_ADAPTER");
        approved[uint8(purpose)][adapter] = isApproved;
        emit AdapterApprovalSet(purpose, adapter, isApproved);
    }

    function isApproved(Purpose purpose, address adapter)
        external
        view
        returns (bool)
    {
        return approved[uint8(purpose)][adapter];
    }
}
