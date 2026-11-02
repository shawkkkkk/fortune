# Bounded testnet strategy execution

`contracts-omnichain/src/FortuneTestnetStrategyVault.sol` is an isolated, unaudited execution primitive for future Fortune agents and omnichain strategies. It is not part of frozen Standard, Burn + Rewards, holder claims, creator fees or launch liquidity. There is no deployment script, live vault address, public signing UI or funded bot in this change.

## Enforced scope

The constructor allows only chain 97, 84532 or 11155111. Every mutating operation also checks the original deployment chain. Mainnet deployment and execution fail closed. Other testnets still require their own reviewed venue configuration; this allowlist is not evidence of a live route.

Each vault has exactly two fixed ERC-20 assets, one router, one canonical V3 pool and one fee tier. Runtime hashes for both assets, router, factory and pool are pinned at construction and checked before trading. The pool and router must report the configured factory; factory lookup, token ordering and fee must match. Runtime hashes do not prove proxy implementation immutability or plain-token behavior. Only independently reviewed, non-upgradeable, non-rebasing, non-taxed assets are intended for this adapter.

The operator can call only `executeSwap`. The contract constructs exact-input single-pool calldata itself, fixes the recipient to the vault, approves exactly that input amount and clears the allowance after the call. It checks exact input balance decrease, actual output balance increase, router-reported output and the minimum output. A partial fill, bad return, underpayment, residual allowance, code/route change or failed venue call reverts the transaction, including nonce and budget changes. There is no arbitrary call target, recipient, bridge, LP-management, native-payment or allowance-management endpoint for the operator.

## Spending, price and freshness policy

Per-asset maximum input per trade, rolling 24-hour input cap and minimum reserve are fixed at construction. A bounded ring retains up to 64 successful trades per asset within the previous 24 hours; only expired individual spends leave the cap. A 65th unexpired trade fails closed, even if monetary budget remains. Updating policy, pausing, rotating an operator or crossing a calendar/window boundary cannot reset those spends. Input assets have separate base-unit budgets; they are not added together as a dollar total or a cross-chain global exposure limit.

The governor configures both minimum conversion ratios in Q96 **base units**, only while paused. The floor expires within at most one hour. It is an absolute owner-reviewed price floor, not a price oracle, market quote, valuation or guaranteed loss limit. The order's minimum can increase that floor, never weaken it; division rounds up. Orders also need the current authorization epoch, the exact next nonce and a deadline no more than two minutes away and no later than policy expiry. Resuming execution changes the epoch, invalidating saved orders. Block timestamps control expiry and the rolling window; validator timing and finality assumptions still need review.

No always-on repricing or policy signer is implemented. The operator cannot refresh its own floor unless it is also configured as governor; overlapping those roles weakens separation of duties and must be disclosed. A fresh-looking external quote never bypasses these contract bounds.

The receipt reader has a separate pinned-vault mode that binds the actual operator transaction, generated order/event ABI, pool fill and wallet deltas. Legacy direct-router journal identities remain unchanged. See `ARBITRAGE_RECEIPT_JOURNAL.md` for configuration and the EOA-only operator path. The reader records evidence; it does not authorize the next order or establish that constructor caps and role addresses were independently approved.

## Authority and custody

| Role | Power |
| --- | --- |
| Governor (fixed) | Set operator and expiring price floors while paused, unpause, pause, revoke operator, and withdraw reviewed assets to the fixed treasury while paused |
| Guardian (fixed, distinct from governor) | Pause or revoke the operator; cannot unpause, change pricing or withdraw |
| Operator (replaceable while paused) | Execute only the bounded swaps; cannot withdraw, change destination, enlarge immutable caps or choose arbitrary calldata |
| Treasury (fixed) | Receive governor withdrawals; no automatic holder/investor claims or share accounting |

The governor can recover **all** reviewed assets while paused, including reserve-floor amounts. Reserves constrain the operator, not owner withdrawal rights. This is owner-controlled strategy capital, not trustless investor custody. Lost fixed-role access and accidentally transferred foreign tokens/forced native currency do not have a general recovery path. Normal native transfers are rejected. Review addresses before funding; do not send creator earnings, holder liabilities, launch reserves or platform funds owed elsewhere. The code cannot establish the provenance of a direct token donation.

