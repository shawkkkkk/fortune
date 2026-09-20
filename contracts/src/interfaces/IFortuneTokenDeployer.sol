// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IFortuneTokenDeployer {
    function deploy(
        address fortuneFactory,
        string calldata name,
        string calldata symbol,
        uint256 supply,
        bytes32 manifest,
        bytes32 salt
    ) external returns (address token);

    function predict(
        address fortuneFactory,
        string calldata name,
        string calldata symbol,
        uint256 supply,
        bytes32 manifest,
        bytes32 salt
    ) external view returns (address token);
}
