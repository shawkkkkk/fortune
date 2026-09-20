// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";

import {IFortunePositionManager} from "../interfaces/IFortunePositionManager.sol";

contract MockPositionManager is ERC721, IFortunePositionManager {
    address public lastCollectRecipient;
    uint256 public lastCollectTokenId;
    uint256 public nextAmount0;
    uint256 public nextAmount1;

    constructor() ERC721("Mock LP Position", "MLP") {}

    function ownerOf(uint256 tokenId)
        public
        view
        override(ERC721, IFortunePositionManager)
        returns (address)
    {
        return super.ownerOf(tokenId);
    }

    function mint(address to, uint256 tokenId) external {
        _mint(to, tokenId);
    }

    function setCollectAmounts(
        uint256 amount0,
        uint256 amount1
    ) external {
        nextAmount0 = amount0;
        nextAmount1 = amount1;
    }

    function collect(CollectParams calldata params)
        external
        payable
        returns (uint256 amount0, uint256 amount1)
    {
        require(
            ownerOf(params.tokenId) == msg.sender,
            "NOT_POSITION_OWNER"
        );

        lastCollectRecipient = params.recipient;
        lastCollectTokenId = params.tokenId;

        amount0 = nextAmount0;
        amount1 = nextAmount1;
    }
}
