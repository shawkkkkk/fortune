// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

import {IFortunePriceOracle} from "../src/interfaces/IFortunePriceOracle.sol";
import {FortuneAssetRegistry} from "../src/FortuneAssetRegistry.sol";
import {FortuneAutomationRegistry} from "../src/FortuneAutomationRegistry.sol";
import {FortunePoolRegistry} from "../src/FortunePoolRegistry.sol";
import {FortuneTaxFactory} from "../src/FortuneTaxFactory.sol";
import {FortuneTaxToken} from "../src/FortuneTaxToken.sol";
import {FortuneTaxProcessor} from "../src/FortuneTaxProcessor.sol";
import {FortuneTokenDeployer} from "../src/deployers/FortuneTokenDeployer.sol";
import {FortuneVaultDeployer} from "../src/deployers/FortuneVaultDeployer.sol";
import {FortuneFeeRouterDeployer} from "../src/deployers/FortuneFeeRouterDeployer.sol";
import {FortuneCurveDeployer} from "../src/deployers/FortuneCurveDeployer.sol";
import {MockGraduationAdapter} from "../src/MockGraduationAdapter.sol";

contract TaxTestOracle is IFortunePriceOracle {
    mapping(address => uint256) public price;
    mapping(address => uint256) public updatedAt;

    function setPrice(
        address asset,
        uint256 value
    ) external {
        price[asset] = value;
        updatedAt[asset] = block.timestamp;
    }

    function priceUsd(
        address asset
    )
        external
        view
        returns (
            uint256,
            uint256
        )
    {
        return (
            price[asset],
            updatedAt[asset]
        );
    }
}

contract TaxTestToken is ERC20 {
    constructor()
        ERC20(
            "Tax Test USD",
            "tUSD"
        )
    {}

    function mint(
        address to,
        uint256 amount
    ) external {
        _mint(
            to,
            amount
        );
    }
}

