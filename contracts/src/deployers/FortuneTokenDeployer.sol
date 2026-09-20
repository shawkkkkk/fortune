// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FortuneToken} from "../FortuneToken.sol";
import {IFortuneTokenDeployer} from "../interfaces/IFortuneTokenDeployer.sol";

contract FortuneTokenDeployer is IFortuneTokenDeployer {
    function deploy(
        address fortuneFactory,
        string calldata name,
        string calldata symbol,
        uint256 supply,
        bytes32 manifest,
        bytes32 salt
    ) external returns (address token) {
        require(msg.sender == fortuneFactory, "ONLY_FACTORY");
        token = address(
            new FortuneToken{salt: salt}(
                fortuneFactory,
                name,
                symbol,
                supply,
                manifest
            )
        );
    }

    function predict(
        address fortuneFactory,
        string calldata name,
        string calldata symbol,
        uint256 supply,
        bytes32 manifest,
        bytes32 salt
    ) external view returns (address token) {
        bytes32 initCodeHash = keccak256(
            abi.encodePacked(
                type(FortuneToken).creationCode,
                abi.encode(
                    fortuneFactory,
                    name,
                    symbol,
                    supply,
                    manifest
                )
            )
        );

        token = address(
            uint160(
                uint256(
                    keccak256(
                        abi.encodePacked(
                            bytes1(0xff),
                            address(this),
                            salt,
                            initCodeHash
                        )
                    )
                )
            )
        );
    }
}
