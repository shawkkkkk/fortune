// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FortuneAutomationVault} from "../FortuneAutomationVault.sol";
import {FortuneAutomationRegistry} from "../FortuneAutomationRegistry.sol";
import {IFortuneVaultDeployer} from "../interfaces/IFortuneVaultDeployer.sol";

contract FortuneVaultDeployer is IFortuneVaultDeployer {
    function deploy(
        address registry,
        uint8 purpose,
        address launchToken,
        address executor
    ) external returns (address vault) {
        vault = address(
            new FortuneAutomationVault(
                registry,
                FortuneAutomationRegistry.Purpose(purpose),
                launchToken,
                executor
            )
        );
    }
}
