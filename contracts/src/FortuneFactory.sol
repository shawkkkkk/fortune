// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

import {FortuneToken} from "./FortuneToken.sol";
import {FortuneCurve} from "./FortuneCurve.sol";
import {FortuneFeeRouter} from "./FortuneFeeRouter.sol";
import {FortuneAssetRegistry} from "./FortuneAssetRegistry.sol";
import {FortuneAutomationRegistry} from "./FortuneAutomationRegistry.sol";
import {FortuneAutomationVault} from "./FortuneAutomationVault.sol";
import {FortuneMetadataRegistry} from "./FortuneMetadataRegistry.sol";

contract FortuneFactory is Ownable2Step {
    struct LaunchParams {
        string name;
        string symbol;
        uint256 totalSupply;
        address[] quoteAssets;
        uint16[] weightsBps;
        address primaryQuote;
        uint256 basePriceUsd1e18;
        uint256 slopeUsd1e18;
        uint256 graduationUsd1e18;
        bool adaptiveGraduation;
        /// creator, holders, buyback, liquidity, community treasury, protocol
        uint16[6] feeBps;
        address treasury;
        bool metadataEditable;
        string description;
        string imageURI;
        string website;
        string xProfile;
        string telegram;
    }

    struct LaunchInfo {
        address creator;
        address token;
        address curve;
        address feeRouter;
        address holderVault;
        address buybackVault;
        address liquidityVault;
        bytes32 manifestHash;
        uint64 createdAt;
    }

    FortuneAssetRegistry public immutable registry;
    FortuneAutomationRegistry public immutable automationRegistry;
    FortuneMetadataRegistry public immutable metadataRegistry;
    address public immutable automationExecutor;
    address public immutable protocolTreasury;

    address public graduationAdapter;
    bool public launchesPaused;

    LaunchInfo[] public launches;
    mapping(address => uint256) public curveIndexPlusOne;

    struct GraduationStatus {
        uint64 attempts;
        uint64 failures;
        uint64 lastAttemptAt;
        bytes32 lastFailureCode;
        bool completed;
    }

    mapping(address => GraduationStatus) public graduationStatus;

    event LaunchCreated(
        uint256 indexed launchId,
        address indexed creator,
        address indexed token,
        address curve,
        bytes32 manifestHash
    );
    event LaunchAutomationVaults(
        uint256 indexed launchId,
        address holderVault,
        address buybackVault,
        address liquidityVault
    );
    event GraduationAdapterSet(address indexed adapter);
    event LaunchPauseSet(bool paused);
    event GraduationFinalized(address indexed curve, address indexed adapter);
    event GraduationPreflightFailed(
        address indexed curve,
        address indexed adapter,
        uint256 indexed attempt,
        bytes32 reasonCode
    );
    event GraduationExecutionFailed(
        address indexed curve,
        address indexed adapter,
        uint256 indexed attempt,
        bytes32 revertHash
    );

    constructor(
        address initialOwner,
        address registry_,
        address automationRegistry_,
        address automationExecutor_,
        address protocolTreasury_
    ) Ownable(initialOwner) {
        require(
            registry_ != address(0) &&
                automationRegistry_ != address(0) &&
                automationExecutor_ != address(0) &&
                protocolTreasury_ != address(0),
            "ZERO_ADDRESS"
        );

        registry = FortuneAssetRegistry(registry_);
        automationRegistry = FortuneAutomationRegistry(automationRegistry_);
        metadataRegistry = new FortuneMetadataRegistry(address(this));
        automationExecutor = automationExecutor_;
        protocolTreasury = protocolTreasury_;
    }

    function setGraduationAdapter(address adapter) external onlyOwner {
        require(adapter != address(0), "ZERO_ADAPTER");
        graduationAdapter = adapter;
        emit GraduationAdapterSet(adapter);
    }

    function setLaunchesPaused(bool paused) external onlyOwner {
        launchesPaused = paused;
        emit LaunchPauseSet(paused);
    }

    function createLaunch(LaunchParams calldata p)
        external
        returns (LaunchInfo memory info)
    {
        require(!launchesPaused, "LAUNCHES_PAUSED");
        require(
            p.quoteAssets.length >= 1 && p.quoteAssets.length <= 5,
            "BAD_ASSET_COUNT"
        );
        require(
            p.quoteAssets.length == p.weightsBps.length,
            "BAD_WEIGHT_LENGTH"
        );
        require(p.totalSupply > 0, "ZERO_SUPPLY");

        bool primaryFound;
        uint256 weightSum;

        for (uint256 i; i < p.quoteAssets.length; ++i) {
            require(
                registry.isQuoteAsset(p.quoteAssets[i]),
                "UNAPPROVED_QUOTE"
            );
            weightSum += p.weightsBps[i];
            if (p.quoteAssets[i] == p.primaryQuote) primaryFound = true;
        }

        require(primaryFound, "PRIMARY_NOT_IN_BASKET");
        require(weightSum == 10_000, "BAD_WEIGHTS");

        bytes32 manifestHash = keccak256(
            abi.encode(
                block.chainid,
                address(this),
                address(registry),
                address(automationRegistry),
                automationExecutor,
                msg.sender,
                p.name,
                p.symbol,
                p.totalSupply,
                p.quoteAssets,
                p.weightsBps,
                p.primaryQuote,
                p.basePriceUsd1e18,
                p.slopeUsd1e18,
                p.graduationUsd1e18,
                p.adaptiveGraduation,
                p.feeBps,
                p.treasury,
                p.metadataEditable,
                p.description,
                p.imageURI,
                p.website,
                p.xProfile,
                p.telegram
            )
        );

        FortuneToken token = new FortuneToken(
            p.name,
            p.symbol,
            p.totalSupply,
            manifestHash
        );

        metadataRegistry.registerToken(
            address(token),
            msg.sender,
            p.metadataEditable,
            FortuneMetadataRegistry.Metadata({
                displayName: p.name,
                displaySymbol: p.symbol,
                description: p.description,
                imageURI: p.imageURI,
                website: p.website,
                xProfile: p.xProfile,
                telegram: p.telegram
            })
        );

        address holderVault = _automationVault(
            p.feeBps[1],
            FortuneAutomationRegistry.Purpose.HolderRewards,
            address(token)
        );
        address buybackVault = _automationVault(
            p.feeBps[2],
            FortuneAutomationRegistry.Purpose.BuybackBurn,
            address(token)
        );
        address liquidityVault = _automationVault(
            p.feeBps[3],
            FortuneAutomationRegistry.Purpose.LiquidityReinforcement,
            address(token)
        );

        FortuneFeeRouter router = new FortuneFeeRouter(
            address(this),
            msg.sender,
            holderVault,
            buybackVault,
            liquidityVault,
            p.treasury,
            protocolTreasury,
            p.feeBps
        );

        FortuneCurve curve = new FortuneCurve(
            address(this),
            address(token),
            address(registry),
            address(router),
            p.quoteAssets,
            p.weightsBps,
            p.basePriceUsd1e18,
            p.slopeUsd1e18,
            p.graduationUsd1e18,
            p.adaptiveGraduation
        );

        router.setCurve(address(curve));
        require(
            token.transfer(address(curve), p.totalSupply),
            "TOKEN_FUND_FAILED"
        );

        info = LaunchInfo({
            creator: msg.sender,
            token: address(token),
            curve: address(curve),
            feeRouter: address(router),
            holderVault: holderVault,
            buybackVault: buybackVault,
            liquidityVault: liquidityVault,
            manifestHash: manifestHash,
            createdAt: uint64(block.timestamp)
        });

        launches.push(info);
        uint256 launchId = launches.length - 1;
        curveIndexPlusOne[address(curve)] = launches.length;

        emit LaunchCreated(
            launchId,
            msg.sender,
            address(token),
            address(curve),
            manifestHash
        );
        emit LaunchAutomationVaults(
            launchId,
            holderVault,
            buybackVault,
            liquidityVault
        );
    }

    function _automationVault(
        uint16 routeBps,
        FortuneAutomationRegistry.Purpose purpose,
        address launchToken
    ) internal returns (address) {
        if (routeBps == 0) return address(0);

        return address(
            new FortuneAutomationVault(
                address(automationRegistry),
                purpose,
                launchToken,
                automationExecutor
            )
        );
    }

    /// @notice Permissionless keeper entrypoint. Adapter choice remains protocol-governed.
    /// @dev Failures are recorded instead of reverting the outer transaction. The
    ///      curve's atomic graduation call rolls back all asset transfers on failure,
    ///      so another keeper may retry safely with corrected adapter data.
    function finalizeGraduation(address curve, bytes calldata data)
        external
        returns (bool success)
    {
        address adapter = graduationAdapter;
        require(adapter != address(0), "NO_ADAPTER");
        require(curveIndexPlusOne[curve] != 0, "UNKNOWN_CURVE");

        GraduationStatus storage status = graduationStatus[curve];
        require(!status.completed, "ALREADY_GRADUATED");

        status.attempts += 1;
        status.lastAttemptAt = uint64(block.timestamp);
        uint256 attempt = status.attempts;

        try FortuneCurve(curve).preflightGraduation(adapter, data)
            returns (bool ready, bytes32 reasonCode)
        {
            if (!ready) {
                status.failures += 1;
                status.lastFailureCode = reasonCode;
                emit GraduationPreflightFailed(
                    curve,
                    adapter,
                    attempt,
                    reasonCode
                );
                return false;
            }
        } catch (bytes memory preflightError) {
            bytes32 reasonHash = keccak256(preflightError);
            status.failures += 1;
            status.lastFailureCode = reasonHash;
            emit GraduationPreflightFailed(
                curve,
                adapter,
                attempt,
                reasonHash
            );
            return false;
        }

        try FortuneCurve(curve).graduate(adapter, data) {
            status.completed = true;
            status.lastFailureCode = bytes32(0);
            emit GraduationFinalized(curve, adapter);
            return true;
        } catch (bytes memory executionError) {
            bytes32 revertHash = keccak256(executionError);
            status.failures += 1;
            status.lastFailureCode = revertHash;
            emit GraduationExecutionFailed(
                curve,
                adapter,
                attempt,
                revertHash
            );
            return false;
        }
    }

    function launchCount() external view returns (uint256) {
        return launches.length;
    }
}
