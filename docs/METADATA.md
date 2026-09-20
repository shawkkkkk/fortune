# Editable token metadata

Fortune supports **editable presentation metadata** without mutating the ERC-20 contract identity.

## Why it is separate

On EVM chains, `name()` and `symbol()` are part of the token contract interface and are consumed by wallets, explorers, DEXs and indexers. Silently changing those values after launch creates integration and trust problems.

Fortune therefore separates:

### Immutable token identity

Stored in `FortuneToken`:

- contract address;
- ERC-20 name;
- ERC-20 symbol;
- fixed supply;
- Launch Manifest hash.

These do not change.

### Fortune display metadata

Stored in `FortuneMetadataRegistry`:

- display name;
- display ticker;
- description;
- image URI;
- website;
- X profile;
- Telegram.

A creator may choose **Editable** or **Immutable** when launching.

## Editable mode

If editable metadata is enabled:

1. the factory registers the initial metadata at revision 1;
2. only the launch creator may submit a new revision;
3. every update increments the revision and emits `MetadataUpdated`;
4. the creator may permanently freeze the metadata;
5. once frozen, it can never be edited again.

Fortune clients should display the current revision and a visible **Editable metadata** badge until the record is frozen.

## Immutable mode

If a creator chooses immutable metadata at launch, the metadata record is frozen immediately at revision 1.

## Transparency

Economic terms remain part of the immutable Launch Manifest. Editable metadata must never be able to change:

- token supply;
- curve parameters;
- quote assets;
- fee routing;
- reward settings;
- graduation settings;
- stock-floor reserves;
- perp reference configuration.

Changing the display ticker from `OLD` to `NEW` changes how Fortune presents the project; it does **not** change the token contract's ERC-20 symbol.

## Future UI

A creator-management screen should read the current record from `FortuneMetadataRegistry`, show revision history from events, preview edits, submit an onchain update, and expose a separately confirmed **Freeze forever** action.
