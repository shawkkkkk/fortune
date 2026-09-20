// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Transparent mutable presentation metadata for Fortune-created tokens.
/// @dev ERC-20 name/symbol remain immutable at the token-contract level.
///      Fortune clients may render these display fields instead.
contract FortuneMetadataRegistry {
    struct Metadata {
        string displayName;
        string displaySymbol;
        string description;
        string imageURI;
        string website;
        string xProfile;
        string telegram;
        string github;
        string youtube;
        string debox;
    }

    struct Record {
        address creator;
        bool editable;
        bool frozen;
        uint64 revision;
        Metadata metadata;
    }

    address public immutable binder;
    address public factory;
    mapping(address => Record) private _records;

    event FactoryBound(address indexed factory);

    event MetadataRegistered(
        address indexed token,
        address indexed creator,
        bool editable,
        uint64 revision
    );

    event MetadataUpdated(
        address indexed token,
        address indexed creator,
        uint64 revision
    );

    event MetadataFrozen(
        address indexed token,
        address indexed creator,
        uint64 revision
    );

    constructor(address binder_) {
        require(
            binder_ != address(0),
            "ZERO_BINDER"
        );
        binder = binder_;
    }

    /// @notice One-time factory binding permits the registry to be deployed
    ///         before FortuneFactory, avoiding circular deployment and oversized
    ///         factory runtime bytecode.
    function bindFactory(address factory_) external {
        require(msg.sender == binder, "ONLY_BINDER");
        require(factory == address(0), "FACTORY_ALREADY_BOUND");
        require(
            factory_ != address(0) &&
                factory_.code.length > 0,
            "BAD_FACTORY"
        );

        factory = factory_;
        emit FactoryBound(factory_);
    }

    function registerToken(
        address token,
        address creator,
        bool editable,
        Metadata calldata initialMetadata
    ) external {
        require(msg.sender == factory, "ONLY_FACTORY");
        require(token != address(0) && creator != address(0), "ZERO_ADDRESS");
        require(_records[token].creator == address(0), "ALREADY_REGISTERED");

        _records[token] = Record({
            creator: creator,
            editable: editable,
            frozen: !editable,
            revision: 1,
            metadata: initialMetadata
        });

        emit MetadataRegistered(token, creator, editable, 1);

        if (!editable) {
            emit MetadataFrozen(token, creator, 1);
        }
    }

    function updateMetadata(
        address token,
        Metadata calldata nextMetadata
    ) external {
        Record storage record = _records[token];
        require(record.creator != address(0), "NOT_REGISTERED");
        require(msg.sender == record.creator, "ONLY_CREATOR");
        require(record.editable && !record.frozen, "METADATA_FROZEN");

        record.metadata = nextMetadata;
        record.revision += 1;

        emit MetadataUpdated(token, msg.sender, record.revision);
    }

    function freezeMetadata(address token) external {
        Record storage record = _records[token];
        require(record.creator != address(0), "NOT_REGISTERED");
        require(msg.sender == record.creator, "ONLY_CREATOR");
        require(record.editable && !record.frozen, "ALREADY_FROZEN");

        record.frozen = true;

        emit MetadataFrozen(token, msg.sender, record.revision);
    }

    function metadata(address token)
        external
        view
        returns (Metadata memory)
    {
        require(_records[token].creator != address(0), "NOT_REGISTERED");
        return _records[token].metadata;
    }

    function record(address token)
        external
        view
        returns (
            address creator,
            bool editable,
            bool frozen,
            uint64 revision
        )
    {
        Record storage value = _records[token];
        require(value.creator != address(0), "NOT_REGISTERED");

        return (
            value.creator,
            value.editable,
            value.frozen,
            value.revision
        );
    }
}
