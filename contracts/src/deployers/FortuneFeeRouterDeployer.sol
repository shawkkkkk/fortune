// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FortuneFeeRouter} from "../FortuneFeeRouter.sol";
import {FortuneDividendVault} from "../FortuneDividendVault.sol";
import {FortuneTaxProcessor} from "../FortuneTaxProcessor.sol";
import {IFortuneFeeRouterDeployer} from "../interfaces/IFortuneFeeRouterDeployer.sol";

contract FortuneFeeRouterDeployer is IFortuneFeeRouterDeployer {
    function deploy(
        address factory,
        address creator,
        address holderVault,
        address buybackVault,
        address liquidityVault,
        address treasury,
        address protocolTreasury,
        uint16[6] calldata feeBps
    ) external returns (address router) {
        router = address(
            new FortuneFeeRouter(
                factory,
                creator,
                holderVault,
                buybackVault,
                liquidityVault,
                treasury,
                protocolTreasury,
                feeBps
            )
        );
    }

    function deployDividendVault(
        address factory,
        address launchToken,
        address rewardAsset
    ) external returns (address vault) {
        require(
            msg.sender == factory,
            "ONLY_FACTORY"
        );

        vault = address(
            new FortuneDividendVault(
                factory,
                launchToken,
                rewardAsset
            )
        );
    }

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
    ) external returns (address processor) {
        require(
            msg.sender == factory,
            "ONLY_FACTORY"
        );

        processor = address(
            new FortuneTaxProcessor(
                factory,
                launchToken,
                quoteAsset,
                dividendVault,
                creator,
                liquidityVault,
                treasury,
                protocolTreasury,
                executor,
                allocationBps
            )
        );
    }
}
