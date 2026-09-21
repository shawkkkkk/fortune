// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @notice Immutable per-launch routing of the trade fee.
/// @dev splitBps are absolute basis points of each trade, not percentages of the fee.
///      Example: [25,25,25,15,0,10] represents a 1.00% total trade fee.
contract FortuneFeeRouter {
    using SafeERC20 for IERC20;

    address public immutable factory;
    address public curve;

    address public immutable creator;
    address public immutable holderVault;
    address public immutable buybackVault;
    address public immutable liquidityVault;
    address public immutable treasury;
    address public immutable protocolTreasury;

    uint16 public immutable creatorBps;
    uint16 public immutable holderBps;
    uint16 public immutable buybackBps;
    uint16 public immutable liquidityBps;
    uint16 public immutable treasuryBps;
    uint16 public immutable protocolBps;
    uint16 public immutable totalFeeBps;

    bool public creatorFeesSurrenderedToHolders;

    event CurveBound(address indexed curve);
    event FeeRouted(address indexed asset, uint256 amount);
    event CreatorFeesSurrenderedToHolders(
        address indexed creator,
        address indexed holderVault,
        uint16 creatorBps
    );

    constructor(
        address factory_,
        address creator_,
        address holderVault_,
        address buybackVault_,
        address liquidityVault_,
        address treasury_,
        address protocolTreasury_,
        uint16[6] memory splitBps
    ) {
        require(factory_ != address(0) && creator_ != address(0) && protocolTreasury_ != address(0), "ZERO_ADDRESS");

        uint256 sum;
        for (uint256 i; i < splitBps.length; ++i) sum += splitBps[i];
        require(sum > 0 && sum <= 500, "BAD_TOTAL_FEE");

        factory = factory_;
        creator = creator_;
        holderVault = holderVault_;
        buybackVault = buybackVault_;
        liquidityVault = liquidityVault_;
        treasury = treasury_;
        protocolTreasury = protocolTreasury_;

        creatorBps = splitBps[0];
        holderBps = splitBps[1];
        buybackBps = splitBps[2];
        liquidityBps = splitBps[3];
        treasuryBps = splitBps[4];
        protocolBps = splitBps[5];
        totalFeeBps = uint16(sum);
    }

    function setCurve(address curve_) external {
        require(msg.sender == factory, "ONLY_FACTORY");
        require(curve == address(0), "CURVE_ALREADY_SET");
        require(curve_ != address(0), "ZERO_CURVE");
        curve = curve_;
        emit CurveBound(curve_);
    }

    /// @notice Permanently redirect the creator's existing fee share to holder rewards.
    /// @dev This is deliberately one-way: it can reduce creator extraction but can
    ///      never increase the fee, restore creator routing or change other routes.
    function surrenderCreatorFeesToHolders() external {
        require(
            block.chainid != 56,
            "MAINNET_AUTOMATION_DISABLED"
        );
        require(msg.sender == creator, "ONLY_CREATOR");
        require(!creatorFeesSurrenderedToHolders, "ALREADY_SURRENDERED");
        require(creatorBps > 0, "NO_CREATOR_FEE");
        require(holderVault != address(0), "HOLDER_VAULT_NOT_CONFIGURED");

        creatorFeesSurrenderedToHolders = true;

        emit CreatorFeesSurrenderedToHolders(
            creator,
            holderVault,
            creatorBps
        );
    }

    function route(address asset, uint256 amount) external {
        require(msg.sender == curve, "ONLY_CURVE");
        require(amount > 0, "ZERO_AMOUNT");

        IERC20 token = IERC20(asset);
        uint256 distributed;

        address creatorDestination =
            creatorFeesSurrenderedToHolders
                ? holderVault
                : creator;

        distributed += _send(
            token,
            creatorDestination,
            amount * creatorBps / totalFeeBps
        );
        distributed += _send(
            token,
            holderVault,
            amount * holderBps / totalFeeBps
        );
        distributed += _send(token, buybackVault, amount * buybackBps / totalFeeBps);
        distributed += _send(token, liquidityVault, amount * liquidityBps / totalFeeBps);
        distributed += _send(token, treasury, amount * treasuryBps / totalFeeBps);

        // Assign rounding dust to protocol treasury.
        _send(token, protocolTreasury, amount - distributed);

        emit FeeRouted(asset, amount);
    }

    function _send(IERC20 token, address to, uint256 amount) internal returns (uint256) {
        if (amount == 0) return 0;
        require(to != address(0), "ROUTE_NOT_CONFIGURED");
        token.safeTransfer(to, amount);
        return amount;
    }
}