contract FortuneTaxFactoryTest is Test {
    FortuneAssetRegistry registry;
    FortuneAutomationRegistry automationRegistry;
    FortunePoolRegistry poolRegistry;
    FortuneTaxFactory taxFactory;
    FortuneTokenDeployer tokenDeployer;
    FortuneVaultDeployer vaultDeployer;
    FortuneFeeRouterDeployer feeRouterDeployer;
    FortuneCurveDeployer curveDeployer;
    TaxTestOracle oracle;
    TaxTestToken quote;

    address user =
        address(0xA11CE);
    address protocol =
        address(0xBEEF);

    function setUp() public {
        oracle =
            new TaxTestOracle();
        quote =
            new TaxTestToken();
        registry =
            new FortuneAssetRegistry(
                address(this)
            );

        oracle.setPrice(
            address(quote),
            1e18
        );

        registry.configureAsset(
            address(quote),
            FortuneAssetRegistry
                .AssetConfig({
                    oracle: address(oracle),
                    maxOracleAge: 1 days,
                    quoteEnabled: true,
                    rewardEnabled: true,
                    graduationEnabled: true,
                    active: true,
                    category: "tax-test"
                })
        );

        automationRegistry =
            new FortuneAutomationRegistry(
                address(this)
            );
        poolRegistry =
            new FortunePoolRegistry(
                address(this)
            );
        tokenDeployer =
            new FortuneTokenDeployer();
        vaultDeployer =
            new FortuneVaultDeployer();
        feeRouterDeployer =
            new FortuneFeeRouterDeployer();
        curveDeployer =
            new FortuneCurveDeployer();

        taxFactory =
            new FortuneTaxFactory(
                address(this),
                address(registry),
                address(
                    automationRegistry
                ),
                address(poolRegistry),
                address(
                    tokenDeployer
                ),
                address(
                    vaultDeployer
                ),
                address(
                    feeRouterDeployer
                ),
                address(
                    curveDeployer
                ),
                address(this),
                protocol
            );

        taxFactory
            .setGraduationAdapter(
                address(
                    new MockGraduationAdapter()
                )
            );
        taxFactory
            .setLaunchesPaused(
                false
            );

        quote.mint(
            user,
            10_000e18
        );
    }

    function params()
        internal
        view
        returns (
            FortuneTaxFactory
                .TaxLaunchParams memory p
        )
    {
        uint16[6] memory fees = [
            uint16(25),
            uint16(25),
            uint16(25),
            uint16(15),
            uint16(0),
            uint16(10)
        ];

        uint16[7] memory allocation = [
            uint16(2_000),
            uint16(1_000),
            uint16(2_000),
            uint16(2_000),
            uint16(1_500),
            uint16(500),
            uint16(1_000)
        ];

        p =
            FortuneTaxFactory
                .TaxLaunchParams({
                    name: "Fortune Tax Test",
                    symbol: "FTAX",
                    totalSupply:
                        1_000_000_000e18,
                    quoteAsset:
                        address(quote),
                    basePriceUsd1e18:
                        1e15,
                    slopeUsd1e18:
                        1e6,
                    graduationUsd1e18:
                        1_000e18,
                    feeBps:
                        fees,
                    treasury:
                        user,
                    buyTaxBps:
                        200,
                    sellTaxBps:
                        300,
                    antiFarmerDuration:
                        30 days,
                    minimumDividendBalance:
                        100e18,
                    taxAllocationBps:
                        allocation,
                    description:
                        "Tax factory test",
                    imageURI:
                        "",
                    website:
                        "https://fortune.test",
                    xProfile:
                        "",
                    telegram:
                        "",
                    github:
                        "",
                    youtube:
                        "",
                    debox:
                        ""
                });
    }

    function testTaxFactoryRuntimeStaysUnderEip170()
        public
    {
        assertLt(
            address(taxFactory)
                .code
                .length,
            24_576
        );
    }

    function testTaxLaunchAtomicCreatorFirstBuy()
        public
    {
        FortuneTaxFactory
            .TaxLaunchParams
            memory p =
                params();

        (
            bytes32 salt,
            address predicted,
            ,
        ) =
            taxFactory
                .previewPreparedVanity(
                    user,
                    p
                );

        uint256 quoteBefore =
            quote.balanceOf(
                user
            );

        vm.startPrank(
            user
        );

        quote.approve(
            address(taxFactory),
            250e18
        );

        (
            FortuneTaxFactory
                .LaunchInfo
                memory info,
            uint256 tokensOut
        ) =
            taxFactory
                .createLaunchPreparedAndBuy(
                    p,
                    salt,
                    250e18,
                    1
                );

        vm.stopPrank();

        assertEq(
            info.token,
            predicted
        );
        assertEq(
            uint8(
                uint160(
                    info.token
                )
            ),
            uint8(0xfe)
        );
        assertGt(
            tokensOut,
            0
        );
        assertEq(
            FortuneTaxToken(
                info.token
            ).balanceOf(
                user
            ),
            tokensOut
        );
        assertLt(
            quote.balanceOf(
                user
            ),
            quoteBefore
        );
        assertGt(
            FortuneTaxProcessor(
                info.taxProcessor
            ).totalCurveTaxRecorded(),
            0
        );

        FortuneTaxToken taxToken =
            FortuneTaxToken(
                info.token
            );

        assertEq(
            taxToken.buyTaxBps(),
            200
        );
        assertEq(
            taxToken.sellTaxBps(),
            300
        );
        assertEq(
            taxToken.antiFarmerDuration(),
            30 days
        );
        assertEq(
            taxToken.minimumDividendBalance(),
            100e18
        );
    }

    function testTaxLaunchRejectsBadAllocation()
        public
    {
        FortuneTaxFactory
            .TaxLaunchParams
            memory p =
                params();

        p.taxAllocationBps[0] =
            1_999;

        (
            bool ready,
            bytes32 reason
        ) =
            taxFactory
                .preflightLaunch(
                    p
                );

        assertFalse(
            ready
        );
        assertEq(
            reason,
            bytes32(
                "BAD_TAX_ALLOCATION"
            )
        );
    }

    function testTaxLaunchRejectsTaxAboveTenPercent()
        public
    {
        FortuneTaxFactory
            .TaxLaunchParams
            memory p =
                params();

        p.buyTaxBps =
            1_001;

        (
            bool ready,
            bytes32 reason
        ) =
            taxFactory
                .preflightLaunch(
                    p
                );

        assertFalse(
            ready
        );
        assertEq(
            reason,
            bytes32("BAD_TAX")
        );
    }

    function testTaxLaunchRejectsAntiFarmerOverOneYear()
        public
    {
        FortuneTaxFactory
            .TaxLaunchParams
            memory p =
                params();

        p.antiFarmerDuration =
            365 days + 1;

        (
            bool ready,
            bytes32 reason
        ) =
            taxFactory
                .preflightLaunch(
                    p
                );

        assertFalse(
            ready
        );
        assertEq(
            reason,
            bytes32(
                "ANTI_FARMER_TOO_LONG"
            )
        );
    }
}
