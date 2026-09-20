// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

import {FortuneAssetRegistry} from "../src/FortuneAssetRegistry.sol";
import {FortuneFactory} from "../src/FortuneFactory.sol";
import {FortuneCurve} from "../src/FortuneCurve.sol";
import {FortuneFeeRouter} from "../src/FortuneFeeRouter.sol";
import {FortuneToken} from "../src/FortuneToken.sol";
import {FortuneChainlinkOracle} from "../src/FortuneChainlinkOracle.sol";
import {MockGraduationAdapter} from "../src/MockGraduationAdapter.sol";
import {FortuneAutomationRegistry} from "../src/FortuneAutomationRegistry.sol";
import {FortuneAutomationVault} from "../src/FortuneAutomationVault.sol";
import {MockAutomationAdapter} from "../src/test/MockAutomationAdapter.sol";
import {FortuneStockFloorVault} from "../src/FortuneStockFloorVault.sol";
import {FortunePermanentLiquidityLocker} from "../src/FortunePermanentLiquidityLocker.sol";
import {FortunePancakeV3GraduationAdapter} from "../src/FortunePancakeV3GraduationAdapter.sol";
import {MockPositionManager} from "../src/test/MockPositionManager.sol";
import {
    MockPancakeV3Factory,
    MockPancakeV3Pool,
    MockPancakeV3PositionManager
} from "../src/test/MockPancakeV3.sol";
import {FortunePerpReferenceRegistry} from "../src/FortunePerpReferenceRegistry.sol";
import {FortuneMetadataRegistry} from "../src/FortuneMetadataRegistry.sol";
import {MockReferenceOracle} from "../src/test/MockReferenceOracle.sol";
import {IFortunePriceOracle} from "../src/interfaces/IFortunePriceOracle.sol";

contract MockERC20 is ERC20 {
    constructor(string memory n, string memory s) ERC20(n, s) {}
    function mint(address to, uint256 amount) external { _mint(to, amount); }
}

contract MockFeeToken is ERC20 {
    constructor() ERC20("Fee Token", "FEE") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function _update(address from, address to, uint256 value) internal override {
        if (from != address(0) && to != address(0)) {
            uint256 fee = value / 100;
            super._update(from, address(0xdead), fee);
            super._update(from, to, value - fee);
        } else {
            super._update(from, to, value);
        }
    }
}

contract MockRebaseToken is ERC20 {
    constructor() ERC20("Rebase Token", "RBS") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function positiveRebase(address holder, uint256 amount) external {
        _mint(holder, amount);
    }
}

contract MockFortuneOracle is IFortunePriceOracle {
    mapping(address => uint256) public prices;
    mapping(address => uint256) public timestamps;

    function setPrice(address asset, uint256 price) external {
        prices[asset] = price;
        timestamps[asset] = block.timestamp;
    }

    function setPriceAt(
        address asset,
        uint256 price,
        uint256 timestamp
    ) external {
        prices[asset] = price;
        timestamps[asset] = timestamp;
    }

    function priceUsd(address asset) external view returns (uint256, uint256) {
        return (prices[asset], timestamps[asset]);
    }
}

