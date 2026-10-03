// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FortuneStockRewardsToken} from "./FortuneStockRewardsToken.sol";

/// @notice Creates Stock Rewards tokens for the factory that calls it, which
///         receives the supply. Keeps the token's bytecode out of the factory.
contract FortuneStockRewardsTokenDeployer {
    function deploy(
        string calldata name,
        string calldata symbol,
        uint256 supply,
        address[] calldata rewardAssets,
        address pancakeV3Factory,
        address pancakeV2Factory,
        address[] calldata excluded
    ) external returns (address token) {
        token = address(
            new FortuneStockRewardsToken(
                name, symbol, supply, msg.sender, rewardAssets, pancakeV3Factory, pancakeV2Factory, excluded
            )
        );
    }
}
