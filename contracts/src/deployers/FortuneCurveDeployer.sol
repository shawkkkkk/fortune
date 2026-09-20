// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FortuneCurve} from "../FortuneCurve.sol";
import {IFortuneCurveDeployer} from "../interfaces/IFortuneCurveDeployer.sol";

contract FortuneCurveDeployer is IFortuneCurveDeployer {
    function deploy(CurveParams calldata p)
        external
        returns (address curve)
    {
        curve = address(
            new FortuneCurve(
                p.factory,
                p.launchToken,
                p.registry,
                p.feeRouter,
                p.shieldVault,
                p.quoteAssets,
                p.weightsBps,
                p.basePriceUsd1e18,
                p.slopeUsd1e18,
                p.graduationUsd1e18,
                p.adaptiveGraduation
            )
        );
    }
}
