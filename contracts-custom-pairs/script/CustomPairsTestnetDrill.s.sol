// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {FortuneCustomPairFactory} from "../src/FortuneCustomPairFactory.sol";
import {FortuneCustomPairCurve} from "../src/FortuneCustomPairCurve.sol";
import {FortuneSocialFeeVault} from "../src/FortuneSocialFeeVault.sol";
import {IFortuneSocialFeeVault} from "../src/interfaces/IFortuneSocialFeeVault.sol";
import {IPancakeV2PairLike} from "../src/interfaces/IPancakeV2.sol";

/// @notice Real BSC Testnet lifecycle for a launch paired with a transfer-tax
///         token whose creator fee is split between the deployer's wallet and
///         an X account. Run `launch()`, wait out the Launch Shield, then
///         `complete()`.
contract CustomPairsTestnetDrill is Script {
    function launch() external {
        require(block.chainid == 97, "BSC_TESTNET_ONLY");
        uint256 key = vm.envUint("PRIVATE_KEY");
        FortuneCustomPairFactory factory = FortuneCustomPairFactory(vm.envAddress("CUSTOM_PAIR_FACTORY"));
        address pairToken = vm.envAddress("TESTNET_TAX_TOKEN");

        FortuneCustomPairFactory.LaunchParams memory p;
        p.name = "Fortune Custom Pair Drill";
        p.symbol = "DRILL";
        p.supply = 1_000_000_000e18;
        p.pairToken = pairToken;
        p.graduationTarget = 200e18;
        p.creatorFeeBps = 50;
        p.description = "Automated custom-pair beta drill on BSC Testnet.";
        p.feeShares = new IFortuneSocialFeeVault.FeeShare[](2);
        p.feeShares[0] = IFortuneSocialFeeVault.FeeShare(0, "", vm.addr(key), 6_000);
        p.feeShares[1] = IFortuneSocialFeeVault.FeeShare(1, "fortunepad", address(0), 4_000);

        vm.startBroadcast(key);
        IERC20(pairToken).approve(address(factory), 1e18);
        (address token, address curve, uint256 tokensOut) = factory.createLaunchAndBuy(p, 1e18, 1);
        vm.stopBroadcast();

        require(tokensOut > 0, "NO_FIRST_BUY");
        console2.log("CUSTOM_PAIR_DRILL_CURVE=%s", curve);
        console2.log("CUSTOM_PAIR_DRILL_TOKEN=%s", token);
    }

    function complete() external {
        require(block.chainid == 97, "BSC_TESTNET_ONLY");
        uint256 key = vm.envUint("PRIVATE_KEY");
        FortuneCustomPairCurve curve = FortuneCustomPairCurve(vm.envAddress("CUSTOM_PAIR_DRILL_CURVE"));
        IERC20 pair = curve.pairToken();
        IERC20 token = IERC20(address(curve.launchToken()));
        require(curve.launchElapsedSeconds() >= curve.EARLY_WALLET_CAP_SECONDS(), "WAIT_FOR_LAUNCH_SHIELD");

        vm.startBroadcast(key);
        pair.approve(address(curve), type(uint256).max);
        uint256 tokens = curve.buy(20e18, 1);
        token.approve(address(curve), tokens / 2);
        curve.sell(tokens / 2, 1);
        curve.buy(400e18, 1);
        require(curve.graduationReady(), "NOT_READY");
        uint256 finalPrice = curve.spotPriceX18();
        uint256 liquidity = curve.graduate();

        // Creator fees reach the split: the wallet share claims at once, the
        // X share waits in the vault until that account verifies.
        FortuneSocialFeeVault vault = FortuneSocialFeeVault(curve.creatorFeeRecipient());
        uint256 collected = vault.collect(address(curve));
        bytes32 walletId = vault.walletIdentityOf(vm.addr(key));
        address[] memory claimTokens = new address[](1);
        claimTokens[0] = address(pair);
        uint256[] memory paid = vault.claim(walletId, claimTokens);
        vm.stopBroadcast();
        require(collected > 0 && paid[0] > 0, "SOCIAL_SPLIT_NOT_PAID");
        require(vault.owed(vault.identityIdOf(1, "fortunepad"), address(pair)) > 0, "SOCIAL_SHARE_NOT_CREDITED");

        IPancakeV2PairLike pool = IPancakeV2PairLike(curve.pool());
        (uint112 r0, uint112 r1,) = pool.getReserves();
        (uint256 pairReserve, uint256 launchReserve) =
            pool.token0() == address(pair) ? (uint256(r0), uint256(r1)) : (uint256(r1), uint256(r0));
        uint256 poolPrice = pairReserve * 1e36 / launchReserve;
        uint256 diff = poolPrice > finalPrice ? poolPrice - finalPrice : finalPrice - poolPrice;
        require(uint8(curve.phase()) == uint8(FortuneCustomPairCurve.Phase.Graduated), "NOT_GRADUATED");
        require(IERC20(address(pool)).balanceOf(curve.DEAD()) == liquidity, "LP_NOT_BURNED");
        require(diff * 1_000_000 <= finalPrice, "PRICE_DISCONTINUITY");

        console2.log("CUSTOM_PAIR_DRILL_POOL=%s", address(pool));
        console2.log("CUSTOM_PAIR_DRILL_FEES_COLLECTED=%s", collected);
        console2.log("CUSTOM_PAIR_ONCHAIN_EXECUTION_COMPLETE_AND_SUCCESSFUL");
    }
}
