// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {FortuneToken} from "./FortuneToken.sol";
import {FortuneCurve} from "./FortuneCurve.sol";
import {FortuneFeeRouter} from "./FortuneFeeRouter.sol";
import {FortuneAssetRegistry} from "./FortuneAssetRegistry.sol";

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
        uint16[6] feeBps;
        address holderVault;
        address buybackVault;
        address liquidityVault;
        address treasury;
    }

    struct LaunchInfo {
        address creator;
        address token;
        address curve;
        address feeRouter;
        bytes32 manifestHash;
        uint64 createdAt;
    }

    FortuneAssetRegistry public immutable registry;
    address public immutable protocolTreasury;
    address public graduationAdapter;
    bool public launchesPaused;

    LaunchInfo[] public launches;
    mapping(address => uint256) public curveIndexPlusOne;

    event LaunchCreated(
        uint256 indexed launchId,
        address indexed creator,
        address indexed token,
        address curve,
        bytes32 manifestHash
    );
    event GraduationAdapterSet(address indexed adapter);
    event LaunchPauseSet(bool paused);
    event GraduationFinalized(address indexed curve, address indexed adapter);

    constructor(
        address initialOwner,
        address registry_,
        address protocolTreasury_
    ) Ownable(initialOwner) {
        require(registry_ != address(0) && protocolTreasury_ != address(0), "ZERO_ADDRESS");
        registry = FortuneAssetRegistry(registry_);
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

    function createLaunch(LaunchParams calldata p) external returns (LaunchInfo memory info) {
        require(!launchesPaused, "LAUNCHES_PAUSED");
        require(p.quoteAssets.length >= 1 && p.quoteAssets.length <= 5, "BAD_ASSET_COUNT");
        require(p.quoteAssets.length == p.weightsBps.length, "BAD_WEIGHT_LENGTH");
        require(p.totalSupply > 0, "ZERO_SUPPLY");

        bool primaryFound;
        uint256 weightSum;
        for (uint256 i; i < p.quoteAssets.length; ++i) {
            require(registry.isQuoteAsset(p.quoteAssets[i]), "UNAPPROVED_QUOTE");
            weightSum += p.weightsBps[i];
            if (p.quoteAssets[i] == p.primaryQuote) primaryFound = true;
        }
        require(primaryFound, "PRIMARY_NOT_IN_BASKET");
        require(weightSum == 10_000, "BAD_WEIGHTS");

        bytes32 manifestHash = keccak256(
            abi.encode(
                block.chainid,
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
                p.holderVault,
                p.buybackVault,
                p.liquidityVault,
                p.treasury
            )
        );

        FortuneToken token = new FortuneToken(
            p.name,
            p.symbol,
            p.totalSupply,
            manifestHash
        );

        FortuneFeeRouter router = new FortuneFeeRouter(
            address(this),
            msg.sender,
            p.holderVault,
            p.buybackVault,
            p.liquidityVault,
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
        require(token.transfer(address(curve), p.totalSupply), "TOKEN_FUND_FAILED");

        info = LaunchInfo({
            creator: msg.sender,
            token: address(token),
            curve: address(curve),
            feeRouter: address(router),
            manifestHash: manifestHash,
            createdAt: uint64(block.timestamp)
        });

        launches.push(info);
        curveIndexPlusOne[address(curve)] = launches.length;

        emit LaunchCreated(
            launches.length - 1,
            msg.sender,
            address(token),
            address(curve),
            manifestHash
        );
    }

    /// @notice Permissionless keeper entrypoint. Adapter choice remains protocol-governed.
    function finalizeGraduation(address curve, bytes calldata data) external {
        require(graduationAdapter != address(0), "NO_ADAPTER");
        require(curveIndexPlusOne[curve] != 0, "UNKNOWN_CURVE");
        FortuneCurve(curve).graduate(graduationAdapter, data);
        emit GraduationFinalized(curve, graduationAdapter);
    }

    function launchCount() external view returns (uint256) {
        return launches.length;
    }
}
