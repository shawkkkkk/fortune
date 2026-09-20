// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @notice Immutable per-launch fee routing.
/// @dev Reward/buyback/LP destinations may be automation vaults that perform later conversions.
contract FortuneFeeRouter {
    using SafeERC20 for IERC20;

    uint16 public constant BPS = 10_000;

    address public immutable curve;
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

    event FeeRouted(address indexed asset, uint256 amount);

    constructor(
        address curve_,
        address creator_,
        address holderVault_,
        address buybackVault_,
        address liquidityVault_,
        address treasury_,
        address protocolTreasury_,
        uint16[6] memory splitBps
    ) {
        require(curve_ != address(0) && creator_ != address(0) && protocolTreasury_ != address(0), "ZERO_ADDRESS");
        uint256 sum;
        for (uint256 i; i < splitBps.length; ++i) sum += splitBps[i];
        require(sum == BPS, "BAD_SPLIT");

        curve = curve_;
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
    }

    function route(address asset, uint256 amount) external {
        require(msg.sender == curve, "ONLY_CURVE");
        require(amount > 0, "ZERO_AMOUNT");

        IERC20 token = IERC20(asset);
        _send(token, creator, amount * creatorBps / BPS);
        _send(token, holderVault, amount * holderBps / BPS);
        _send(token, buybackVault, amount * buybackBps / BPS);
        _send(token, liquidityVault, amount * liquidityBps / BPS);
        _send(token, treasury, amount * treasuryBps / BPS);

        uint256 routed = amount
            - (amount * creatorBps / BPS)
            - (amount * holderBps / BPS)
            - (amount * buybackBps / BPS)
            - (amount * liquidityBps / BPS)
            - (amount * treasuryBps / BPS);
        _send(token, protocolTreasury, routed);

        emit FeeRouted(asset, amount);
    }

    function _send(IERC20 token, address to, uint256 amount) internal {
        if (amount == 0) return;
        require(to != address(0), "ROUTE_NOT_CONFIGURED");
        token.safeTransfer(to, amount);
    }
}
