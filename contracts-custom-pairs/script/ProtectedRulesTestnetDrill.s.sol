// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {FortuneCustomPairFactory} from "../src/FortuneCustomPairFactory.sol";
import {FortuneCustomPairCurve} from "../src/FortuneCustomPairCurve.sol";
import {FortuneCustomPairToken} from "../src/FortuneCustomPairToken.sol";
import {FortuneLaunchRules} from "../src/FortuneLaunchRules.sol";

/// @notice BSC Testnet proof that rules bind at launch, reject an ordinary
///         wallet transfer, and expire after an actual Pancake V2 graduation.
contract ProtectedRulesTestnetDrill is Script {
    function launch() external {
        require(block.chainid == 97, "BSC_TESTNET_ONLY");
        uint256 key = vm.envUint("PRIVATE_KEY");
        FortuneCustomPairFactory factory = FortuneCustomPairFactory(vm.envAddress("CUSTOM_PAIR_FACTORY"));
        address pairToken = vm.envAddress("TESTNET_PLAIN_TOKEN");

        FortuneCustomPairFactory.LaunchParams memory p;
        p.name = "Fortune Protected Drill";
        p.symbol = "GUARD";
        p.supply = 1_000_000_000e18;
        p.pairToken = pairToken;
        p.graduationTarget = 200e18;
        p.description = "Protected launch rules BSC Testnet drill.";

        FortuneLaunchRules.Rules memory rule;
        rule.curveOnly = true;
        (bool ready, bytes32 reason) = factory.preflightWithRules(p, abi.encode(rule));
        require(ready, string(abi.encodePacked(reason)));

        vm.startBroadcast(key);
        IERC20(pairToken).approve(address(factory), 1e18);
        (address token, address curve, uint256 bought) = factory.createLaunchWithRules(p, abi.encode(rule), 1e18, 1);
        vm.stopBroadcast();

        require(bought > 0, "NO_FIRST_BUY");
        require(FortuneCustomPairToken(token).rules() == address(factory.launchRules()), "RULES_NOT_BOUND");
        require(factory.launchRules().active(token), "RULES_NOT_ACTIVE");
        console2.log("PROTECTED_DRILL_TOKEN=%s", token);
        console2.log("PROTECTED_DRILL_CURVE=%s", curve);
    }

    function complete() external {
        require(block.chainid == 97, "BSC_TESTNET_ONLY");
        uint256 key = vm.envUint("PRIVATE_KEY");
        address sender = vm.addr(key);
        FortuneCustomPairCurve curve = FortuneCustomPairCurve(vm.envAddress("PROTECTED_DRILL_CURVE"));
        FortuneCustomPairToken token = FortuneCustomPairToken(address(curve.launchToken()));
        FortuneCustomPairFactory factory = FortuneCustomPairFactory(vm.envAddress("CUSTOM_PAIR_FACTORY"));
        FortuneLaunchRules rules = factory.launchRules();
        require(curve.launchElapsedSeconds() >= curve.EARLY_WALLET_CAP_SECONDS(), "WAIT_FOR_LAUNCH_SHIELD");
        require(rules.active(address(token)), "RULES_NOT_ACTIVE");

        // This is an eth_call simulation against the deployed token state.
        vm.prank(sender);
        (bool ok, bytes memory reason) = address(token).call(
            abi.encodeWithSelector(token.transfer.selector, address(0xBEEF), 1)
        );
        require(!ok && reason.length >= 4 && bytes4(reason) == FortuneLaunchRules.RulesCurveOnly.selector,
            "CURVE_ONLY_NOT_ENFORCED");
        console2.log("PROTECTED_RULE_REJECTION_SIMULATED_AGAINST_DEPLOYED_STATE");

        IERC20 pair = curve.pairToken();
        vm.startBroadcast(key);
        pair.approve(address(curve), type(uint256).max);
        curve.buy(400e18, 1);
        require(curve.graduationReady(), "NOT_READY");
        curve.graduate();
        require(token.transfer(address(0xBEEF), 1), "POST_GRAD_TRANSFER_FAILED");
        vm.stopBroadcast();

        require(curve.graduated() && !rules.active(address(token)), "RULES_DID_NOT_EXPIRE");
        require(token.balanceOf(address(0xBEEF)) == 1, "POST_GRAD_TRANSFER_MISSING");
        console2.log("PROTECTED_DRILL_POOL=%s", curve.pool());
        console2.log("PROTECTED_RULES_ONCHAIN_EXECUTION_COMPLETE_AND_SUCCESSFUL");
    }
}
