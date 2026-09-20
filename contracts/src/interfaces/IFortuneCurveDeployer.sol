// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IFortuneCurveDeployer {
    struct CurveParams {
        address factory;
        address launchToken;
        address registry;
        address feeRouter;
        address shieldVault;
        address[] quoteAssets;
        uint16[] weightsBps;
        uint256 basePriceUsd1e18;
        uint256 slopeUsd1e18;
        uint256 graduationUsd1e18;
        bool adaptiveGraduation;
    }

    function deploy(CurveParams calldata params)
        external
        returns (address curve);
}
