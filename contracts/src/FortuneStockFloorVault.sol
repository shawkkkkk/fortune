// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @notice Experimental reserve-backed floor vault for a Fortune launch.
/// @dev The floor is a redemption claim on the stock-token reserve held here.
///      There is deliberately no owner sweep or arbitrary withdrawal function.
contract FortuneStockFloorVault is ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public immutable launchToken;
    IERC20 public immutable floorAsset;
    address public immutable factory;

    bool public redemptionActive;
    uint256 public totalRedeemedLaunchTokens;
    uint256 public totalFloorAssetPaid;

    event FloorFunded(address indexed from, uint256 amount);
    event RedemptionActivated(uint256 reserveBalance);
    event Redeemed(
        address indexed account,
        uint256 launchTokenAmount,
        uint256 floorAssetAmount
    );

    constructor(
        address factory_,
        address launchToken_,
        address floorAsset_
    ) {
        require(
            factory_ != address(0) &&
                launchToken_ != address(0) &&
                floorAsset_ != address(0),
            "ZERO_ADDRESS"
        );

        factory = factory_;
        launchToken = IERC20(launchToken_);
        floorAsset = IERC20(floorAsset_);
    }

    function reserveBalance() public view returns (uint256) {
        return floorAsset.balanceOf(address(this));
    }

    /// @notice Fund the floor. The amount received must match exactly so
    ///         fee-on-transfer assets cannot silently underfund redemption.
    function fund(uint256 amount) external nonReentrant {
        require(amount > 0, "ZERO_AMOUNT");
        uint256 beforeBalance = reserveBalance();
        floorAsset.safeTransferFrom(msg.sender, address(this), amount);
        uint256 received = reserveBalance() - beforeBalance;
        require(received == amount, "NON_STANDARD_FLOOR_ASSET");
        emit FloorFunded(msg.sender, received);
    }

    function activateRedemption() external {
        require(msg.sender == factory, "ONLY_FACTORY");
        require(!redemptionActive, "ALREADY_ACTIVE");
        require(reserveBalance() > 0, "EMPTY_FLOOR");
        redemptionActive = true;
        emit RedemptionActivated(reserveBalance());
    }

    /// @notice Number of launch tokens still outside this vault.
    function redeemableSupply() public view returns (uint256) {
        uint256 total = launchToken.totalSupply();
        uint256 retired = launchToken.balanceOf(address(this));
        return total > retired ? total - retired : 0;
    }

    function previewRedeem(uint256 tokenAmount)
        public
        view
        returns (uint256 floorAssetAmount)
    {
        uint256 supply = redeemableSupply();
        require(supply > 0, "NO_REDEEMABLE_SUPPLY");
        return reserveBalance() * tokenAmount / supply;
    }

    function redeem(uint256 tokenAmount, uint256 minFloorAssetOut)
        external
        nonReentrant
        returns (uint256 floorAssetOut)
    {
        require(redemptionActive, "REDEMPTION_INACTIVE");
        require(tokenAmount > 0, "ZERO_AMOUNT");

        floorAssetOut = previewRedeem(tokenAmount);
        require(
            floorAssetOut >= minFloorAssetOut && floorAssetOut > 0,
            "SLIPPAGE"
        );

        launchToken.safeTransferFrom(
            msg.sender,
            address(this),
            tokenAmount
        );
        floorAsset.safeTransfer(msg.sender, floorAssetOut);

        totalRedeemedLaunchTokens += tokenAmount;
        totalFloorAssetPaid += floorAssetOut;

        emit Redeemed(msg.sender, tokenAmount, floorAssetOut);
    }
}
