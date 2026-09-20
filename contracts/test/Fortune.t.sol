// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

import {FortuneAssetRegistry} from "../src/FortuneAssetRegistry.sol";
import {FortuneFactory} from "../src/FortuneFactory.sol";
import {FortuneCurve} from "../src/FortuneCurve.sol";
import {FortuneToken} from "../src/FortuneToken.sol";
import {FortuneChainlinkOracle} from "../src/FortuneChainlinkOracle.sol";
import {MockGraduationAdapter} from "../src/MockGraduationAdapter.sol";
import {FortuneAutomationRegistry} from "../src/FortuneAutomationRegistry.sol";
import {FortuneAutomationVault} from "../src/FortuneAutomationVault.sol";
import {MockAutomationAdapter} from "../src/test/MockAutomationAdapter.sol";
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

    function setPrice(address asset, uint256 price) external {
        prices[asset] = price;
    }

    function priceUsd(address asset) external view returns (uint256, uint256) {
        return (prices[asset], block.timestamp);
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
            treasury: treasury
        });
    }

    function testTwoQuoteAssetsMoveOneCurve() public {
        FortuneFactory.LaunchInfo memory info = factory.createLaunch(_params(1_000e18));
        FortuneCurve curve = FortuneCurve(info.curve);
        FortuneToken token = FortuneToken(info.token);

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

    function testGraduationMovesBasketToApprovedAdapter() public {
        FortuneFactory.LaunchInfo memory info = factory.createLaunch(_params(50e18));
        FortuneCurve curve = FortuneCurve(info.curve);

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
