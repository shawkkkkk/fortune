// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {IGraduationAdapter} from "./interfaces/IGraduationAdapter.sol";
import {IGraduationPreflight} from "./interfaces/IGraduationPreflight.sol";
import {IFortuneFactoryView} from "./interfaces/IFortuneFactoryView.sol";
import {FortunePermanentV2LiquidityLocker} from "./FortunePermanentV2LiquidityLocker.sol";
import {FortunePoolRegistry} from "./FortunePoolRegistry.sol";

interface IFortuneTaxTokenDexActivation {
    function quoteAsset() external view returns (address);
    function officialPool() external view returns (address);
    function activateDex(address pool, address router) external;
}

interface IFortuneV2FactoryGraduationLike {
    function getPair(address tokenA, address tokenB)
        external
        view
        returns (address pair);
}

interface IFortuneV2PairSupplyLike {
    function totalSupply() external view returns (uint256);
}

interface IFortuneV2RouterGraduationLike {
    function addLiquidity(
        address tokenA,
        address tokenB,
        uint256 amountADesired,
        uint256 amountBDesired,
        uint256 amountAMin,
        uint256 amountBMin,
        address to,
        uint256 deadline
    )
        external
        returns (
            uint256 amountA,
            uint256 amountB,
            uint256 liquidity
        );
}

