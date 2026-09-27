// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {FortuneCustomPairFactory} from "../src/FortuneCustomPairFactory.sol";
import {FortuneSocialFeeVault} from "../src/FortuneSocialFeeVault.sol";
import {FortuneTestnetTaxToken} from "../src/testnet/FortuneTestnetTaxToken.sol";

/// @notice Deploys the UNAUDITED custom-pairs beta to BSC Testnet only: the
///         factory, the social fee vault wired to it, and two faucet test tokens
///         (5% transfer tax and no tax) to pair with.
contract DeployCustomPairsTestnet is Script {
    function run() external {
        require(block.chainid == 97, "BSC_TESTNET_ONLY");
        uint256 key = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(key);
        address pancakeFactory = vm.envAddress("PANCAKE_V2_FACTORY");
        address owner = vm.envOr("CUSTOM_PAIRS_OWNER", deployer);
        address feeRecipient = vm.envOr("CUSTOM_PAIRS_FEE_RECIPIENT", deployer);
        uint256 feeBps = vm.envOr("CUSTOM_PAIRS_PROTOCOL_FEE_BPS", uint256(50));
        // Public address of the key the website's social verifier signs with.
        // The key itself lives only in the server environment. Zero deploys the
        // vault with verification off until the owner sets an attestor.
        address attestor = vm.envOr("SOCIAL_FEE_ATTESTOR", address(0));
        address guardian = vm.envOr("SOCIAL_FEE_GUARDIAN", owner);
        require(pancakeFactory.code.length > 0, "PANCAKE_V2_FACTORY_NO_CODE");

        vm.startBroadcast(key);
        FortuneCustomPairFactory factory =
            new FortuneCustomPairFactory(deployer, pancakeFactory, uint16(feeBps), feeRecipient);
        FortuneSocialFeeVault vault = new FortuneSocialFeeVault(deployer, attestor, guardian);
        vault.setRegistrar(address(factory), true);
        factory.setSocialFeeVault(address(vault));
        if (owner != deployer) {
            // Two-step: the owner accepts both from its own wallet.
            factory.transferOwnership(owner);
            vault.transferOwnership(owner);
        }
        FortuneTestnetTaxToken taxToken =
            new FortuneTestnetTaxToken("Fortune Test Stonk", "tSTONK", 500, 100_000e18);
        FortuneTestnetTaxToken plainToken =
            new FortuneTestnetTaxToken("Fortune Test Share", "tSHARE", 0, 100_000e18);
        vm.stopBroadcast();

        console2.log("CUSTOM_PAIR_FACTORY=%s", address(factory));
        console2.log("CUSTOM_PAIR_CURVE_DEPLOYER=%s", address(factory.curveDeployer()));
        console2.log("SOCIAL_FEE_VAULT=%s", address(vault));
        console2.log("SOCIAL_FEE_ATTESTOR=%s", attestor);
        console2.log("SOCIAL_FEE_GUARDIAN=%s", guardian);
        console2.log("TESTNET_TAX_TOKEN=%s", address(taxToken));
        console2.log("TESTNET_PLAIN_TOKEN=%s", address(plainToken));
    }
}
