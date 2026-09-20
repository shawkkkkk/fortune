// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IFortuneFeeRouterDeployer {
    function deploy(
        address factory,
        address creator,
        address holderVault,
        address buybackVault,
        address liquidityVault,
        address treasury,
        address protocolTreasury,
        uint16[6] calldata feeBps
    ) external returns (address router);
}
