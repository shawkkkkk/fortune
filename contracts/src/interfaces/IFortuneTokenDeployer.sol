// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IFortuneTokenDeployer {
    struct TaxTokenParams {
        address fortuneFactory;
        address poolConfigurator;
        address poolRegistry;
        address quoteAsset;
        string name;
        string symbol;
        uint256 supply;
        bytes32 manifest;
        uint16 buyTaxBps;
        uint16 sellTaxBps;
        uint32 antiFarmerDuration;
        uint256 minimumDividendBalance;
        bytes32 salt;
    }

    function deploy(
        address fortuneFactory,
        string calldata name,
        string calldata symbol,
        uint256 supply,
        bytes32 manifest,
        bytes32 salt
    ) external returns (address token);

    function predict(
        address fortuneFactory,
        string calldata name,
        string calldata symbol,
        uint256 supply,
        bytes32 manifest,
        bytes32 salt
    ) external view returns (address token);

    function deployTax(
        TaxTokenParams calldata params
    ) external returns (address token);

    function predictTax(
        TaxTokenParams calldata params
    ) external view returns (address token);
}
