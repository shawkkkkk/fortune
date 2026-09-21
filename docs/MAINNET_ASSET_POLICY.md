# Fortune Mainnet v1 Asset Policy

Mainnet v1 starts with exactly one launchable quote asset: WBNB on BNB Smart Chain.

This is a canary constraint, not a claim that multi-asset curves are unsafe. Restricting the initial registry to one quote asset keeps cross-reserve arbitrage dormant while Fortune gathers real production evidence.

## Initial asset

### WBNB

- Token: `0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c`
- Oracle: Chainlink BNB/USD
- Feed: `0x0567F2323251f0Aab15c8dFb1967E4e8A7D42aeE`
- Maximum accepted oracle age: 600 seconds
- Quote enabled: yes
- Reward enabled: yes
- Graduation enabled: yes
- Restricted/RWA classification: no

The canonical machine-readable configuration is `mainnet-dependencies.json`.

BNB Chain's own documentation identifies the WBNB contract. Chainlink's BNB Chain Mainnet data-feed page identifies the BNB/USD feed, and the BscScan Chainlink label is used to expand/verify the full proxy address.

## Why one asset initially

With one quote asset:

- there is still one canonical Fortune curve;
- buy/sell integral behavior remains fully exercised;
- Pancake V3 graduation remains fully exercised;
- oracle staleness and quote-accounting protections remain fully exercised;
- no user can buy through reserve A and immediately sell into reserve B.

Adding a second quote asset changes the mainnet risk model and must not be treated as a routine catalog update.

## Requirements for adding another quote asset

Before governance enables a second production quote asset:

1. update `mainnet-dependencies.json` from primary sources;
2. review token transfer behavior and decimals;
3. verify a production-grade USD oracle and staleness policy;
4. verify sufficient real liquidity for the intended market;
5. rerun cross-reserve simulations under asynchronous oracle movements;
6. complete the MEV/cross-reserve review;
7. document legal/issuer/transfer restrictions;
8. execute the change through contract-based governance.

Restricted tokenized securities/RWAs remain out of scope for mainnet v1.

## Oracle staleness policy

The initial WBNB entry uses a 600-second maximum age. Fortune therefore fails closed if the snapshotted BNB/USD answer is older than ten minutes.

This value is intentionally a protocol tolerance rather than an assumption that an oracle will always update on a specific cadence. The independent oracle review may tighten it before activation.
