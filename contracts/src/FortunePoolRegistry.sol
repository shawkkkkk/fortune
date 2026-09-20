// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

interface IFortuneV2FactoryLike {
    function getPair(address tokenA, address tokenB)
        external
        view
        returns (address pair);
}

interface IFortuneV3FactoryLike {
    function getPool(
        address tokenA,
        address tokenB,
        uint24 fee
    ) external view returns (address pool);
}

/// @notice Registry of known AMM pools used by Fortune's optional anti-farmer
///         protection. Anyone may register a pool that can be proven through an
///         owner-approved DEX factory. Governance cannot arbitrarily label an
///         address as a pool.
/// @dev The registry is deliberately separate from token ownership. Tax-token
///      protection only consults this registry during its immutable protection
///      window and never blocks ordinary wallet/contract transfers.
contract FortunePoolRegistry is Ownable2Step {
    enum FactoryKind {
        None,
        V2,
        V3
    }

    struct FactoryConfig {
        FactoryKind kind;
        bool active;
    }

    mapping(address => FactoryConfig) public factoryConfig;
    mapping(address => bool) public registeredPool;
    mapping(address => address) public poolFactory;

    event FactoryConfigured(
        address indexed factory,
        FactoryKind kind,
        bool active
    );
    event PoolRegistered(
        address indexed pool,
        address indexed factory,
        address indexed tokenA,
        address tokenB,
        uint24 fee
    );

    constructor(address initialOwner)
        Ownable(initialOwner)
    {}

    function configureFactory(
        address factory,
        FactoryKind kind,
        bool active
    ) external onlyOwner {
        require(
            factory != address(0) &&
                factory.code.length > 0,
            "BAD_FACTORY"
        );
        require(
            kind != FactoryKind.None,
            "BAD_FACTORY_KIND"
        );

        factoryConfig[factory] =
            FactoryConfig({
                kind: kind,
                active: active
            });

        emit FactoryConfigured(
            factory,
            kind,
            active
        );
    }

    function registerV2Pair(
        address factory,
        address tokenA,
        address tokenB
    ) external returns (address pair) {
        FactoryConfig memory config =
            factoryConfig[factory];

        require(
            config.active &&
                config.kind == FactoryKind.V2,
            "V2_FACTORY_NOT_APPROVED"
        );

        pair =
            IFortuneV2FactoryLike(factory)
                .getPair(tokenA, tokenB);

        require(
            pair != address(0) &&
                pair.code.length > 0,
            "PAIR_NOT_DEPLOYED"
        );

        _register(
            pair,
            factory,
            tokenA,
            tokenB,
            0
        );
    }

    function registerV3Pool(
        address factory,
        address tokenA,
        address tokenB,
        uint24 fee
    ) external returns (address pool) {
        FactoryConfig memory config =
            factoryConfig[factory];

        require(
            config.active &&
                config.kind == FactoryKind.V3,
            "V3_FACTORY_NOT_APPROVED"
        );

        pool =
            IFortuneV3FactoryLike(factory)
                .getPool(
                    tokenA,
                    tokenB,
                    fee
                );

        require(
            pool != address(0) &&
                pool.code.length > 0,
            "POOL_NOT_DEPLOYED"
        );

        _register(
            pool,
            factory,
            tokenA,
            tokenB,
            fee
        );
    }

    function _register(
        address pool,
        address factory,
        address tokenA,
        address tokenB,
        uint24 fee
    ) internal {
        require(
            tokenA != address(0) &&
                tokenB != address(0) &&
                tokenA != tokenB,
            "BAD_PAIR"
        );

        if (!registeredPool[pool]) {
            registeredPool[pool] = true;
            poolFactory[pool] = factory;

            emit PoolRegistered(
                pool,
                factory,
                tokenA,
                tokenB,
                fee
            );
        }
    }
}
