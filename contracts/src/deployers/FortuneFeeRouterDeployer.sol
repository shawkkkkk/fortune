// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FortuneFeeRouter} from "../FortuneFeeRouter.sol";
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
}
