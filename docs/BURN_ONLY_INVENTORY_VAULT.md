# Isolated testnet burn-only inventory vault

`FortuneTestnetBurnVault` is an unaudited chain97 component for M01/M08's
launch-token burn invariant. It is not a Standard upgrade, deployed fee collector,
buyback, reward or platform-recirculation engine. No fee rate, Fortune CA or
public configuration is introduced.

Immutable policy pins governor, distinct guardian, one token/runtime hash,
nonzero launch manifest and positive uint128 per-call maximum. Constructor,
opening and each burn require the token's deployment chain97/manifest and disabled
bridge. Every mutable entry rejects other chains; the vault starts paused.
Only governor can open; guardian can pause. While open anyone may burn existing
inventory, including the governor. The maximum bounds each call, not daily volume:
repeated calls may intentionally burn all received inventory. There is no token
pull, approval, transfer, swap, withdrawal, sweep, arbitrary call or recovery exit.

The token's own `burn(amount)` must reduce vault balance and local total supply
by exactly the amount and increase `permanentlyBurned` by exactly that amount.
Runtime/identity/bridge policy is rechecked after the call. Zero, oversized or
unfunded burns reject. Inexact burns revert token changes, vault totals and logs
atomically; an operator must inspect state before explicitly retrying. Vault
`totalBurned` counts only its own successful actions, not the token's historical
counter or any other holder's burns. `InventoryBurned` records sequence, caller,
amount and vault cumulative total. This is not a global cross-chain supply ledger.

Send only deliberately allocated launch-token burn inventory. Received tokens
are irrecoverable except by burning while policy and pause permit it. No deposit
interface, donation or capital label proves fee origin, legitimate allocation or
custody approval. Creator, holder, LP liabilities and reserves must never fund
agent strategies. Pair-asset rewards and earned protocol recirculation are separate
allocations and cannot be double-counted here. Launch-token inventory cannot be
sold through this vault. Unrelated tokens/native currency have no recovery path.

Runtime pins are trusted policy, not proxy/issuer/admin safety review. Changed
code/manifest/bridge state, incompatible token controls, blacklist/rebase behavior
or governance loss can strand inventory. No bypass or insurance exists. The
current supported source is the isolated Fortune OFT with explicit permanent
burn accounting; arbitrary burnable tokens are not automatically compatible.

Unit/fuzz/invariant tests cover roles/chain/pause, amount limits, identity changes,
no-op/supply-only/counter-only burns, atomic rollback/retry and inventory
conservation. The existing retained two-local-EVM route rehearsal additionally
uses the actual compiled OFT and vault, with zero generated accounts/local VM
impersonation: direct inventory transfer, paused/cap/unfunded rejection, two burns,
exact Transfer/PermanentBurn/InventoryBurned receipt binding and balance/supply/
counter reconciliation. Synthetic mocks/clients of the same fixture are not
independent providers, public deployment, fee provenance or production custody.

The existing direct-burn reader supports direct token burn transactions. A nested
vault burn is a different outer call and is not covered by that reader; no public
receipt badge, accumulated totals or evidence ingestion is enabled. The retained
runtime's earlier direct-burn observation remains historical at its own block.
Source integration and passing tests do not complete M01/M08, fee collection,
signer/global limits, public service, independent audit/legal/asset/governance/
operations review or mainnet readiness. These gates remain fail closed.
