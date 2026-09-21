// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";

import {FortuneAssetRegistry} from "../src/FortuneAssetRegistry.sol";
import {FortuneAutomationRegistry} from "../src/FortuneAutomationRegistry.sol";
import {FortuneMetadataRegistry} from "../src/FortuneMetadataRegistry.sol";
import {FortuneChainlinkOracle} from "../src/FortuneChainlinkOracle.sol";
import {FortuneFactory} from "../src/FortuneFactory.sol";
import {FortuneCurve} from "../src/FortuneCurve.sol";
import {FortunePermanentLiquidityLocker} from "../src/FortunePermanentLiquidityLocker.sol";
import {FortunePancakeV3GraduationAdapter} from "../src/FortunePancakeV3GraduationAdapter.sol";
import {FortuneTokenDeployer} from "../src/deployers/FortuneTokenDeployer.sol";
import {FortuneVaultDeployer} from "../src/deployers/FortuneVaultDeployer.sol";
import {FortuneFeeRouterDeployer} from "../src/deployers/FortuneFeeRouterDeployer.sol";
import {FortuneCurveDeployer} from "../src/deployers/FortuneCurveDeployer.sol";
import {IPancakeV3FactoryLike} from "../src/interfaces/IPancakeV3FactoryLike.sol";

interface IWBNB {
    function deposit() external payable;
    function approve(address spender, uint256 amount) external returns (bool);
}

contract ForkGovernance {}