contract FortuneTest is Test {
    FortuneAssetRegistry registry;
    FortuneFactory factory;
    FortuneAutomationRegistry factoryAutomationRegistry;
    MockFortuneOracle oracle;
    MockERC20 usdt;
    MockERC20 wbnb;

    address user = address(0xA11CE);
    address protocol = address(0xBEEF);
    address holderVault = address(0x1001);
    address buybackVault = address(0x1002);
    address liquidityVault = address(0x1003);
    address treasury = address(0x1004);

    function setUp() public {
        oracle = new MockFortuneOracle();
        registry = new FortuneAssetRegistry(address(this));
        usdt = new MockERC20("USDT", "USDT");
        wbnb = new MockERC20("Wrapped BNB", "WBNB");

        oracle.setPrice(address(usdt), 1e18);
        oracle.setPrice(address(wbnb), 600e18);

        FortuneAssetRegistry.AssetConfig memory config =
            FortuneAssetRegistry.AssetConfig({
                oracle: address(oracle),
                maxOracleAge: 1 hours,
                quoteEnabled: true,
                rewardEnabled: true,
                graduationEnabled: true,
                active: true,
                category: "test"
            });

        registry.configureAsset(address(usdt), config);
        registry.configureAsset(address(wbnb), config);

        factoryAutomationRegistry =
            new FortuneAutomationRegistry(address(this));
        factory = new FortuneFactory(
            address(this),
            address(registry),
            address(factoryAutomationRegistry),
            address(this),
            protocol
        );
        factory.setGraduationAdapter(address(new MockGraduationAdapter()));

        usdt.mint(user, 10_000e18);
        wbnb.mint(user, 100e18);
    }

    function _params(uint256 graduationUsd)
        internal
        view
        returns (FortuneFactory.LaunchParams memory p)
    {
        address[] memory quoteAssets = new address[](2);
        quoteAssets[0] = address(wbnb);
        quoteAssets[1] = address(usdt);

        uint16[] memory weights = new uint16[](2);
        weights[0] = 6_000;
        weights[1] = 4_000;

        uint16[6] memory fees = [
            uint16(25),
            uint16(25),
            uint16(25),
            uint16(15),
            uint16(0),
            uint16(10)
        ];

        p = FortuneFactory.LaunchParams({
            name: "Fortune Test",
            symbol: "FORT",
            totalSupply: 10_000_000e18,
            quoteAssets: quoteAssets,
            weightsBps: weights,
            primaryQuote: address(wbnb),
            basePriceUsd1e18: 1e15,
            slopeUsd1e18: 1e7,
            graduationUsd1e18: graduationUsd,
            adaptiveGraduation: true,
            feeBps: fees,
            treasury: treasury,
            metadataEditable: true,
            description: "Initial description",
            imageURI: "ipfs://image",
            website: "https://fortune.test",
            xProfile: "https://x.com/fortune",
            telegram: "https://t.me/fortune"
        });
    }

    function testLaunchPreflightPassesOnlyWithHealthyGraduationStack() public {
        FortuneFactory.LaunchParams memory p = _params(1_000e18);

        (bool ready, bytes32 reason) = factory.preflightLaunch(p);
        assertTrue(ready);
        assertEq(reason, bytes32("OK"));

        vm.warp(block.timestamp + 2 hours);
        (ready, reason) = factory.preflightLaunch(p);

        assertFalse(ready);
        assertEq(reason, bytes32("STALE_PRICE"));
    }

    function testLaunchPreflightRejectsDuplicateQuoteAssets() public {
        FortuneFactory.LaunchParams memory p = _params(1_000e18);
        p.quoteAssets[1] = p.quoteAssets[0];

        (bool ready, bytes32 reason) = factory.preflightLaunch(p);

        assertFalse(ready);
        assertEq(reason, bytes32("DUPLICATE_QUOTE"));
    }

    function testLaunchPreflightRejectsMissingTreasuryRoute() public {
        FortuneFactory.LaunchParams memory p = _params(1_000e18);
        p.feeBps[4] = 1;
        p.treasury = address(0);

        (bool ready, bytes32 reason) = factory.preflightLaunch(p);

        assertFalse(ready);
        assertEq(reason, bytes32("TREASURY_REQUIRED"));
    }

    function testPreparedVanityLaunchMatchesPreviewWithoutOnchainSearch() public {
        FortuneFactory.LaunchParams memory p =
            _params(1_000e18);

        (
            bytes32 salt,
            address predicted,
            bytes32 manifestHash,
            uint256 launchNonce
        ) = factory.previewPreparedVanity(
                address(this),
                p
            );

        assertEq(
            launchNonce,
            factory.creatorLaunchNonce(
                address(this)
            )
        );
        assertTrue(
            factory.hasFortuneSuffix(
                predicted
            )
        );

        FortuneFactory.LaunchInfo memory info =
            factory.createLaunchPrepared(
                p,
                salt
            );

        assertEq(info.token, predicted);
        assertEq(
            info.manifestHash,
            manifestHash
        );
        assertEq(
            info.vanitySalt,
            salt
        );
        assertTrue(
            factory.hasFortuneSuffix(
                info.token
            )
        );
    }

    function testEveryFortuneTokenAddressEndsInFe() public {
        FortuneFactory.LaunchInfo memory first =
            factory.createLaunch(_params(1_000e18));
        FortuneFactory.LaunchInfo memory second =
            factory.createLaunch(_params(1_000e18));

        assertTrue(factory.hasFortuneSuffix(first.token));
        assertTrue(factory.hasFortuneSuffix(second.token));
        assertEq(uint8(uint160(first.token)), uint8(0xfe));
        assertEq(uint8(uint160(second.token)), uint8(0xfe));
        assertTrue(first.token != second.token);
        assertTrue(first.vanitySalt != bytes32(0));
        assertTrue(second.vanitySalt != bytes32(0));
        assertTrue(first.vanitySalt != second.vanitySalt);
    }

    function testLaunchShieldStartsAt99PercentAndDecaysToZero() public {
        FortuneFactory.LaunchInfo memory info =
            factory.createLaunch(_params(1_000_000e18));
        FortuneCurve curve = FortuneCurve(info.curve);

        uint256 launchedAt = curve.launchTimestamp();
        assertEq(curve.currentSnipeTaxBps(), 9_900);

        vm.warp(launchedAt + 1);
        assertEq(curve.currentSnipeTaxBps(), 2_475);

        vm.warp(launchedAt + 2);
        assertEq(curve.currentSnipeTaxBps(), 309);

        vm.warp(launchedAt + 5);
        assertEq(curve.currentSnipeTaxBps(), 0);
    }

    function testLaunchShieldTaxGoesToLiquidityVaultNotCreator() public {
        FortuneFactory.LaunchInfo memory info =
            factory.createLaunch(_params(1_000_000e18));
        FortuneCurve curve = FortuneCurve(info.curve);

        uint256 shieldBefore = usdt.balanceOf(info.liquidityVault);

        vm.startPrank(user);
        usdt.approve(address(curve), type(uint256).max);
        curve.buy(address(usdt), 100e18, 1);
        vm.stopPrank();

        // 99% launch tax alone contributes 99 USDT; the regular LP fee route
        // may add a small amount on top.
        assertGe(
            usdt.balanceOf(info.liquidityVault) - shieldBefore,
            99e18
        );
        assertGt(FortuneToken(info.token).balanceOf(user), 0);
    }

    function testLaunchShieldCapsCumulativeEarlyWalletBuy() public {
        FortuneFactory.LaunchInfo memory info =
            factory.createLaunch(_params(1_000_000e18));
        FortuneCurve curve = FortuneCurve(info.curve);

        vm.warp(block.timestamp + 6);

        vm.startPrank(user);
        usdt.approve(address(curve), type(uint256).max);

        vm.expectRevert("LAUNCH_SHIELD_WALLET_CAP");
        curve.buy(address(usdt), 300e18, 1);

        vm.stopPrank();

        vm.warp(block.timestamp + 10);

        vm.startPrank(user);
        uint256 out = curve.buy(address(usdt), 300e18, 1);
        vm.stopPrank();

        assertGt(out, 0);
    }

    function testFuzzBuyPreviewConservesInput(uint96 rawAmount) public {
        uint256 amountIn = bound(
            uint256(rawAmount),
            1e15,
            1_000e18
        );

        FortuneFactory.LaunchInfo memory info =
            factory.createLaunch(_params(10_000e18));
        FortuneCurve curve = FortuneCurve(info.curve);

        vm.warp(block.timestamp + 16);
        usdt.mint(user, amountIn);

        (
            uint256 spent,
            uint256 refund,
            uint256 shieldTax,
            uint256 normalFee,
            uint256 netQuote,
            ,
            uint256 tokensOut
        ) = curve.previewBuy(address(usdt), amountIn);

        assertEq(spent + refund, amountIn);
        assertEq(
            shieldTax + normalFee + netQuote,
            spent
        );
        assertGt(tokensOut, 0);
    }

    function testFuzzBuyThenSellCannotCreateFreeUsdt(uint96 rawAmount) public {
        uint256 amountIn = bound(
            uint256(rawAmount),
            1e18,
            100e18
        );

        FortuneFactory.LaunchInfo memory info =
            factory.createLaunch(_params(100_000e18));
        FortuneCurve curve = FortuneCurve(info.curve);

        vm.warp(block.timestamp + 16);
        usdt.mint(user, amountIn);

        uint256 beforeBalance = usdt.balanceOf(user);

        vm.startPrank(user);
        usdt.approve(address(curve), type(uint256).max);
        FortuneToken(info.token).approve(
            address(curve),
            type(uint256).max
        );

        uint256 bought =
            curve.buy(address(usdt), amountIn, 1);

        curve.sell(address(usdt), bought, 0);
        vm.stopPrank();

        assertLe(
            usdt.balanceOf(user),
            beforeBalance
        );
    }

    function testTwoQuoteAssetsMoveOneCurve() public {
        FortuneFactory.LaunchInfo memory info = factory.createLaunch(_params(1_000e18));
        FortuneCurve curve = FortuneCurve(info.curve);
        FortuneToken token = FortuneToken(info.token);

        vm.warp(block.timestamp + 16);

        vm.startPrank(user);
        usdt.approve(address(curve), type(uint256).max);
        wbnb.approve(address(curve), type(uint256).max);

        uint256 first = curve.buy(address(usdt), 100e18, 1);
        uint256 priceAfterFirst = curve.currentPriceUsd1e18();
        uint256 second = curve.buy(address(wbnb), 0.1e18, 1);
        vm.stopPrank();

        assertGt(first, 0);
        assertGt(second, 0);
        assertGt(priceAfterFirst, curve.basePriceUsd1e18());
        assertEq(token.balanceOf(user), first + second);
        assertGt(curve.reserve(address(usdt)), 0);
        assertGt(curve.reserve(address(wbnb)), 0);
        assertGt(curve.netReserveUsd1e18(), 150e18);
    }

    function testSellCanUseAnotherAcceptedReserve() public {
        FortuneFactory.LaunchInfo memory info = factory.createLaunch(_params(2_000e18));
        FortuneCurve curve = FortuneCurve(info.curve);
        FortuneToken token = FortuneToken(info.token);

        vm.warp(block.timestamp + 16);

        vm.startPrank(user);
        usdt.approve(address(curve), type(uint256).max);
        wbnb.approve(address(curve), type(uint256).max);

        curve.buy(address(usdt), 1_000e18, 1);
        curve.buy(address(wbnb), 1e18, 1);

        uint256 sellAmount = token.balanceOf(user) / 20;
        token.approve(address(curve), sellAmount);
        uint256 before = usdt.balanceOf(user);
        uint256 out = curve.sell(address(usdt), sellAmount, 1);
        vm.stopPrank();

        assertGt(out, 0);
        assertGt(usdt.balanceOf(user), before);
    }

    function testFinalCurveBuyPartiallyFillsAndRefundsExcess() public {
        FortuneFactory.LaunchInfo memory info =
            factory.createLaunch(_params(50e18));
        FortuneCurve curve = FortuneCurve(info.curve);

        vm.warp(block.timestamp + 16);

        uint256 before = usdt.balanceOf(user);

        vm.startPrank(user);
        usdt.approve(address(curve), type(uint256).max);

        (
            uint256 spent,
            uint256 refund,
            ,
            ,
            ,
            ,
            uint256 previewTokens
        ) = curve.previewBuy(address(usdt), 100e18);

        uint256 out = curve.buy(address(usdt), 100e18, 1);
        vm.stopPrank();

        assertGt(refund, 0);
        assertLt(spent, 100e18);
        assertEq(out, previewTokens);
        assertEq(before - usdt.balanceOf(user), spent);
        assertTrue(curve.graduationReady());
        assertEq(
            uint256(curve.phase()),
            uint256(FortuneCurve.Phase.GraduationReady)
        );
    }

    function testGraduationFailureCanEnterPermissionlessRescueAfterSevenDays() public {
        FortuneFactory.LaunchInfo memory info =
            factory.createLaunch(_params(50e18));
        FortuneCurve curve = FortuneCurve(info.curve);
        FortuneToken token = FortuneToken(info.token);

        vm.warp(block.timestamp + 16);

        vm.startPrank(user);
        usdt.approve(address(curve), type(uint256).max);
        curve.buy(address(usdt), 100e18, 1);
        vm.stopPrank();

        assertTrue(curve.graduationReady());

        vm.expectRevert("RESCUE_DELAY");
        curve.activateRescue();

        vm.warp(
            uint256(curve.graduationReadyAt()) +
                curve.GRADUATION_RESCUE_DELAY()
        );

        curve.activateRescue();

        assertTrue(curve.rescueActive());
        assertEq(
            uint256(curve.phase()),
            uint256(FortuneCurve.Phase.Rescued)
        );

        uint256 redeemAmount = token.balanceOf(user);
        uint256 reserveBefore = usdt.balanceOf(address(curve));
        uint256 userBefore = usdt.balanceOf(user);

        uint256[] memory minimums = new uint256[](2);

        vm.startPrank(user);
        token.approve(address(curve), redeemAmount);
        uint256[] memory received =
            curve.rescueRedeem(redeemAmount, minimums);
        vm.stopPrank();

        uint256 usdtIndex =
            curve.quoteAssets(0) == address(usdt)
                ? 0
                : 1;

        assertEq(received[usdtIndex], reserveBefore);
        assertEq(usdt.balanceOf(user), userBefore + reserveBefore);
        assertEq(usdt.balanceOf(address(curve)), 0);
        assertEq(curve.rescueRedeemed(), redeemAmount);
    }

    function testGraduationAnchorLocksCurvePriceOnce() public {
        FortuneFactory.LaunchInfo memory info =
            factory.createLaunch(_params(50e18));
        FortuneCurve curve = FortuneCurve(info.curve);

        vm.warp(block.timestamp + 16);

        vm.startPrank(user);
        usdt.approve(address(curve), type(uint256).max);
        curve.buy(address(usdt), 100e18, 1);
        vm.stopPrank();

        assertTrue(curve.graduationReady());
        uint256 anchor = curve.graduationAnchorPriceUsd1e18();
        assertGt(anchor, 0);

        // Subsequent keeper checks cannot move the chart anchor.
        curve.checkGraduation();
        assertEq(curve.graduationAnchorPriceUsd1e18(), anchor);
    }

    function _installPancakeGraduation()
        internal
        returns (
            MockPancakeV3Factory pancake,
            MockPancakeV3PositionManager manager,
            FortunePermanentLiquidityLocker locker,
            FortunePancakeV3GraduationAdapter adapter
        )
    {
        pancake = new MockPancakeV3Factory();
        manager =
            new MockPancakeV3PositionManager(
                address(pancake)
            );
        locker =
            new FortunePermanentLiquidityLocker(
                address(factory),
                address(manager)
            );
        adapter =
            new FortunePancakeV3GraduationAdapter(
                address(factory),
                address(registry),
                address(pancake),
                address(manager),
                address(locker)
            );

        factory.setLiquidityLockerDepositor(
            address(locker),
            address(adapter),
            true
        );
        factory.setGraduationAdapter(
            address(adapter)
        );
    }

    function _pancakePlan()
        internal
        view
        returns (bytes memory)
    {
        uint24[] memory fees =
            new uint24[](2);
        fees[0] = 500;
        fees[1] = 500;

        FortunePancakeV3GraduationAdapter.GraduationPlan
            memory plan =
                FortunePancakeV3GraduationAdapter
                    .GraduationPlan({
                        fees: fees,
                        maxSqrtPriceDeviationBps: 100,
                        maxDustBps: 100,
                        deadline: uint64(
                            block.timestamp + 5 minutes
                        )
                    });

        return abi.encode(plan);
    }

    function testPancakeGraduationLocksLpAndBurnsExcessInventory() public {
        (
            MockPancakeV3Factory pancake,
            MockPancakeV3PositionManager manager,
            FortunePermanentLiquidityLocker locker,
            FortunePancakeV3GraduationAdapter adapter
        ) = _installPancakeGraduation();

        assertTrue(address(adapter) != address(0));

        FortuneFactory.LaunchInfo memory info =
            factory.createLaunch(_params(50e18));
        FortuneCurve curve =
            FortuneCurve(info.curve);
        FortuneToken token =
            FortuneToken(info.token);

        vm.warp(block.timestamp + 16);

        vm.startPrank(user);
        usdt.approve(
            address(curve),
            type(uint256).max
        );
        curve.buy(address(usdt), 100e18, 1);
        vm.stopPrank();

        uint256 lpTokens =
            curve.requiredLaunchTokensForGraduation();
        uint256 supplyBefore = token.totalSupply();

        bool success =
            factory.finalizeGraduation(
                address(curve),
                _pancakePlan()
            );

        assertTrue(success);
        assertTrue(curve.graduated());
        assertEq(
            token.balanceOf(address(curve)),
            0
        );
        assertLt(
            token.totalSupply(),
            supplyBefore
        );
        assertEq(
            token.totalSupply(),
            curve.tokensSold() + lpTokens
        );

        address pool =
            pancake.getPool(
                info.token,
                address(usdt),
                500
            );
        assertTrue(pool != address(0));
        assertEq(
            locker.lockedPositionCount(),
            1
        );
        assertEq(
            manager.ownerOf(1),
            address(locker)
        );
    }

    function testPancakeGraduationRefusesBadExistingPoolPrice() public {
        (
            MockPancakeV3Factory pancake,
            MockPancakeV3PositionManager manager,
            FortunePermanentLiquidityLocker locker,
            FortunePancakeV3GraduationAdapter adapter
        ) = _installPancakeGraduation();

        assertTrue(address(adapter) != address(0));

        // Silence unused-local warnings while retaining typed setup.
        assertTrue(address(locker) != address(0));

        FortuneFactory.LaunchInfo memory info =
            factory.createLaunch(_params(50e18));
        FortuneCurve curve =
            FortuneCurve(info.curve);

        vm.warp(block.timestamp + 16);

        vm.startPrank(user);
        usdt.approve(
            address(curve),
            type(uint256).max
        );
        curve.buy(address(usdt), 100e18, 1);
        vm.stopPrank();

        manager
            .createAndInitializePoolIfNecessary(
                info.token,
                address(usdt),
                500,
                1
            );

        bool success =
            factory.finalizeGraduation(
                address(curve),
                _pancakePlan()
            );

        assertFalse(success);
        assertFalse(curve.graduated());
        assertGt(
            usdt.balanceOf(address(curve)),
            0
        );

        address pool =
            pancake.getPool(
                info.token,
                address(usdt),
                500
            );
        assertEq(
            MockPancakeV3Pool(pool)
                .sqrtPriceX96(),
            1
        );
    }

    function testGraduationLiquidityMatchesStoredCurveAnchor() public {
        FortuneFactory.LaunchInfo memory info =
            factory.createLaunch(_params(50e18));
        FortuneCurve curve = FortuneCurve(info.curve);

        vm.warp(block.timestamp + 16);

        vm.startPrank(user);
        usdt.approve(address(curve), type(uint256).max);
        curve.buy(address(usdt), 100e18, 1);
        vm.stopPrank();

        uint256 reserveUsd =
            curve.netReserveUsd1e18();
        uint256 lpTokens =
            curve.requiredLaunchTokensForGraduation();
        uint256 anchor =
            curve.graduationAnchorPriceUsd1e18();

        uint256 representedUsd =
            lpTokens * anchor / 1e18;

        assertApproxEqAbs(
            representedUsd,
            reserveUsd,
            2
        );
        assertLt(
            lpTokens,
            FortuneToken(info.token)
                .balanceOf(address(curve))
        );
    }

    function testGraduationMovesBasketToApprovedAdapter() public {
        FortuneFactory.LaunchInfo memory info = factory.createLaunch(_params(50e18));
        FortuneCurve curve = FortuneCurve(info.curve);

        vm.warp(block.timestamp + 16);

        vm.startPrank(user);
        usdt.approve(address(curve), type(uint256).max);
        curve.buy(address(usdt), 100e18, 1);
        vm.stopPrank();

        assertTrue(curve.graduationReady());

        address adapter = factory.graduationAdapter();
        uint256 reserveBefore = usdt.balanceOf(adapter);
        factory.finalizeGraduation(address(curve), "");

        assertTrue(curve.graduated());
        assertGt(usdt.balanceOf(adapter), reserveBefore);
        assertGt(FortuneToken(info.token).balanceOf(adapter), 0);
    }

    function testManifestIsEmbeddedInFixedSupplyToken() public {
        FortuneFactory.LaunchInfo memory info = factory.createLaunch(_params(1_000e18));
        FortuneToken token = FortuneToken(info.token);

        assertEq(token.launchManifest(), info.manifestHash);
        assertEq(token.totalSupply(), token.initialSupply());
        assertEq(token.fortuneFactory(), address(factory));
        assertEq(token.FORTUNE_TOKEN_VERSION(), 2);
    }

    function testCreatorCanPermanentlySurrenderFeesToHolders() public {
        FortuneFactory.LaunchInfo memory info =
            factory.createLaunch(_params(1_000e18));
        FortuneCurve curve = FortuneCurve(info.curve);
        FortuneFeeRouter router = FortuneFeeRouter(info.feeRouter);

        router.surrenderCreatorFeesToHolders();
        assertTrue(router.creatorFeesSurrenderedToHolders());

        vm.expectRevert("ALREADY_SURRENDERED");
        router.surrenderCreatorFeesToHolders();

        vm.warp(block.timestamp + 16);

        uint256 creatorBefore = usdt.balanceOf(address(this));
        uint256 holderBefore = usdt.balanceOf(info.holderVault);

        vm.startPrank(user);
        usdt.approve(address(curve), type(uint256).max);
        curve.buy(address(usdt), 100e18, 1);
        vm.stopPrank();

        assertEq(usdt.balanceOf(address(this)), creatorBefore);
        assertGt(usdt.balanceOf(info.holderVault), holderBefore);
    }

    function testEditableMetadataCanUpdateAndFreeze() public {
        FortuneFactory.LaunchInfo memory info =
            factory.createLaunch(_params(1_000e18));

        FortuneMetadataRegistry metadataRegistry = factory.metadataRegistry();

        (
            address creator,
            bool editable,
            bool frozen,
            uint64 revision
        ) = metadataRegistry.record(info.token);

        assertEq(creator, address(this));
        assertTrue(editable);
        assertFalse(frozen);
        assertEq(revision, 1);

        FortuneMetadataRegistry.Metadata memory next =
            FortuneMetadataRegistry.Metadata({
                displayName: "New Display Name",
                displaySymbol: "NEW",
                description: "Updated description",
                imageURI: "ipfs://new-image",
                website: "https://new.example",
                xProfile: "https://x.com/new",
                telegram: "https://t.me/new"
            });

        metadataRegistry.updateMetadata(info.token, next);

        FortuneMetadataRegistry.Metadata memory stored =
            metadataRegistry.metadata(info.token);

        assertEq(stored.displayName, "New Display Name");
        assertEq(stored.displaySymbol, "NEW");

        (, , , revision) = metadataRegistry.record(info.token);
        assertEq(revision, 2);

        metadataRegistry.freezeMetadata(info.token);
        (, , frozen, ) = metadataRegistry.record(info.token);
        assertTrue(frozen);

        vm.expectRevert("METADATA_FROZEN");
        metadataRegistry.updateMetadata(info.token, next);

        // ERC-20 identity does not silently change.
        FortuneToken token = FortuneToken(info.token);
        assertEq(token.name(), "Fortune Test");
        assertEq(token.symbol(), "FORT");
    }

    function testImmutableMetadataStartsFrozen() public {
        FortuneFactory.LaunchParams memory p = _params(1_000e18);
        p.metadataEditable = false;

        FortuneFactory.LaunchInfo memory info = factory.createLaunch(p);
        FortuneMetadataRegistry metadataRegistry = factory.metadataRegistry();

        (, bool editable, bool frozen, uint64 revision) =
            metadataRegistry.record(info.token);

        assertFalse(editable);
        assertTrue(frozen);
        assertEq(revision, 1);
    }

    function testFeeOnTransferQuoteIsRejected() public {
        MockFeeToken feeToken = new MockFeeToken();
        oracle.setPrice(address(feeToken), 1e18);

        FortuneAssetRegistry.AssetConfig memory config =
            FortuneAssetRegistry.AssetConfig({
                oracle: address(oracle),
                maxOracleAge: 1 hours,
                quoteEnabled: true,
                rewardEnabled: true,
                graduationEnabled: true,
                active: true,
                category: "test"
            });
        registry.configureAsset(address(feeToken), config);

        FortuneFactory.LaunchParams memory p = _params(1_000e18);
        address[] memory quotes = new address[](1);
        quotes[0] = address(feeToken);
        uint16[] memory weights = new uint16[](1);
        weights[0] = 10_000;
        p.quoteAssets = quotes;
        p.weightsBps = weights;
        p.primaryQuote = address(feeToken);

        FortuneFactory.LaunchInfo memory info = factory.createLaunch(p);
        FortuneCurve curve = FortuneCurve(info.curve);

        feeToken.mint(user, 100e18);
        vm.startPrank(user);
        feeToken.approve(address(curve), type(uint256).max);
        vm.expectRevert("NON_STANDARD_QUOTE_TOKEN");
        curve.buy(address(feeToken), 10e18, 1);
        vm.stopPrank();
    }

    function testFactoryDeploysPurposeLockedAutomationVaults() public {
        FortuneFactory.LaunchInfo memory info =
            factory.createLaunch(_params(1_000e18));

        assertTrue(info.holderVault != address(0));
        assertTrue(info.buybackVault != address(0));
        assertTrue(info.liquidityVault != address(0));

        FortuneAutomationVault holder =
            FortuneAutomationVault(info.holderVault);
        FortuneAutomationVault buyback =
            FortuneAutomationVault(info.buybackVault);
        FortuneAutomationVault liquidity =
            FortuneAutomationVault(info.liquidityVault);

        assertEq(holder.launchToken(), info.token);
        assertEq(buyback.launchToken(), info.token);
        assertEq(liquidity.launchToken(), info.token);

        assertEq(
            uint8(holder.purpose()),
            uint8(FortuneAutomationRegistry.Purpose.HolderRewards)
        );
        assertEq(
            uint8(buyback.purpose()),
            uint8(FortuneAutomationRegistry.Purpose.BuybackBurn)
        );
        assertEq(
            uint8(liquidity.purpose()),
            uint8(FortuneAutomationRegistry.Purpose.LiquidityReinforcement)
        );
    }

    function testAutomationVaultOnlyUsesApprovedPurposeAdapter() public {
        FortuneFactory.LaunchInfo memory info = factory.createLaunch(_params(1_000e18));

        FortuneAutomationRegistry automationRegistry =
            new FortuneAutomationRegistry(address(this));
        MockAutomationAdapter adapter = new MockAutomationAdapter();

        FortuneAutomationVault vault = new FortuneAutomationVault(
            address(automationRegistry),
            FortuneAutomationRegistry.Purpose.HolderRewards,
            info.token,
            address(this)
        );

        usdt.mint(address(vault), 20e18);

        vm.expectRevert("ADAPTER_NOT_APPROVED");
        vault.execute(address(usdt), 10e18, address(adapter), "");

        automationRegistry.setAdapter(
            FortuneAutomationRegistry.Purpose.HolderRewards,
            address(adapter),
            true
        );

        vault.execute(address(usdt), 10e18, address(adapter), "");

        assertEq(vault.executions(), 1);
        assertEq(adapter.lastCaller(), address(vault));
        assertEq(adapter.lastLaunchToken(), info.token);
        assertEq(adapter.lastAsset(), address(usdt));
        assertEq(adapter.lastAmount(), 10e18);
        assertEq(
            adapter.lastPurpose(),
            uint8(FortuneAutomationRegistry.Purpose.HolderRewards)
        );
    }

    function testPermanentLiquidityLockerCannotReleasePosition() public {
        MockPositionManager manager = new MockPositionManager();
        FortunePermanentLiquidityLocker locker =
            new FortunePermanentLiquidityLocker(
                address(this),
                address(manager)
            );

        locker.setApprovedDepositor(address(this), true);

        uint256 tokenId = 7;
        manager.mint(address(this), tokenId);
        manager.safeTransferFrom(
            address(this),
            address(locker),
            tokenId
        );

        locker.registerPosition(
            tokenId,
            address(usdt),
            treasury,
            keccak256("FORT/USDT")
        );

        assertEq(manager.ownerOf(tokenId), address(locker));
        assertEq(locker.lockedPositionCount(), 1);

        FortunePermanentLiquidityLocker.LockedPosition memory locked =
            locker.position(tokenId);

        assertEq(locked.launchToken, address(usdt));
        assertEq(locked.feeRecipient, treasury);
        assertEq(locked.poolKeyHash, keccak256("FORT/USDT"));
        assertTrue(locked.registered);

        manager.setCollectAmounts(11, 22);
        (uint256 amount0, uint256 amount1) =
            locker.collectFees(tokenId);

        assertEq(amount0, 11);
        assertEq(amount1, 22);
        assertEq(manager.lastCollectRecipient(), treasury);
        assertEq(manager.ownerOf(tokenId), address(locker));
    }

    function testStockFloorVaultProvidesProRataRedemption() public {
        FortuneToken meme = new FortuneToken(
            "Stock Floor Meme",
            "SFM",
            1_000e18,
            keccak256("stock-floor-test")
        );
        MockERC20 stock = new MockERC20("Tokenized Stock", "STOCK");
        FortuneStockFloorVault floor = new FortuneStockFloorVault(
            address(this),
            address(meme),
            address(stock)
        );

        stock.mint(address(this), 100e18);
        stock.approve(address(floor), 100e18);
        floor.fund(100e18);

        meme.transfer(user, 100e18);
        floor.activateRedemption();

        uint256 redeemAmount = 10e18;
        uint256 preview = floor.previewRedeem(redeemAmount);
        assertEq(preview, 1e18);

        vm.startPrank(user);
        meme.approve(address(floor), redeemAmount);
        uint256 before = stock.balanceOf(user);
        uint256 out = floor.redeem(redeemAmount, preview);
        vm.stopPrank();

        assertEq(out, preview);
        assertEq(stock.balanceOf(user), before + preview);
        assertEq(meme.balanceOf(address(floor)), redeemAmount);
        assertEq(floor.totalRedeemedLaunchTokens(), redeemAmount);
    }

    function testPerpReferenceRegistryCapsMultiplierAndStaleness() public {
        MockReferenceOracle referenceOracle = new MockReferenceOracle();
        FortunePerpReferenceRegistry perpRegistry =
            new FortunePerpReferenceRegistry(address(this));

        bytes32 marketKey = keccak256("LIGHTER:ANTHROPIC");
        referenceOracle.setPrice(marketKey, 100e18);

        perpRegistry.configureMarket(
            marketKey,
            FortunePerpReferenceRegistry.MarketConfig({
                oracle: address(referenceOracle),
                maxOracleAge: 60,
                maxMultiplierBps: 30_000,
                lowDepthBps: 2_500,
                active: true,
                venue: "Lighter",
                symbol: "ANTHROPIC"
            })
        );

        assertEq(perpRegistry.referencePrice(marketKey, 10_000), 100e18);
        assertEq(perpRegistry.referencePrice(marketKey, 20_000), 200e18);

        vm.expectRevert("MULTIPLIER_NOT_ALLOWED");
        perpRegistry.referencePrice(marketKey, 30_001);

        vm.warp(block.timestamp + 61);
        vm.expectRevert("STALE_REFERENCE");
        perpRegistry.referencePrice(marketKey, 10_000);
    }

    function testPositiveRebaseChangesReserveAndCanTriggerGraduation() public {
        MockRebaseToken rebaseToken = new MockRebaseToken();
        oracle.setPrice(address(rebaseToken), 1e18);

        FortuneAssetRegistry.AssetConfig memory config =
            FortuneAssetRegistry.AssetConfig({
                oracle: address(oracle),
                maxOracleAge: 1 hours,
                quoteEnabled: true,
                rewardEnabled: true,
                graduationEnabled: true,
                active: true,
                category: "test"
            });
        registry.configureAsset(address(rebaseToken), config);

        FortuneFactory.LaunchParams memory p = _params(100e18);
        address[] memory quotes = new address[](1);
        quotes[0] = address(rebaseToken);
        uint16[] memory weights = new uint16[](1);
        weights[0] = 10_000;
        p.quoteAssets = quotes;
        p.weightsBps = weights;
        p.primaryQuote = address(rebaseToken);

        FortuneFactory.LaunchInfo memory info = factory.createLaunch(p);
        FortuneCurve curve = FortuneCurve(info.curve);

        vm.warp(block.timestamp + 16);

        rebaseToken.mint(user, 60e18);
        vm.startPrank(user);
        rebaseToken.approve(address(curve), type(uint256).max);
        curve.buy(address(rebaseToken), 50e18, 1);
        vm.stopPrank();

        assertFalse(curve.graduationReady());
        uint256 beforeReserve = curve.reserve(address(rebaseToken));

        // Simulate a positive rebase increasing the curve's actual balance.
        rebaseToken.positiveRebase(address(curve), 60e18);
        assertEq(curve.reserve(address(rebaseToken)), beforeReserve + 60e18);

        curve.checkGraduation();
        assertTrue(curve.graduationReady());
    }
}
