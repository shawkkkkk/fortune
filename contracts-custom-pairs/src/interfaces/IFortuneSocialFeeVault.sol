// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice What the custom-pair factory needs from the social fee vault.
interface IFortuneSocialFeeVault {
    /// @dev One slice of a launch's creator fee. Platform 0 is a plain wallet
    ///      (`wallet` set, `account` empty). Any other platform is a social
    ///      account (`account` is its canonical handle, `wallet` is zero) that
    ///      claims after verifying ownership.
    struct FeeShare {
        uint8 platform;
        string account;
        address wallet;
        uint16 shareBps;
    }

    function checkShares(FeeShare[] calldata shares) external view returns (bool ok, bytes32 reasonCode);

    function registerCurve(address curve, address token, FeeShare[] calldata shares) external;
}

/// @notice A contract whose creator fees the vault collects.
interface IFortuneCreatorFeeSource {
    function claimCreatorFees() external returns (uint256 pairDelivered);
}
