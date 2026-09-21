// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

import {FortuneAssetRegistry} from "./FortuneAssetRegistry.sol";
import {FortunePermanentLiquidityLocker} from "./FortunePermanentLiquidityLocker.sol";
import {IGraduationAdapter} from "./interfaces/IGraduationAdapter.sol";
import {IGraduationPreflight} from "./interfaces/IGraduationPreflight.sol";
import {IFortuneFactoryView} from "./interfaces/IFortuneFactoryView.sol";
import {IPancakeV3FactoryLike} from "./interfaces/IPancakeV3FactoryLike.sol";
import {IPancakeV3PoolLike} from "./interfaces/IPancakeV3PoolLike.sol";
import {IPancakeV3PositionManagerLike} from "./interfaces/IPancakeV3PositionManagerLike.sol";

/// @notice Research-grade PancakeSwap V3 graduation adapter for Fortune.
/// @dev No Pancake addresses are hardcoded. Production deployments must use
///      freshly verified BNB Chain contracts and independent audit review.
contract FortunePancakeV3GraduationAdapter is
    IGraduationAdapter,
    IGraduationPreflight,
    ReentrancyGuard
{
    using SafeERC20 for IERC20;

    uint256 public constant BPS = 10_000;
    uint256 public constant Q192 = 1 << 192;
    uint256 public constant MAX_DEADLINE_HORIZON = 30 minutes;
    uint16 public constant MAX_SQRT_DEVIATION_BPS = 500;
    uint16 public constant MAX_DUST_BPS = 500;

    // Mainnet v1 removes permissionless graduation-plan discretion. Testnet
    // remains flexible for research, while chain 56 uses one reviewed market
    // shape for the first real-funds canary.
    uint24 public constant MAINNET_V1_POOL_FEE = 500; // Pancake V3 0.05%
    uint16 public constant MAINNET_V1_MAX_SQRT_DEVIATION_BPS = 100;
    uint16 public constant MAINNET_V1_MAX_DUST_BPS = 100;

    int24 public constant MIN_TICK = -887272;
    int24 public constant MAX_TICK = 887272;

    struct GraduationPlan {
        uint24[] fees;
        uint16 maxSqrtPriceDeviationBps;
        uint16 maxDustBps;
        uint64 deadline;
    }

    IFortuneFactoryView public immutable fortuneFactory;
    FortuneAssetRegistry public immutable registry;
    IPancakeV3FactoryLike public immutable pancakeFactory;
    IPancakeV3PositionManagerLike public immutable positionManager;
    FortunePermanentLiquidityLocker public immutable liquidityLocker;

    event PancakePoolGraduated(
        address indexed curve,
        address indexed launchToken,
        address indexed quoteAsset,
        address pool,
        uint256 positionTokenId,
        uint24 fee,
        uint256 launchTokenAmount,
        uint256 quoteAmount,
        uint256 launchTokenDust,
        uint256 quoteDust
    );

    constructor(
        address fortuneFactory_,
        address registry_,
        address pancakeFactory_,
        address positionManager_,
        address liquidityLocker_
    ) {
        require(
            fortuneFactory_ != address(0) &&
                registry_ != address(0) &&
                pancakeFactory_ != address(0) &&
                positionManager_ != address(0) &&
                liquidityLocker_ != address(0),
            "ZERO_ADDRESS"
        );

        fortuneFactory = IFortuneFactoryView(fortuneFactory_);
        registry = FortuneAssetRegistry(registry_);
        pancakeFactory = IPancakeV3FactoryLike(pancakeFactory_);
        positionManager =
            IPancakeV3PositionManagerLike(positionManager_);
        liquidityLocker =
            FortunePermanentLiquidityLocker(liquidityLocker_);
    }

    function preflight(
        address launchToken,
        uint256 launchTokenAmount,
        AssetReserve[] calldata reserves,
        bytes calldata data
    ) external view returns (bool ready, bytes32 reasonCode) {
        return
            _preflight(
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
            fortuneFactory.curveIndexPlusOne(
                msg.sender
            ) == 0
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
        if (reserves.length < 1 || reserves.length > 5) {
            return (false, bytes32("BAD_RESERVE_COUNT"));
        }
        if (!liquidityLocker.approvedDepositor(address(this))) {
            return (false, bytes32("LOCKER_NOT_READY"));
        }

        GraduationPlan memory plan =
            abi.decode(data, (GraduationPlan));

        if (plan.fees.length != reserves.length) {
            return (false, bytes32("BAD_PLAN_LENGTH"));
        }
        if (
            plan.deadline < block.timestamp ||
            uint256(plan.deadline) >
                block.timestamp + MAX_DEADLINE_HORIZON
        ) {
            return (false, bytes32("BAD_DEADLINE"));
        }
        if (
            plan.maxSqrtPriceDeviationBps >
                MAX_SQRT_DEVIATION_BPS
        ) {
            return (false, bytes32("BAD_DEVIATION"));
        }
        if (plan.maxDustBps > MAX_DUST_BPS) {
            return (false, bytes32("BAD_DUST"));
        }

        if (block.chainid == 56) {
            if (
                reserves.length != 1 ||
                plan.fees.length != 1 ||
                plan.fees[0] != MAINNET_V1_POOL_FEE
            ) {
                return (false, bytes32("MAINNET_FEE_TIER"));
            }
            if (
                plan.maxSqrtPriceDeviationBps >
                    MAINNET_V1_MAX_SQRT_DEVIATION_BPS
            ) {
                return (false, bytes32("MAINNET_DEVIATION"));
            }
            if (plan.maxDustBps > MAINNET_V1_MAX_DUST_BPS) {
                return (false, bytes32("MAINNET_DUST"));
            }
        }

        uint256 weightSum;
        uint256 launchAssigned;
        uint256 lastWeightedIndex;
        bool hasWeightedReserve;

        for (uint256 i; i < reserves.length; ++i) {
            if (reserves[i].weightBps > 0) {
                lastWeightedIndex = i;
                hasWeightedReserve = true;
            }
        }

        if (!hasWeightedReserve) {
            return (false, bytes32("NO_WEIGHTED_RESERVE"));
        }

        for (uint256 i; i < reserves.length; ++i) {
            AssetReserve calldata reserveInfo = reserves[i];

            if (
                reserveInfo.asset == address(0) ||
                reserveInfo.asset == launchToken
            ) {
                return (false, bytes32("BAD_RESERVE_ASSET"));
            }

            for (uint256 j; j < i; ++j) {
                if (
                    reserves[j].asset ==
                    reserveInfo.asset
                ) {
                    return (false, bytes32("DUPLICATE_RESERVE"));
                }
            }

            weightSum += reserveInfo.weightBps;

            if (reserveInfo.weightBps == 0) {
                if (reserveInfo.amount != 0) {
                    return (false, bytes32("ZERO_WEIGHT_BALANCE"));
                }
                continue;
            }

            if (reserveInfo.amount == 0) {
                return (false, bytes32("ZERO_RESERVE"));
            }
            // Asset eligibility/oracle/decimal configuration was frozen into
            // the canonical FortuneCurve at launch. Registry governance cannot
            // retroactively brick an existing graduation.

            int24 tickSpacing;
            try pancakeFactory.feeAmountTickSpacing(
                plan.fees[i]
            ) returns (int24 spacing) {
                tickSpacing = spacing;
            } catch {
                return (false, bytes32("FEE_TIER_REVERT"));
            }

            if (tickSpacing <= 0) {
                return (false, bytes32("BAD_FEE_TIER"));
            }

            uint256 launchAllocation;
            if (i == lastWeightedIndex) {
                launchAllocation =
                    launchTokenAmount -
                    launchAssigned;
            } else {
                launchAllocation =
                    launchTokenAmount *
                    reserveInfo.weightBps /
                    BPS;
            }

            if (launchAllocation == 0) {
                return (false, bytes32("ZERO_TOKEN_ALLOCATION"));
            }
            launchAssigned += launchAllocation;

            (
                bool ratioOk,
                uint160 targetSqrtPriceX96
            ) = _targetSqrtPrice(
                launchToken,
                reserveInfo.asset,
                launchAllocation,
                reserveInfo.amount
            );

            if (!ratioOk) {
                return (false, bytes32("BAD_PRICE_RATIO"));
            }

            address pool = pancakeFactory.getPool(
                launchToken,
                reserveInfo.asset,
                plan.fees[i]
            );

            if (pool != address(0)) {
                try IPancakeV3PoolLike(pool).slot0()
                    returns (
                        uint160 currentSqrtPriceX96,
                        int24,
                        uint16,
                        uint16,
                        uint16,
                        uint32,
                        bool unlocked
                    )
                {
                    if (
                        currentSqrtPriceX96 == 0 ||
                        !unlocked
                    ) {
                        return (false, bytes32("POOL_NOT_READY"));
                    }

                    uint256 delta =
                        currentSqrtPriceX96 >
                                targetSqrtPriceX96
                            ? currentSqrtPriceX96 -
                                targetSqrtPriceX96
                            : targetSqrtPriceX96 -
                                currentSqrtPriceX96;

                    uint256 deviationBps =
                        Math.mulDiv(
                            delta,
                            BPS,
                            targetSqrtPriceX96
                        );

                    if (
                        deviationBps >
                        plan.maxSqrtPriceDeviationBps
                    ) {
                        return (
                            false,
                            bytes32("POOL_PRICE_DEVIATION")
                        );
                    }
                } catch {
                    return (false, bytes32("POOL_SLOT0_REVERT"));
                }
            }
        }

        if (weightSum != BPS) {
            return (false, bytes32("BAD_WEIGHT_SUM"));
        }

        return (true, bytes32("OK"));
    }

    function graduate(
        address launchToken,
        uint256 launchTokenAmount,
        AssetReserve[] calldata reserves,
        bytes calldata data
    ) external nonReentrant {
        require(
            fortuneFactory.curveIndexPlusOne(msg.sender) != 0,
            "UNKNOWN_CURVE"
        );

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

        address dustRecipient =
            fortuneFactory.liquidityVaultForCurve(
                msg.sender
            );
        require(
            dustRecipient != address(0),
            "NO_DUST_RECIPIENT"
        );

        uint256 launchAssigned;
        uint256 lastWeightedIndex;

        for (uint256 i; i < reserves.length; ++i) {
            if (reserves[i].weightBps > 0) {
                lastWeightedIndex = i;
            }
        }

        for (uint256 i; i < reserves.length; ++i) {
            AssetReserve calldata reserveInfo = reserves[i];

            if (reserveInfo.weightBps == 0) {
                continue;
            }

            uint256 launchAllocation;
            if (i == lastWeightedIndex) {
                launchAllocation =
                    launchTokenAmount -
                    launchAssigned;
            } else {
                launchAllocation =
                    launchTokenAmount *
                    reserveInfo.weightBps /
                    BPS;
            }
            launchAssigned += launchAllocation;

            (
                address token0,
                address token1,
                uint256 amount0Desired,
                uint256 amount1Desired
            ) = _orderedAmounts(
                launchToken,
                reserveInfo.asset,
                launchAllocation,
                reserveInfo.amount
            );

            (, uint160 targetSqrtPriceX96) =
                _targetSqrtPrice(
                    launchToken,
                    reserveInfo.asset,
                    launchAllocation,
                    reserveInfo.amount
                );

            address pool =
                positionManager
                    .createAndInitializePoolIfNecessary(
                        token0,
                        token1,
                        plan.fees[i],
                        targetSqrtPriceX96
                    );

            int24 tickSpacing =
                pancakeFactory.feeAmountTickSpacing(
                    plan.fees[i]
                );
            require(tickSpacing > 0, "BAD_FEE_TIER");

            int24 tickLower =
                (MIN_TICK / tickSpacing) *
                tickSpacing;
            int24 tickUpper =
                (MAX_TICK / tickSpacing) *
                tickSpacing;

            IERC20(token0).forceApprove(
                address(positionManager),
                amount0Desired
            );
            IERC20(token1).forceApprove(
                address(positionManager),
                amount1Desired
            );

            (
                uint256 positionTokenId,
                uint128 liquidity,
                uint256 amount0Used,
                uint256 amount1Used
            ) = positionManager.mint(
                    IPancakeV3PositionManagerLike.MintParams({
                        token0: token0,
                        token1: token1,
                        fee: plan.fees[i],
                        tickLower: tickLower,
                        tickUpper: tickUpper,
                        amount0Desired: amount0Desired,
                        amount1Desired: amount1Desired,
                        amount0Min:
                            amount0Desired *
                            (BPS - plan.maxDustBps) /
                            BPS,
                        amount1Min:
                            amount1Desired *
                            (BPS - plan.maxDustBps) /
                            BPS,
                        recipient: address(this),
                        deadline: plan.deadline
                    })
                );

            require(liquidity > 0, "ZERO_LIQUIDITY");
            require(
                amount0Used <= amount0Desired &&
                    amount1Used <= amount1Desired,
                "BAD_MINT_ACCOUNTING"
            );

            IERC20(token0).forceApprove(
                address(positionManager),
                0
            );
            IERC20(token1).forceApprove(
                address(positionManager),
                0
            );

            uint256 amount0Dust =
                amount0Desired - amount0Used;
            uint256 amount1Dust =
                amount1Desired - amount1Used;

            if (amount0Dust > 0) {
                IERC20(token0).safeTransfer(
                    dustRecipient,
                    amount0Dust
                );
            }
            if (amount1Dust > 0) {
                IERC20(token1).safeTransfer(
                    dustRecipient,
                    amount1Dust
                );
            }

            positionManager.safeTransferFrom(
                address(this),
                address(liquidityLocker),
                positionTokenId
            );

            bytes32 poolKeyHash =
                keccak256(
                    abi.encode(
                        token0,
                        token1,
                        plan.fees[i]
                    )
                );

            liquidityLocker.registerPosition(
                positionTokenId,
                launchToken,
                dustRecipient,
                poolKeyHash
            );

            (
                uint256 launchUsed,
                uint256 quoteUsed,
                uint256 launchDust,
                uint256 quoteDust
            ) = token0 == launchToken
                ? (
                    amount0Used,
                    amount1Used,
                    amount0Dust,
                    amount1Dust
                )
                : (
                    amount1Used,
                    amount0Used,
                    amount1Dust,
                    amount0Dust
                );

            emit PancakePoolGraduated(
                msg.sender,
                launchToken,
                reserveInfo.asset,
                pool,
                positionTokenId,
                plan.fees[i],
                launchUsed,
                quoteUsed,
                launchDust,
                quoteDust
            );
        }
    }

    function _orderedAmounts(
        address launchToken,
        address quoteAsset,
        uint256 launchAmount,
        uint256 quoteAmount
    )
        internal
        pure
        returns (
            address token0,
            address token1,
            uint256 amount0,
            uint256 amount1
        )
    {
        if (
            uint160(launchToken) <
            uint160(quoteAsset)
        ) {
            return (
                launchToken,
                quoteAsset,
                launchAmount,
                quoteAmount
            );
        }

        return (
            quoteAsset,
            launchToken,
            quoteAmount,
            launchAmount
        );
    }

    function _targetSqrtPrice(
        address launchToken,
        address quoteAsset,
        uint256 launchAmount,
        uint256 quoteAmount
    )
        internal
        pure
        returns (bool ok, uint160 sqrtPriceX96)
    {
        if (
            launchAmount == 0 ||
            quoteAmount == 0
        ) {
            return (false, 0);
        }

        (
            ,
            ,
            uint256 amount0,
            uint256 amount1
        ) = _orderedAmounts(
            launchToken,
            quoteAsset,
            launchAmount,
            quoteAmount
        );

        if (
            amount1 > amount0 &&
            amount1 / amount0 >
                type(uint64).max
        ) {
            return (false, 0);
        }

        uint256 ratioX192 =
            Math.mulDiv(
                amount1,
                Q192,
                amount0
            );

        if (ratioX192 == 0) {
            return (false, 0);
        }

        uint256 sqrtValue =
            Math.sqrt(ratioX192);

        if (
            sqrtValue == 0 ||
            sqrtValue > type(uint160).max
        ) {
            return (false, 0);
        }

        return (true, uint160(sqrtValue));
    }
}
