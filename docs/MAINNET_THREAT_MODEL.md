# Fortune Mainnet v1 Threat Model

This document defines the adversaries, trusted components, trust boundaries, and failure assumptions for the first real-value Fortune release on BNB Smart Chain mainnet.

Mainnet v1 is intentionally narrow: standard launches only, one quote asset (WBNB), a protocol-enforced $10,000 graduation ceiling, Pancake V3 graduation, no restricted RWAs, and no tax-token launches.

## Assets at risk

- user WBNB contributed to active Fortune curves;
- Fortune launch tokens held by users and reserved for graduation liquidity;
- protocol/creator/holder/buyback/liquidity fee allocations;
- Pancake V3 LP-position NFTs after graduation;
- governance authority over launch pause state, registry, oracle mappings, adapter selection, and automation adapter approvals.

## Trust boundaries

### Untrusted users and creators

Creators choose launch metadata and economics within protocol bounds. Users may submit arbitrary transaction ordering, calldata, slippage settings, and timing. No user or creator is trusted to behave economically or socially honestly.

The protocol must remain safe when creators choose extreme-but-allowed parameters, users front-run or back-run each other, users directly transfer ERC-20 balances into contracts, users repeatedly trigger permissionless graduation, or users deliberately cause transactions to revert.

### Governance

Governance is trusted to exercise explicit administrative powers correctly, but compromise is treated as a critical incident rather than an impossible condition.

Mainnet requires contract-based governance. Administrative actions are visible onchain and include pausing/unpausing new launches, registry asset configuration, Chainlink feed mapping, graduation-adapter selection, and automation-adapter approvals.

Governance cannot mint Fortune launch tokens, withdraw curve reserves arbitrarily, release permanently locked LP NFTs, or mutate immutable per-launch fee splits.

### Automation executor

The executor is allowed to call purpose-locked automation vaults but cannot choose arbitrary destinations. Vaults transfer funds only to adapters approved by the governance-controlled automation registry for that vault purpose.

Mainnet v1 requires the executor itself to be contract-controlled.

### External protocols and tokens

Fortune assumes BNB Smart Chain consensus, WBNB, the pinned Chainlink BNB/USD feed, and the pinned Pancake V3 contracts behave according to their deployed interfaces.

Failure cases considered include stale or reverting oracle data, Pancake pool state inconsistent with Fortune's graduation price, RPC disagreement or outage, unexpected ERC-20 accounting, and malicious unsolicited token transfers.

## Adversaries

### MEV/searchers

Capabilities include observing pending transactions, reordering/front-running/back-running public transactions, interacting directly with Fortune and Pancake, and creating pre-existing Pancake pools.

Controls include Launch Shield, the per-wallet early purchase cap, exact integral pricing, user min-output checks, graduation preflight, existing-pool price-deviation bounds, deadlines, and dust/slippage bounds.

Mainnet v1's single-reserve restriction removes cross-reserve arbitrage from the initial release.

### Malicious creator

A creator can choose metadata, choose economics inside protocol bounds, and receive an immutable creator fee allocation when configured.

Controls include no post-launch mint, no blacklist, no arbitrary reserve withdrawal, no mutable transfer tax in standard launches, immutable launch economics, fixed fee routing, and one-way creator fee surrender.

### Malicious token sender

An attacker may transfer WBNB or launch tokens directly into Fortune contracts.

Security expectation:
- unsolicited transfers do not create accounted graduation progress;
- reserve accounting distinguishes protocol-accounted balances from raw balances;
- excess balances do not let an attacker extract more accounted value than they own.

### Compromised frontend or RPC

A compromised UI/RPC may display false data or hide a transaction result.

Security expectation:
- wallet signing remains user-authorized;
- chain ID and live preflight are checked before critical writes;
- unknown transaction outcomes are resolved from chain receipts before retry;
- no server-held user private keys;
- release activation is not controlled by frontend configuration alone.

### Compromised deployer

The deployer key is temporary.

Security expectation:
- production deploys with launches paused;
- ownership enters Ownable2Step pending state for contract governance;
- governance explicitly accepts ownership;
- activation preflight rejects a factory not owned by governance;
- the deployer retains no intended protocol administration after handoff.

## Critical invariants

A violation of any item below is a security bug:

1. A standard Fortune token's total supply cannot increase after creation.
2. Curve reserve value cannot be withdrawn except through valid sells, graduation, fee routing, or the documented rescue path.
3. A buy/sell round trip cannot manufacture normalized quote value absent external oracle movement.
4. Graduation cannot consume more reserve or launch tokens than the curve transfers to the adapter.
5. Failed graduation cannot partially strand assets in the adapter or locker.
6. A locked Pancake LP NFT has no Fortune withdrawal/transfer path.
7. Mainnet v1 launch creation accepts exactly one quote asset and that asset is WBNB.
8. Mainnet v1 graduation target cannot exceed $10,000.
9. New mainnet launch creation begins paused after production deployment.
10. Governance must control the factory before activation.
11. Automation vault balances can move only through purpose-approved adapters.
12. Registry/oracle changes do not silently alter the snapshotted pricing configuration of already-created curves.
13. Stale oracle data fails closed for affected valuation/trading.
14. Direct token donations do not advance protocol-accounted graduation value.
15. Creator-first-buy either completes atomically or leaves no partially-created paid launch state.

## Explicitly out of scope for mainnet v1

- multi-reserve production launches;
- cross-reserve production arbitrage;
- tax-token launch architecture;
- restricted/tokenized securities as quote assets;
- proxy upgrades;
- arbitrary governance emergency withdrawals;
- guarantees against loss caused by underlying BNB Chain, WBNB, Chainlink, or Pancake protocol failure.

These features must not be enabled by configuration alone; where applicable, the current chain-56 factory enforces the v1 restriction.
