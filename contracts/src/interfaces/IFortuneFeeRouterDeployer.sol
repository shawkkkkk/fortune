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

    function deployDividendVault(
        address factory,
        address launchToken,
        address rewardAsset
    ) external returns (address vault);

    function deployTaxProcessor(
        address factory,
        address launchToken,
        address quoteAsset,
        address dividendVault,
        address creator,
        address liquidityVault,
        address treasury,
        address protocolTreasury,
        address executor,
        uint16[7] calldata allocationBps
    ) external returns (address processor);
}