/// @notice A no-broadcast rehearsal using live BSC mainnet dependencies.
/// @dev Normal CI skips this when BSC_MAINNET_FORK_RPC_URL is not configured.
///      The dedicated mainnet-fork workflow always supplies a BSC RPC.
contract FortuneMainnetForkTest is Test {
    address constant WBNB =
        0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c;
    address constant BNB_USD_FEED =
        0x0567F2323251f0Aab15c8dFb1967E4e8A7D42aeE;
    address constant PANCAKE_V3_FACTORY =
        0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865;
    address constant PANCAKE_V3_POSITION_MANAGER =
        0x46A15B0b27311cedF172AB29E4f4766fbE7F4364;

    address user = address(0xA11CE);

    function testMainnetForkWbnbLaunchAndPancakeGraduation() public {
        string memory rpc =
            vm.envOr(
                "BSC_MAINNET_FORK_RPC_URL",
                string("")
            );

        if (bytes(rpc).length == 0) return;

        vm.createSelectFork(rpc);
        assertEq(block.chainid, 56);

        assertGt(WBNB.code.length, 0);
        assertGt(BNB_USD_FEED.code.length, 0);
        assertGt(PANCAKE_V3_FACTORY.code.length, 0);
        assertGt(PANCAKE_V3_POSITION_MANAGER.code.length, 0);
        assertGt(
            IPancakeV3FactoryLike(PANCAKE_V3_FACTORY)
                .feeAmountTickSpacing(500),
            0
        );

        ForkGovernance governance =
            new ForkGovernance();

        FortuneChainlinkOracle oracle =
            new FortuneChainlinkOracle(address(this));
        FortuneAssetRegistry registry =
            new FortuneAssetRegistry(address(this));
        FortuneAutomationRegistry automationRegistry =
            new FortuneAutomationRegistry(address(this));
        FortuneMetadataRegistry metadataRegistry =
            new FortuneMetadataRegistry(address(this));

        oracle.setFeed(WBNB, BNB_USD_FEED);

        registry.configureAsset(
            WBNB,
            FortuneAssetRegistry.AssetConfig({
                oracle: address(oracle),
                maxOracleAge: 600,
                quoteEnabled: true,
                rewardEnabled: true,
                graduationEnabled: true,
                active: true,
                category: "Majors"
            })
        );

        (
            bool healthy,
            bytes32 reason,
            uint256 price,
            uint256 updatedAt
        ) = registry.assetHealth(WBNB);

        assertTrue(healthy);
        assertEq(reason, bytes32("OK"));
        assertGt(price, 0);
        assertGt(updatedAt, 0);
        assertLe(block.timestamp - updatedAt, 600);

        FortuneTokenDeployer tokenDeployer =
            new FortuneTokenDeployer();
        FortuneVaultDeployer vaultDeployer =
            new FortuneVaultDeployer();
        FortuneFeeRouterDeployer feeRouterDeployer =
            new FortuneFeeRouterDeployer();
        FortuneCurveDeployer curveDeployer =
            new FortuneCurveDeployer();

        FortuneFactory factory =
            new FortuneFactory(
                address(this),
                address(registry),
                address(automationRegistry),
                address(metadataRegistry),
                address(tokenDeployer),
                address(vaultDeployer),
                address(feeRouterDeployer),
                address(curveDeployer),
                address(this),
                address(0xBEEF)
            );

        metadataRegistry.bindFactory(address(factory));

        FortunePermanentLiquidityLocker locker =
            new FortunePermanentLiquidityLocker(
                address(factory),
                PANCAKE_V3_POSITION_MANAGER
            );

        FortunePancakeV3GraduationAdapter adapter =
            new FortunePancakeV3GraduationAdapter(
                address(factory),
                address(registry),
                PANCAKE_V3_FACTORY,
                PANCAKE_V3_POSITION_MANAGER,
                address(locker)
            );

        factory.setLiquidityLockerDepositor(
            address(locker),
            address(adapter),
            true
        );
        factory.setGraduationAdapter(address(adapter));

        address[] memory quotes = new address[](1);
        quotes[0] = WBNB;

        uint16[] memory weights = new uint16[](1);
        weights[0] = 10_000;

        uint16[6] memory fees = [
            uint16(25),
            uint16(25),
            uint16(25),
            uint16(15),
            uint16(0),
            uint16(10)
        ];

        FortuneFactory.LaunchParams memory p =
            FortuneFactory.LaunchParams({
                name: "Fortune Mainnet Fork Canary",
                symbol: "FORK",
                totalSupply: 10_000_000e18,
                quoteAssets: quotes,
                weightsBps: weights,
                primaryQuote: WBNB,
                basePriceUsd1e18: 1e15,
                slopeUsd1e18: 1e7,
                graduationUsd1e18: 50e18,
                adaptiveGraduation: true,
                feeBps: fees,
                treasury: address(this),
                metadataEditable: false,
                description: "Local BSC mainnet fork rehearsal",
                imageURI: "",
                website: "",
                xProfile: "",
                telegram: "",
                github: "",
                youtube: "",
                debox: ""
            });

        (bool ready, bytes32 preflightReason) =
            factory.preflightLaunch(p);
        assertTrue(ready);
        assertEq(preflightReason, bytes32("OK"));

        // Mainnet v1 policy is enforced by the factory itself, not just UI or
        // registry configuration. Keep these assertions on a real chain-56 fork.
        FortuneFactory.LaunchParams memory tooLarge = p;
        tooLarge.graduationUsd1e18 = 10_001e18;
        (bool largeReady, bytes32 largeReason) =
            factory.preflightLaunch(tooLarge);
        assertFalse(largeReady);
        assertEq(largeReason, bytes32("MAINNET_GRADUATION_CAP"));

        FortuneFactory.LaunchParams memory wrongQuote = p;
        address[] memory wrongQuotes = new address[](1);
        wrongQuotes[0] = address(0x1234);
        wrongQuote.quoteAssets = wrongQuotes;
        wrongQuote.primaryQuote = address(0x1234);
        (bool wrongReady, bytes32 wrongReason) =
            factory.preflightLaunch(wrongQuote);
        assertFalse(wrongReady);
        assertEq(wrongReason, bytes32("MAINNET_WBNB_ONLY"));

        FortuneFactory.LaunchParams memory multiQuote = p;
        address[] memory multiQuotes = new address[](2);
        multiQuotes[0] = WBNB;
        multiQuotes[1] = address(0x1234);
        uint16[] memory multiWeights = new uint16[](2);
        multiWeights[0] = 5_000;
        multiWeights[1] = 5_000;
        multiQuote.quoteAssets = multiQuotes;
        multiQuote.weightsBps = multiWeights;
        (bool multiReady, bytes32 multiReason) =
            factory.preflightLaunch(multiQuote);
        assertFalse(multiReady);
        assertEq(multiReason, bytes32("MAINNET_SINGLE_QUOTE"));

        // Memory struct assignments above share memory references. Restore the
        // canonical canary before probing the independent fee ceiling.
        p.quoteAssets = quotes;
        p.weightsBps = weights;
        p.primaryQuote = WBNB;
        p.graduationUsd1e18 = 50e18;

        FortuneFactory.LaunchParams memory highFee = p;
        uint16[6] memory highFees = [
            uint16(50),
            uint16(25),
            uint16(25),
            uint16(15),
            uint16(0),
            uint16(10)
        ];
        highFee.feeBps = highFees;
        (bool highFeeReady, bytes32 highFeeReason) =
            factory.preflightLaunch(highFee);
        assertFalse(highFeeReady);
        assertEq(highFeeReason, bytes32("MAINNET_FEE_CAP"));

        // Restore the canonical fee schedule before execution.
        p.feeBps = fees;

        FortuneFactory.LaunchInfo memory info =
            factory.createLaunch(p);
        FortuneCurve curve =
            FortuneCurve(info.curve);

        vm.deal(user, 1 ether);

        vm.startPrank(user);
        IWBNB(WBNB).deposit{value: 0.2 ether}();
        IWBNB(WBNB).approve(
            address(curve),
            type(uint256).max
        );

        vm.warp(block.timestamp + 16);
        curve.buy(
            WBNB,
            0.2 ether,
            1
        );
        vm.stopPrank();

        assertTrue(curve.graduationReady());
        uint256 reserveUsd = curve.netReserveUsd1e18();
        assertGe(reserveUsd, 50e18);
        // Live Chainlink normalization and ERC-20 integer conversion can leave
        // a sub-pico-dollar rounding remainder on the partial-fill boundary.
        // Keep the bound explicit and tiny rather than requiring exact 1-wei
        // equality across oracle prices and token decimals.
        assertLe(reserveUsd, 50e18 + 1e6);

        uint24[] memory poolFees =
            new uint24[](1);
        poolFees[0] = 500;

        FortunePancakeV3GraduationAdapter.GraduationPlan
            memory plan =
                FortunePancakeV3GraduationAdapter
                    .GraduationPlan({
                        fees: poolFees,
                        maxSqrtPriceDeviationBps: 100,
                        maxDustBps: 100,
                        deadline: uint64(
                            block.timestamp + 1200
                        )
                    });

        // Permissionless finalizers cannot choose a different market shape on
        // mainnet v1. The adapter itself enforces the reviewed plan.
        poolFees[0] = 2500;
        (bool badFeeReady, bytes32 badFeeReason) =
            curve.preflightGraduation(address(adapter), abi.encode(plan));
        assertFalse(badFeeReady);
        assertEq(badFeeReason, bytes32("MAINNET_FEE_TIER"));

        poolFees[0] = 500;
        plan.maxSqrtPriceDeviationBps = 101;
        (bool badDeviationReady, bytes32 badDeviationReason) =
            curve.preflightGraduation(address(adapter), abi.encode(plan));
        assertFalse(badDeviationReady);
        assertEq(badDeviationReason, bytes32("MAINNET_DEVIATION"));

        plan.maxSqrtPriceDeviationBps = 100;
        plan.maxDustBps = 101;
        (bool badDustReady, bytes32 badDustReason) =
            curve.preflightGraduation(address(adapter), abi.encode(plan));
        assertFalse(badDustReady);
        assertEq(badDustReason, bytes32("MAINNET_DUST"));

        plan.maxDustBps = 100;
        (bool finalReady, bytes32 finalReason) =
            curve.preflightGraduation(address(adapter), abi.encode(plan));
        assertTrue(finalReady);
        assertEq(finalReason, bytes32("OK"));

        bool graduated =
            factory.finalizeGraduation(
                address(curve),
                abi.encode(plan)
            );

        assertTrue(graduated);
        assertTrue(curve.graduated());
        assertEq(
            uint256(curve.phase()),
            uint256(FortuneCurve.Phase.PoolCreated)
        );

        address pool =
            IPancakeV3FactoryLike(PANCAKE_V3_FACTORY)
                .getPool(
                    info.token,
                    WBNB,
                    500
                );

        assertTrue(pool != address(0));
        assertGt(pool.code.length, 0);
        assertEq(locker.lockedPositionCount(), 1);

        uint256 lpTokenId =
            locker.lockedTokenIds(0);
        FortunePermanentLiquidityLocker.LockedPosition
            memory locked =
                locker.position(lpTokenId);

        assertTrue(locked.registered);
        assertEq(locked.launchToken, info.token);

        // Exercise the exact production governance handoff shape on the fork.
        factory.setLaunchesPaused(true);
        oracle.transferOwnership(address(governance));
        registry.transferOwnership(address(governance));
        automationRegistry.transferOwnership(address(governance));
        factory.transferOwnership(address(governance));

        assertEq(factory.pendingOwner(), address(governance));
        assertEq(registry.pendingOwner(), address(governance));
        assertEq(oracle.pendingOwner(), address(governance));
        assertEq(
            automationRegistry.pendingOwner(),
            address(governance)
        );
    }
}
