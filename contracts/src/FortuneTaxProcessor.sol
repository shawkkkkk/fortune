// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {FortuneDividendVault} from "./FortuneDividendVault.sol";

interface IFortuneTaxBurnable {
    function burn(uint256 amount) external;

    function stateNonce()
        external
        view
        returns (uint64);

    function eligibleSupplyAtNonce(
        uint64 nonce
    ) external view returns (uint256);
}

interface IFortuneV2RouterLike {
    function swapExactTokensForTokensSupportingFeeOnTransferTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external;
}

/// @notice Immutable tax-revenue processor for one Fortune tax launch.
/// @dev Curve-phase tax arrives directly in the quote asset. Post-graduation
///      transfer tax arrives in the launch token. Non-market distributions are
///      permissionless; price-sensitive swaps are restricted to the configured
///      automation executor so a zero-min-out caller cannot intentionally expose
///      the treasury to a sandwich.
contract FortuneTaxProcessor is ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint16 public constant BPS = 10_000;

    address public immutable factory;
    IFortuneTaxBurnable public immutable launchToken;
    IERC20 public immutable quoteAsset;
    FortuneDividendVault public immutable dividendVault;

    address public immutable creator;
    address public immutable liquidityVault;
    address public immutable treasury;
    address public immutable protocolTreasury;
    address public immutable executor;

    // creator, direct burn, holder dividends, buyback+burn,
    // liquidity reinforcement, community treasury, protocol
    uint16[7] public allocationBps;

    address public curve;
    address public officialPool;
    address public dexRouter;
    bool public curveBound;
    bool public dexActive;

    uint256 public pendingCreatorQuote;
    uint256 public pendingBurnQuote;
    uint256 public pendingDividendQuote;
    uint256 public pendingBuybackQuote;
    uint256 public pendingLiquidityQuote;
    uint256 public pendingTreasuryQuote;
    uint256 public pendingProtocolQuote;

    uint256 public totalCurveTaxRecorded;
    uint256 public totalDexTaxTokensProcessed;
    uint256 public totalTokensBurned;
    uint256 public totalQuoteDistributed;

    event CurveBound(address indexed curve);
    event DexActivated(
        address indexed pool,
        address indexed router
    );
    event QuoteTaxRecorded(
        uint256 amount
    );
    event QuoteBucketsDispatched(
        uint256 creatorAmount,
        uint256 dividendAmount,
        uint256 liquidityAmount,
        uint256 treasuryAmount,
        uint256 protocolAmount
    );
    event MarketBurnProcessed(
        uint256 quoteSpent,
        uint256 tokensBurned
    );
    event DexTaxTokensProcessed(
        uint256 taxTokens,
        uint256 directlyBurned,
        uint256 quoteReceived
    );
    event DividendRedirectedToBuyback(
        uint256 amount
    );

    constructor(
        address factory_,
        address launchToken_,
        address quoteAsset_,
        address dividendVault_,
        address creator_,
        address liquidityVault_,
        address treasury_,
        address protocolTreasury_,
        address executor_,
        uint16[7] memory allocationBps_
    ) {
        require(
            factory_ != address(0) &&
                launchToken_ != address(0) &&
                quoteAsset_ != address(0) &&
                dividendVault_ != address(0) &&
                creator_ != address(0) &&
                liquidityVault_ != address(0) &&
                protocolTreasury_ != address(0) &&
                executor_ != address(0),
            "ZERO_ADDRESS"
        );
        require(
            launchToken_.code.length > 0 &&
                quoteAsset_.code.length > 0 &&
                dividendVault_.code.length > 0,
            "MISSING_CODE"
        );

        uint256 sum;
        for (
            uint256 i;
            i < allocationBps_.length;
            ++i
        ) {
            sum += allocationBps_[i];
        }

        require(
            sum == BPS,
            "BAD_TAX_ALLOCATION"
        );

        if (
            allocationBps_[5] > 0
        ) {
            require(
                treasury_ != address(0),
                "TREASURY_REQUIRED"
            );
        }

        factory = factory_;
        launchToken =
            IFortuneTaxBurnable(
                launchToken_
            );
        quoteAsset =
            IERC20(quoteAsset_);
        dividendVault =
            FortuneDividendVault(
                dividendVault_
            );
        creator = creator_;
        liquidityVault =
            liquidityVault_;
        treasury = treasury_;
        protocolTreasury =
            protocolTreasury_;
        executor = executor_;
        allocationBps =
            allocationBps_;
    }

    function bindCurve(
        address curve_
    ) external {
        require(
            msg.sender == factory,
            "ONLY_FACTORY"
        );
        require(
            !curveBound,
            "CURVE_ALREADY_BOUND"
        );
        require(
            curve_ != address(0) &&
                curve_.code.length > 0,
            "BAD_CURVE"
        );

        curve = curve_;
        curveBound = true;

        emit CurveBound(
            curve_
        );
    }

    /// @notice Called by FortuneTaxToken when the frozen graduation adapter
    ///         activates the one official post-graduation pool.
    function activateDex(
        address officialPool_,
        address dexRouter_
    ) external {
        require(
            msg.sender ==
                address(
                    launchToken
                ),
            "ONLY_LAUNCH_TOKEN"
        );
        require(
            !dexActive,
            "DEX_ALREADY_ACTIVE"
        );
        require(
            officialPool_ != address(0) &&
                dexRouter_ != address(0) &&
                officialPool_.code.length > 0 &&
                dexRouter_.code.length > 0,
            "BAD_DEX"
        );

        officialPool =
            officialPool_;
        dexRouter =
            dexRouter_;
        dexActive = true;

        emit DexActivated(
            officialPool_,
            dexRouter_
        );
    }

    /// @notice Curve transfers quote tax first, then records exactly that amount.
    function recordQuoteTax(
        address asset,
        uint256 amount
    ) external nonReentrant {
        require(
            msg.sender == curve,
            "ONLY_CURVE"
        );
        require(
            asset ==
                address(
                    quoteAsset
                ),
            "WRONG_QUOTE_ASSET"
        );
        require(
            amount > 0,
            "ZERO_TAX"
        );

        totalCurveTaxRecorded +=
            amount;

        _allocateQuote(
            amount,
            BPS
        );

        emit QuoteTaxRecorded(
            amount
        );
    }

    /// @notice Permissionless distribution for buckets that do not execute a market
    ///         trade. If no eligible holder exists, dividend revenue moves to the
    ///         buyback+burn queue rather than becoming claimable by the first holder.
    function dispatchNonMarket()
        external
        nonReentrant
    {
        uint256 creatorAmount =
            pendingCreatorQuote;
        uint256 dividendAmount =
            pendingDividendQuote;
        uint256 liquidityAmount =
            pendingLiquidityQuote;
        uint256 treasuryAmount =
            pendingTreasuryQuote;
        uint256 protocolAmount =
            pendingProtocolQuote;

        pendingCreatorQuote = 0;
        pendingDividendQuote = 0;
        pendingLiquidityQuote = 0;
        pendingTreasuryQuote = 0;
        pendingProtocolQuote = 0;

        if (
            creatorAmount > 0
        ) {
            quoteAsset.safeTransfer(
                creator,
                creatorAmount
            );
        }

        if (
            liquidityAmount > 0
        ) {
            quoteAsset.safeTransfer(
                liquidityVault,
                liquidityAmount
            );
        }

        if (
            treasuryAmount > 0
        ) {
            quoteAsset.safeTransfer(
                treasury,
                treasuryAmount
            );
        }

        if (
            protocolAmount > 0
        ) {
            quoteAsset.safeTransfer(
                protocolTreasury,
                protocolAmount
            );
        }

        if (
            dividendAmount > 0
        ) {
            uint64 nonce =
                launchToken.stateNonce();
            uint256 eligibleSupply =
                launchToken
                    .eligibleSupplyAtNonce(
                        nonce
                    );

            if (
                eligibleSupply == 0
            ) {
                pendingBuybackQuote +=
                    dividendAmount;

                emit DividendRedirectedToBuyback(
                    dividendAmount
                );
            } else {
                quoteAsset.forceApprove(
                    address(
                        dividendVault
                    ),
                    dividendAmount
                );

                dividendVault.fund(
                    dividendAmount
                );

                quoteAsset.forceApprove(
                    address(
                        dividendVault
                    ),
                    0
                );
            }
        }

        totalQuoteDistributed +=
            creatorAmount +
            dividendAmount +
            liquidityAmount +
            treasuryAmount +
            protocolAmount;

        emit QuoteBucketsDispatched(
            creatorAmount,
            dividendAmount,
            liquidityAmount,
            treasuryAmount,
            protocolAmount
        );
    }

    /// @notice Converts queued curve-phase burn/buyback quote into launch tokens
    ///         after graduation and burns the acquired tokens.
    function processQueuedMarketBurn(
        uint256 minTokenOut,
        uint256 deadline
    )
        external
        nonReentrant
        returns (uint256 burned)
    {
        require(
            msg.sender == executor,
            "ONLY_EXECUTOR"
        );
        require(
            dexActive,
            "DEX_NOT_ACTIVE"
        );
        require(
            deadline >= block.timestamp,
            "DEADLINE"
        );

        uint256 quoteAmount =
            pendingBurnQuote +
            pendingBuybackQuote;

        require(
            quoteAmount > 0,
            "NOTHING_QUEUED"
        );

        pendingBurnQuote = 0;
        pendingBuybackQuote = 0;

        uint256 beforeTokens =
            IERC20(
                address(
                    launchToken
                )
            ).balanceOf(
                address(this)
            );

        quoteAsset.forceApprove(
            dexRouter,
            quoteAmount
        );

        address[] memory path =
            new address[](2);
        path[0] =
            address(
                quoteAsset
            );
        path[1] =
            address(
                launchToken
            );

        IFortuneV2RouterLike(
            dexRouter
        )
            .swapExactTokensForTokensSupportingFeeOnTransferTokens(
                quoteAmount,
                minTokenOut,
                path,
                address(this),
                deadline
            );

        quoteAsset.forceApprove(
            dexRouter,
            0
        );

        uint256 afterTokens =
            IERC20(
                address(
                    launchToken
                )
            ).balanceOf(
                address(this)
            );

        burned =
            afterTokens -
            beforeTokens;

        require(
            burned >= minTokenOut &&
                burned > 0,
            "BAD_MARKET_BURN"
        );

        launchToken.burn(
            burned
        );

        totalTokensBurned +=
            burned;

        emit MarketBurnProcessed(
            quoteAmount,
            burned
        );
    }

    /// @notice Liquidates accumulated post-graduation launch-token tax into the
    ///         quote asset. Direct-burn allocation is burned before the swap.
    function processDexTaxTokens(
        uint256 minQuoteOut,
        uint256 deadline
    )
        external
        nonReentrant
        returns (
            uint256 directBurn,
            uint256 quoteReceived
        )
    {
        require(
            msg.sender == executor,
            "ONLY_EXECUTOR"
        );
        require(
            dexActive,
            "DEX_NOT_ACTIVE"
        );
        require(
            deadline >= block.timestamp,
            "DEADLINE"
        );

        IERC20 taxToken =
            IERC20(
                address(
                    launchToken
                )
            );

        uint256 taxTokens =
            taxToken.balanceOf(
                address(this)
            );

        require(
            taxTokens > 0,
            "NO_TAX_TOKENS"
        );

        uint16 burnBps =
            allocationBps[1];

        directBurn =
            taxTokens *
            uint256(burnBps) /
            BPS;

        if (
            directBurn > 0
        ) {
            launchToken.burn(
                directBurn
            );
            totalTokensBurned +=
                directBurn;
        }

        uint256 swapAmount =
            taxTokens -
            directBurn;

        if (
            swapAmount > 0
        ) {
            uint256 beforeQuote =
                quoteAsset.balanceOf(
                    address(this)
                );

            taxToken.forceApprove(
                dexRouter,
                swapAmount
            );

            address[] memory path =
                new address[](2);
            path[0] =
                address(
                    launchToken
                );
            path[1] =
                address(
                    quoteAsset
                );

            IFortuneV2RouterLike(
                dexRouter
            )
                .swapExactTokensForTokensSupportingFeeOnTransferTokens(
                    swapAmount,
                    minQuoteOut,
                    path,
                    address(this),
                    deadline
                );

            taxToken.forceApprove(
                dexRouter,
                0
            );

            quoteReceived =
                quoteAsset.balanceOf(
                    address(this)
                ) -
                beforeQuote;

            require(
                quoteReceived >=
                    minQuoteOut &&
                    quoteReceived > 0,
                "BAD_TAX_LIQUIDATION"
            );

            uint256 nonBurnBps =
                BPS -
                uint256(
                    burnBps
                );

            _allocateQuote(
                quoteReceived,
                nonBurnBps
            );
        }

        totalDexTaxTokensProcessed +=
            taxTokens;

        emit DexTaxTokensProcessed(
            taxTokens,
            directBurn,
            quoteReceived
        );
    }

    function pendingMarketQuote()
        external
        view
        returns (uint256)
    {
        return
            pendingBurnQuote +
            pendingBuybackQuote;
    }

    function _allocateQuote(
        uint256 amount,
        uint256 denominatorBps
    ) internal {
        require(
            denominatorBps > 0,
            "BAD_ALLOCATION_DENOM"
        );

        uint256 distributed;

        uint256 creatorAmount =
            amount *
            uint256(
                allocationBps[0]
            ) /
            denominatorBps;
        pendingCreatorQuote +=
            creatorAmount;
        distributed +=
            creatorAmount;

        if (
            denominatorBps ==
            BPS
        ) {
            uint256 burnAmount =
                amount *
                uint256(
                    allocationBps[1]
                ) /
                denominatorBps;
            pendingBurnQuote +=
                burnAmount;
            distributed +=
                burnAmount;
        }

        uint256 dividendAmount =
            amount *
            uint256(
                allocationBps[2]
            ) /
            denominatorBps;
        pendingDividendQuote +=
            dividendAmount;
        distributed +=
            dividendAmount;

        uint256 buybackAmount =
            amount *
            uint256(
                allocationBps[3]
            ) /
            denominatorBps;
        pendingBuybackQuote +=
            buybackAmount;
        distributed +=
            buybackAmount;

        uint256 liquidityAmount =
            amount *
            uint256(
                allocationBps[4]
            ) /
            denominatorBps;
        pendingLiquidityQuote +=
            liquidityAmount;
        distributed +=
            liquidityAmount;

        uint256 treasuryAmount =
            amount *
            uint256(
                allocationBps[5]
            ) /
            denominatorBps;
        pendingTreasuryQuote +=
            treasuryAmount;
        distributed +=
            treasuryAmount;

        uint256 protocolAmount =
            amount -
            distributed;
        pendingProtocolQuote +=
            protocolAmount;
    }
}