There is no mandatory capital yield, fee, buyback percentage or new Fortune/strategy-token CA. Swaps are not a realized-profit ledger. Native gas, bridge costs, two-leg execution, inventory, global receipt deduplication and settlement still need the separate worker/reconciliation stack. Native gas spent by the caller is not capped by this vault's token budgets. Separate chain vaults do not enforce a shared global budget or atomic cross-chain trade. Price gaps and losses can remain.

## Verification and reproduction

The existing pinned isolated compiler/dependencies are reused; no root dependency or frozen release files change. Local unit/fuzz tests cover permissions, caps, reserve floors, strict rolling expiry, ring saturation, ceiling rounding, code/pool changes, residual approvals, invalid epochs/nonces/deadlines, revocation, replay, reentry and rollback of bad fills. Two invariant properties run 128 campaigns of 64 calls each; unexpected failures are recorded and successful execution is required so a wholly disabled executor cannot make the checks vacuously pass.

Two additional tests use the actual Pancake V3 factory/router/position manager on a **local BSC Testnet fork**, with newly created synthetic assets and liquidity in that local fork only. The October 27, 2026 run at block **139268161** passed swaps in both directions, exact custody/allowance checks, an unfillable-output rollback, revocation and treasury recovery. No transaction was broadcast to the public network and no Fortune vault or synthetic asset was deployed there. Addresses come from PancakeSwap's [official V3 address table](https://developer.pancakeswap.finance/contracts/v3/addresses), checked on that date. This is venue-integration evidence, not a public deployment, cross-chain route, audit or independent runtime-hash review.

A separate Anvil 1.7.1 RPC rehearsal passed on October 27, 2026 at source blocks **139270794** and **139271015**: actual vault transactions swapped twice through the real forked venue, the receipt reader checked calldata/events/transfers and native gas, and SQLite retained exactly two observations across reopen/retry. Mined bad-fill and revoked-operator transactions reverted; treasury recovery passed. The runner starts with **zero generated accounts**, uses local VM impersonation and constructs every writable client from a fresh loopback URL. It uses no private keys or public broadcasts. Its two receipt clients point at **one local fixture**; that does not establish agreement from independent public providers. Synthetic fixture pins are observed for testing, not independently approved deployment manifests.

The queued-observer integration rehearsal passed on October 27, 2026 at source block **139280665**. Both actual local vault transaction hashes entered the durable queue; `observeNextReceipt` verified and journaled them before marking their jobs done. Closing/reopening both SQLite files preserved exactly two journal rows and two done jobs; duplicate enqueue returned false and the next observation was idle. The existing native-gas, bad-fill rollback, revocation and treasury-recovery checks still passed. This extends the local fixture pipeline, not public provider independence, a deployed worker, continuous revalidation or complete strategy settlement. The existing CI runtime command retains the added queue counters in its JSON report. See `RECEIPT_OBSERVER_QUEUE.md` for lease and trusted-host boundaries.

```bash
cd contracts-omnichain
npm ci --ignore-scripts
git clone https://github.com/foundry-rs/forge-std.git lib/forge-std
git -C lib/forge-std checkout 8bbcf6e3f8f62f419e5429a0bd89331c85c37824
npm test
FORTUNE_STRATEGY_FORK_RPC_URL=<BSC_TESTNET_READ_RPC> FORTUNE_STRATEGY_FORK_BLOCK=139268161 node scripts/run-forge.mjs test --match-contract FortuneTestnetStrategyVaultForkTest -vv
node scripts/run-forge.mjs fmt --check src test
node scripts/check-sizes.mjs
node scripts/export-strategy-abi.mjs --check
cd ..
npm ci --ignore-scripts
npm install --prefix /tmp/fortune-strategy-anvil --no-package-lock --ignore-scripts --no-audit @foundry-rs/anvil-linux-amd64@1.7.1
FORTUNE_ANVIL_BIN=/tmp/fortune-strategy-anvil/node_modules/@foundry-rs/anvil-linux-amd64/bin/anvil node --import ./scripts/register-ts.mjs contracts-omnichain/scripts/strategy-vault-runtime.mjs
```

