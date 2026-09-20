// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IFortuneVaultDeployer {
    function deploy(
        address registry,
        uint8 purpose,
        address launchToken,
        address executor
    ) external returns (address vault);
}
