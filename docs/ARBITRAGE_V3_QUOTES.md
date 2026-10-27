# Read-only V3 arbitrage quotes

This is a read adapter and operator CLI stacked on PR #64's spread/profit policy. It adds no wallet, signing, approvals, public API, scheduled trading or deployed treasury. Every observation still returns `executionAuthorized: false`. Standard and every existing launch flow remain unchanged.

## What the adapter reads

`lib/arbitrage-v3-quotes.ts` calls the real QuoterV2 ABI through viem. A buy requests **exact output** in launched tokens; a sell requests **exact input** of the same raw launched-token quantity. The amounts returned are in the settlement token's units. Pool trading fees are already included in the Quoter result; do not subtract that fee again as a separate cost. Gas, bridge, inventory rebalancing and other costs still need independent quotes in the same settlement denomination. Quoter's gas estimate is swap simulation information, not the cost of a complete wallet transaction or bridge.

All contract code/identity reads and quote simulations pin one block number at least the configured depth behind the RPC head. The adapter checks the RPC chain, runtime hashes for factory/quoter/both assets, quoter's factory, canonical factory pool, pool factory/token ordering/fee, both token precisions and nonzero active liquidity. It checks that block's hash and timestamp again after simulation, rejects stale/future blocks and observations that expire during reading, and records the block/hash/time with the result. This is bounded reorg detection from one trusted RPC, not cryptographic proof, finality or provider redundancy.

Token and settlement comparison keys bind the manifest identity **and local decimals** with keccak256. Assets with different precision cannot silently share an accounting denomination or raw token-quantity identity. Symbols and dollar-price APIs never establish equivalence. The manifest's cross-chain identity mappings themselves still need independently reviewed deployment/bridge/redeemability evidence; this reader cannot authenticate those mappings. Equal keys do not prove that two chains' assets can be bridged or redeemed at equal value.

## Reviewed manifest

Supply operator-reviewed JSON with this shape; no ready-to-trade market is bundled:

```text
chainId: 97 | 84532 | 11155111
factory: { address, codeHash }
quoter: { address, codeHash }
token: { address, codeHash, identity, decimals, profile: "plain-erc20" }
settlement: { address, codeHash, identity, decimals, profile: "plain-erc20" }
fee: integer V3 fee tier
confirmations: integer 1..256
maxBlockAgeMs: integer 1..60000
```

`codeHash` is keccak256 of the reviewed deployed runtime bytecode; `identity` is a nonzero bytes32 canonical asset identifier from the reviewed deployment manifest. Addresses/roles must be distinct. Both precisions must be integers from 0 to 18. Only reviewed plain ERC-20 assets are in scope. Fee-on-transfer, rebasing and upgradeable/proxy assets require separate adapters and behavior controls. Runtime hashes alone cannot establish those properties or reveal a proxy implementation change; setting `profile` is an operator assertion, not an onchain classification. Do not generate approval pins from the same untrusted RPC response being checked, or accept manifests from a public request.

PancakeSwap's [official V3 address table](https://developer.pancakeswap.finance/contracts/v3/addresses), checked October 27, 2026, lists the BSC Testnet factory and QuoterV2 already referenced by Fortune. It does not establish their runtime hashes, a usable token pool, or deployment addresses for the other testnets. Each additional venue/network needs its own verified manifest. The tuple layout follows the official [IQuoterV2 source](https://github.com/pancakeswap/pancake-v3-contracts/blob/main/projects/v3-periphery/contracts/interfaces/IQuoterV2.sol), blob `3c2961b2c704f44b3bb62937e743ca5395906b87` read on that date. Existing Standard ABIs/configuration are untouched.

## Read-only CLI

Configure `FORTUNE_ARBITRAGE_READ_RPC_URL` through the operator's server environment (HTTPS only), then:

```bash
node --import ./scripts/register-ts.mjs scripts/quote-arbitrage-v3.mjs /path/to/reviewed-testnet-market.json buy 1000000000000000000
```

Use `sell` for the corresponding sale observation. Token amounts are positive integer base units, never floating-point token values. Manifest input is bounded to 16 KiB. Output uses decimal strings for bigint values and preserves block provenance. Failures exit nonzero with a generic message so credential-bearing RPC URLs and upstream exceptions are not printed. No private key or wallet is required. This command neither submits transactions nor persists realized earnings.

Quote simulations have a fixed 2,000,000 gas cap. A route exceeding that simulation budget is unavailable; the reader never falls back to a spot-price estimate.

## Evidence and remaining scope

`tests/web/arbitrage-v3-quotes.test.mjs` exercises viem's actual HTTP transport and ABI encoding/decoding against a local JSON-RPC fixture. It checks buy/sell direction and quantity, block-pinned calls, wrong chain/code/pool/precision, empty liquidity, reverted/zero quotes, stale/future state, reorgs, expiry and integration with the spread-policy reducer. These are **fixture tests**, not a live cross-chain pool, fork execution, funds, receipt reconciliation or completed arbitrage.

A read-only public BSC Testnet probe on October 27, 2026 reached the configured reference pool's identity/precision checks but timed out at QuoterV2. Its hashes were self-observed for compatibility testing, not independently approved pins. No successful live quote or route evidence is claimed from that attempt. The adapter now explicitly bounds simulation gas; a real route must still pass with its reviewed configuration and provider.

Before enabling a route: retain the reviewed per-chain deployment manifests and fresh live/fork observations; add independent RPC/finality policy; verify canonical identity and settlement equivalence; reconcile dedicated balances, all costs and inventory; implement durable receipt accounting and enforced executor limits; rehearse adverse fills, partial legs, bridge delays, losses, restart/reorg and recovery. Neither a favorable quote nor this adapter's identity checks authorize spending. Optional strategy-token buybacks remain funded only from realized distributable strategy profit. No Fortune CA, live percentage, exact-price-parity or profit promise is introduced.