Without the fork RPC variable, Foundry explicitly skips the fork contract; normal tests alone are not fork evidence. The dedicated CI fork step supplies a public read RPC and fails on unavailable/failed execution rather than treating it as a pass. Omit the optional block variable for a fresh snapshot; the log records the actual block. A historical run needs a provider retaining that block. CI preserves its fork log and the RPC rehearsal report. The RPC rehearsal defaults to a fresh fork snapshot because public providers may prune historical state; an unavailable snapshot fails rather than falling back to mocked execution. No private key, user wallet or broadcast flag is required.

## Remaining gates

This is the first constrained swap primitive, not a complete autonomous project agent or managed-liquidity engine. Required next: independently reviewed manifests and asset behavior, native/global exposure limits, oracle/price-policy design, durable jobs and live receipt reconciliation, failed-leg unwind, bridge/rebalance handling, operator/key custody, incident/recovery drills, loss disclosures and economic tests. Any public testnet deployment needs owner-reviewed public role addresses, policy/capital limits, protected deployment/faucet funding and retained verification evidence. No owner signing service or deployment workflow is provisioned here. Independent security/legal/governance/operations review and all normal release gates remain mandatory before any real-value use.

Runtime failure diagnostics retain fixed failure-kind labels, the current operation label and source block, never raw provider exceptions. Deployment receipt failures additionally use the bounded local-only observations described below. The original queued integration CI run 40563972272 failed during vault configuration before reaching the observation queue; its generic log did not establish a root cause. Fresh local reruns passed at blocks 139284904 and 139284955 on October 27, 2026. The diagnostic update preserves nonzero failure status and fresh-fork checks; it does not infer that a failed attempt passed or waive unavailable-provider evidence. CI now captures sanitized stderr in the retained runtime log, and changes to the observation queue trigger the engine workflow.

## Bounded local deployment diagnostics

After a submitted local deployment fails its unchanged receipt/assertion checks,
the fixture emits a deployment ordinal and at most five concurrent read-only
loopback observations: the submitted transaction, latest block, sender latest
and pending nonces, and transaction-pool counts. Exact hash/from/deployment-target
binding and canonical uint256 quantities are required. Only status, nonce, gas,
fee, block and pool-count fields are retained; raw exceptions, addresses, hashes,
calldata, URLs and unknown fields are omitted. An absent legacy base fee stays
null. Unavailable/malformed/late observations are labeled rather than guessed.

One real three-second diagnostic deadline bounds waiting for all five reads;
late completions cannot mutate output. In-flight reads are not cancelled and
event-loop delays can delay timers. These are non-atomic observations of ONE
local fixture, not a consistent block snapshot or proof of a failure's cause.
The report always retains `failureCauseEstablished: false`. No remote provider exception or raw Anvil stderr is serialized. A separate fixed
label classifies only the last16,384 in-memory stderr characters; that label
does not establish which message caused the failure or prove causation. This
bounds retained text, not upstream buffers or process-wide memory. A send that fails before returning a hash retains
the existing generic failure label without transaction diagnostics.

The original failure still exits nonzero, no passing report is written, and the
30-second receipt limit, eight-second local transport limit, startup/fork/receipt
checks and workflow budgets remain unchanged. Diagnostics never mine, replace,
retry, change fees/nonces, fall back to mocks or approve a failed run. Dedicated
CI tests include a real zero-account standalone Anvil transaction deliberately
left pending by test-only disabled automining, read-only observation with no block
advance, then separately explicit local mining. This is a fixture test, not a
reproduction or diagnosis of earlier public-fork CI timeouts.

PR150 engine run41359605798 failed at local deployment in attempts1 and2;
controlled latest-fork local repeats passed while a historical-height probe
failed earlier on unavailable fork state. Those observations do not establish
causation or retroactively pass either failed attempt. This diagnostic addition
changes no contract, dependency/root pin, capital/economic policy, signer,
configuration, financial authority or release gate.

```bash
FORTUNE_ANVIL_BIN=/tmp/fortune-strategy-anvil/node_modules/@foundry-rs/anvil-linux-amd64/bin/anvil node --test contracts-omnichain/scripts/runtime-transaction-diagnostic.test.mjs
```