/// @notice Pancake V2 graduation path for immutable Fortune tax tokens.
/// @dev Transfer-tax activation happens only after initial liquidity is deposited,
///      so the first LP mint is not taxed. LP tokens are minted directly into a
///      locker with no withdrawal surface.
contract FortunePancakeV2TaxGraduationAdapter is
    IGraduationAdapter,
    IGraduationPreflight,
    ReentrancyGuard
{
    using SafeERC20 for IERC20;

    uint16 public constant BPS = 10_000;
    uint16 public constant MAX_DUST_BPS = 500;
    uint256 public constant MAX_DEADLINE_HORIZON = 30 minutes;

    struct GraduationPlan {
        uint16 maxDustBps;
        uint64 deadline;
    }

    IFortuneFactoryView public immutable fortuneFactory;
    IFortuneV2FactoryGraduationLike public immutable pancakeFactory;
    IFortuneV2RouterGraduationLike public immutable pancakeRouter;
    FortunePermanentV2LiquidityLocker public immutable liquidityLocker;
    FortunePoolRegistry public immutable poolRegistry;

    event PancakeV2TaxPoolGraduated(
        address indexed curve,
        address indexed launchToken,
        address indexed quoteAsset,
        address pair,
        uint256 launchTokenUsed,
        uint256 quoteUsed,
        uint256 liquidityLocked,
        uint256 launchTokenDust,
        uint256 quoteDust
    );

    constructor(
        address fortuneFactory_,
        address pancakeFactory_,
        address pancakeRouter_,
        address liquidityLocker_,
        address poolRegistry_
    ) {
        require(
            fortuneFactory_ != address(0) &&
                pancakeFactory_ != address(0) &&
                pancakeRouter_ != address(0) &&
                liquidityLocker_ != address(0) &&
                poolRegistry_ != address(0),
            "ZERO_ADDRESS"
        );
        require(
            fortuneFactory_.code.length > 0 &&
                pancakeFactory_.code.length > 0 &&
                pancakeRouter_.code.length > 0 &&
                liquidityLocker_.code.length > 0 &&
                poolRegistry_.code.length > 0,
            "MISSING_CODE"
        );

        fortuneFactory = IFortuneFactoryView(fortuneFactory_);
        pancakeFactory =
            IFortuneV2FactoryGraduationLike(pancakeFactory_);
        pancakeRouter =
            IFortuneV2RouterGraduationLike(pancakeRouter_);
        liquidityLocker =
            FortunePermanentV2LiquidityLocker(liquidityLocker_);
        poolRegistry = FortunePoolRegistry(poolRegistry_);
    }

    function preflight(
        address launchToken,
        uint256 launchTokenAmount,
        AssetReserve[] calldata reserves,
        bytes calldata data
    ) external view returns (bool ready, bytes32 reasonCode) {
        return _preflight(
            launchToken,
            launchTokenAmount,
            reserves,
            data
        );
    }

    function _preflight(
        address launchToken,
        uint256 launchTokenAmount,
        AssetReserve[] calldata reserves,
        bytes calldata data
    ) internal view returns (bool ready, bytes32 reasonCode) {
        if (
            fortuneFactory.curveIndexPlusOne(msg.sender) == 0
        ) {
            return (false, bytes32("UNKNOWN_CURVE"));
        }

        if (
            launchToken == address(0) ||
            launchToken.code.length == 0 ||
            launchTokenAmount == 0
        ) {
            return (false, bytes32("BAD_LAUNCH_TOKEN"));
        }

        if (reserves.length != 1) {
            return (false, bytes32("TAX_SINGLE_QUOTE_ONLY"));
        }

        AssetReserve calldata reserveInfo = reserves[0];

        if (
            reserveInfo.asset == address(0) ||
            reserveInfo.asset == launchToken ||
            reserveInfo.amount == 0 ||
            reserveInfo.weightBps != BPS
        ) {
            return (false, bytes32("BAD_RESERVE"));
        }

        if (
            !liquidityLocker.approvedDepositor(address(this))
        ) {
            return (false, bytes32("LOCKER_NOT_READY"));
        }

        GraduationPlan memory plan =
            abi.decode(data, (GraduationPlan));

        if (plan.maxDustBps > MAX_DUST_BPS) {
            return (false, bytes32("BAD_DUST"));
        }

        if (
            plan.deadline < block.timestamp ||
            uint256(plan.deadline) >
                block.timestamp +
                MAX_DEADLINE_HORIZON
        ) {
            return (false, bytes32("BAD_DEADLINE"));
        }

        try IFortuneTaxTokenDexActivation(launchToken)
            .quoteAsset()
            returns (address quote)
        {
            if (quote != reserveInfo.asset) {
                return (false, bytes32("QUOTE_MISMATCH"));
            }
        } catch {
            return (false, bytes32("NOT_TAX_TOKEN"));
        }

        try IFortuneTaxTokenDexActivation(launchToken)
            .officialPool()
            returns (address pool)
        {
            if (pool != address(0)) {
                return (false, bytes32("DEX_ALREADY_ACTIVE"));
            }
        } catch {
            return (false, bytes32("NOT_TAX_TOKEN"));
        }

        address existingPair =
            pancakeFactory.getPair(
                launchToken,
                reserveInfo.asset
            );

        if (existingPair != address(0)) {
            if (existingPair.code.length == 0) {
                return (false, bytes32("PAIR_NO_CODE"));
            }

            try IFortuneV2PairSupplyLike(existingPair)
                .totalSupply()
                returns (uint256 supply)
            {
                if (supply > 0) {
                    return (false, bytes32("PAIR_ALREADY_LIQUID"));
                }
            } catch {
                return (false, bytes32("PAIR_SUPPLY_REVERT"));
            }
        }

        return (true, bytes32("OK"));
    }

    function graduate(
        address launchToken,
        uint256 launchTokenAmount,
        AssetReserve[] calldata reserves,
        bytes calldata data
    ) external nonReentrant {
        (bool ready, bytes32 reasonCode) =
            _preflight(
                launchToken,
                launchTokenAmount,
                reserves,
                data
            );

        require(
            ready,
            string(
                abi.encodePacked(
                    "PREFLIGHT_FAILED:",
                    reasonCode
                )
            )
        );

        GraduationPlan memory plan =
            abi.decode(data, (GraduationPlan));
        AssetReserve calldata reserveInfo =
            reserves[0];

        uint256 launchMin =
            launchTokenAmount *
            (BPS - plan.maxDustBps) /
            BPS;
        uint256 quoteMin =
            reserveInfo.amount *
            (BPS - plan.maxDustBps) /
            BPS;

        IERC20(launchToken).forceApprove(
            address(pancakeRouter),
            launchTokenAmount
        );
        IERC20(reserveInfo.asset).forceApprove(
            address(pancakeRouter),
            reserveInfo.amount
        );

        (
            uint256 launchUsed,
            uint256 quoteUsed,
            uint256 liquidity
        ) = pancakeRouter.addLiquidity(
                launchToken,
                reserveInfo.asset,
                launchTokenAmount,
                reserveInfo.amount,
                launchMin,
                quoteMin,
                address(liquidityLocker),
                plan.deadline
            );

        IERC20(launchToken).forceApprove(
            address(pancakeRouter),
            0
        );
        IERC20(reserveInfo.asset).forceApprove(
            address(pancakeRouter),
            0
        );

        require(
            liquidity > 0 &&
                launchUsed >= launchMin &&
                quoteUsed >= quoteMin &&
                launchUsed <= launchTokenAmount &&
                quoteUsed <= reserveInfo.amount,
            "BAD_LIQUIDITY_MINT"
        );

        address pair =
            pancakeFactory.getPair(
                launchToken,
                reserveInfo.asset
            );

        require(
            pair != address(0) &&
                pair.code.length > 0,
            "PAIR_NOT_CREATED"
        );

        liquidityLocker.registerLiquidity(
            pair,
            launchToken,
            reserveInfo.asset,
            liquidity
        );

        // Makes anti-farmer recognition immediate and also leaves a public
        // registry record for indexers. The call is permissionless by design.
        poolRegistry.registerV2Pair(
            address(pancakeFactory),
            launchToken,
            reserveInfo.asset
        );

        IFortuneTaxTokenDexActivation(
            launchToken
        ).activateDex(
            pair,
            address(pancakeRouter)
        );

        address dustRecipient =
            fortuneFactory.liquidityVaultForCurve(
                msg.sender
            );
        require(
            dustRecipient != address(0),
            "NO_DUST_RECIPIENT"
        );

        uint256 launchDust =
            launchTokenAmount -
            launchUsed;
        uint256 quoteDust =
            reserveInfo.amount -
            quoteUsed;

        if (launchDust > 0) {
            IERC20(launchToken)
                .safeTransfer(
                    dustRecipient,
                    launchDust
                );
        }

        if (quoteDust > 0) {
            IERC20(reserveInfo.asset)
                .safeTransfer(
                    dustRecipient,
                    quoteDust
                );
        }

        emit PancakeV2TaxPoolGraduated(
            msg.sender,
            launchToken,
            reserveInfo.asset,
            pair,
            launchUsed,
            quoteUsed,
            liquidity,
            launchDust,
            quoteDust
        );
    }
}
