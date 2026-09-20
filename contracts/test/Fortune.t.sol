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
import {IFortunePriceOracle} from "../src/interfaces/IFortunePriceOracle.sol";

contract MockERC20 is ERC20 {
    constructor(string memory n, string memory s) ERC20(n, s) {}
    function mint(address to, uint256 amount) external { _mint(to, amount); }
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

        factory = new FortuneFactory(address(this), address(registry), protocol);
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
            holderVault: holderVault,
            buybackVault: buybackVault,
            liquidityVault: liquidityVault,
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
}
