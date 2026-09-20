// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IFortuneFactoryView {
    function curveIndexPlusOne(address curve)
        external
        view
        returns (uint256);

    function liquidityVaultForCurve(address curve)
        external
        view
        returns (address);
}
