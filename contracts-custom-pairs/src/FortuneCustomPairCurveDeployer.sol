// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FortuneCustomPairCurve} from "./FortuneCustomPairCurve.sol";

/// @notice Deploys custom-pair curves for the factory that created it.
contract FortuneCustomPairCurveDeployer {
    address public immutable factory;

    constructor() {
        factory = msg.sender;
    }

    function deploy(FortuneCustomPairCurve.Config calldata config) external returns (FortuneCustomPairCurve curve) {
        require(msg.sender == factory && config.factory == factory, "ONLY_FACTORY");
        curve = new FortuneCustomPairCurve(config);
    }
}
