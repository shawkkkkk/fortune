# Budgeted receipt reconciliation

This integration reached main through #78 with #77 and #74 (including #73) as
reviewed dependencies. Those sources are now integrated; the original stack no
longer requires retargeting. #74's transaction-identity guard is required: a changed swap log
index must not create a second trusted observation of the same transaction.

## Durable hold before network work

`reconcileBudgetedReceipt` binds the journal market policy, budget's allowed market
and actual gas payer, two distinct clients and an existing transaction reservation.
Policy/client failures stop before provider reads or a new hold. The book commits
a random fenced recheck hold **before** awaiting the receipt verifier. Every hold
blocks new reservations across the whole book and counts the greater of the old
ceiling and recorded cost, even if a prior charge's rolling window has expired.

The existing two-client receipt verifier returns fresh branded evidence. The
journal commits it first. Only then does a successful budget charge atomically
clear its own matching hold. Repeated evidence does not reset the charge clock.
Wrong/missing fences cannot clear another recheck. Distinct transaction rechecks
may proceed concurrently; any remaining hold keeps new reservations blocked.

Provider unavailability, a reorg, changed evidence, budget overrun or journal
failure triggers a permanent budget freeze and quarantine of known journal rows.
The coordinator attempts both conservative writes independently and reports a
hard error if either cannot persist. No raw provider errors are returned. There
is no automatic retry, unquarantine, cancellation or hold expiry. Pending holds
survive process death and do not become capacity merely because time passes.

## Schema and recovery boundary

The budget schema is **version2**, with a fenced-hold table. It rejects version1
books created by #77 and makes no automatic data migration or policy repin. The
v1 implementation likewise rejects v2 books instead of ignoring their holds.
Preserve old files for review; do not delete/recreate them or edit SQL to recover
capacity. The explicit offline schema migration tool is now documented in
`NATIVE_GAS_BUDGET_MIGRATION.md`; constructors never migrate automatically.
Manual offline cutover and separate schema2 hold recovery remain required before
an existing installation can operate an unattended service. Journal schema/policy is unchanged.

A crashed recheck is intentionally not resumed by a new worker: it cannot acquire
a second hold or clear the old fence. Protected recovery needs a separately
reviewed design and retained fresh evidence. Do not advertise crash recovery as
complete or deploy this as an unattended service without that recovery path.

Two SQLite files are not one atomic settlement. Before journal commit, an existing
hold prevents release. Between journal commit and charge, the hold still blocks.
On an error, a persisted budget freeze can precede journal quarantine. A storage
failure, host rollback or loss of both files requires stopping the host and
operator investigation; no local report proves chain freshness or release authority.
A crash during a failed recheck can leave an observed journal row plus a budget
hold. Downstream services must honor both stores and never trust a journal row
or queue-done flag alone as spend permission.

## Queued budgeted observations

`observeNextBudgetedReceipt` connects the existing queue lease to this coordinator.
It requires matching queue/journal market hashes and distinct clients before
claiming work. A blocked gas book leaves the queue untouched. For a claimed known
reservation, the durable hold precedes RPC, journal evidence commits before the
gas charge, and only a reconciled result can complete the queue lease. It never
reserves for or submits a transaction. The existing journal-only observer remains
available for callers without this explicitly selected budgeted path.

A quarantine result leaves the job leased and the book blocked; a persistence
error is surfaced without automatically retrying or clearing the hold. Expired
or failed queue completion cannot undo the two earlier commits. If those commits
completed and no hold/freeze remains, a later lease can replay the receipt without
duplicating its charge or resetting its charge time. A crashed pending hold still
requires separate operator investigation. These are three independent SQLite
stores, not atomic settlement, automatic hold recovery or a deployed supervisor.
Queue completion does not attest ongoing receipt freshness or spending authority.

Real-file tests cover ordering, reopen/deduplication, preflight rejection,
quarantine/blocked restart, completion expiry/replay and uncertain persistence.
The local Pancake fork rehearsal now uses this queue-to-coordinator operation for
both actual swaps, rather than calling the coordinator and journal-only observer
as separate steps. Both clients still use one local fixture; a passing exact-head
runtime report is required evidence, not implied by this source change.

## Operator invocation

The CLI requires both existing initialized matching files; it does not initialize,
reserve for, migrate, sign or broadcast a transaction. Both manifests are bounded
to16KiB. The endpoints must be reviewed distinct HTTPS origins; different origins
alone do not prove independent provider operation. Each RPC call has an8second
timeout and no transport retries. Protect paths, clock, custody and credentials.

```bash
FORTUNE_ARBITRAGE_READ_RPC_URL=https://<reviewed-provider-one> \
FORTUNE_ARBITRAGE_SECONDARY_RPC_URL=https://<reviewed-provider-two> \
node --import ./scripts/register-ts.mjs scripts/run-budget-reconciliation.mjs \
  /protected/market.json /protected/gas-policy.json \
  /durable/fills.sqlite /durable/gas-v2.sqlite <known-transaction-hash>
```

The count-free result contains a fixed state and false execution/profit flags.
The CLI also reports a separate point-in-time `bookBlocked` snapshot; another
pending hold or permanent freeze makes its exit nonzero even if this receipt
reconciled. Quarantine or an unavailable operation also exits nonzero. CLI errors omit hashes,
paths, credentials, provider messages and fences. No destination receives alerts.

This remains native-gas accounting over known hashes. It is not signer enforcement,
unsigned-plan binding, global cross-chain value/inventory/profit settlement, an
independent-provider attestation, a deployed worker or public testnet readiness.
Only supported successful swap receipts can reconcile; unknown/reverted/approval/
bridge transactions cannot free capacity. A funding-scope label does not establish
custody provenance; creator/holder/liquidity allocations cannot fund strategy gas.

Seven new tests use real SQLite and a real child-process exit with receipt-provider
fixtures. They cover ordering, stale-window holds, failed/conflicting evidence,
partial-write errors, process death, fences, schema rejection and CLI privacy.
They are not public RPC, public deployment or live two-provider evidence. Existing
Standard fingerprint, root dependencies and launch catalog gates are unchanged.

## Actual local-RPC integration rehearsal

`contracts-omnichain/scripts/strategy-vault-runtime.mjs` now invokes the actual
coordinator over two mined local vault swaps through the budgeted queue observer.
Both client objects forward to the same zero-account Anvil
BSC Testnet fork. Each forwarded RPC action checks that a committed budget hold
already blocks reservations; each coordinator journal commit is reopened read-only
while that hold is still present. Exact receipt gas (`gasUsed * effectiveGasPrice`)
must equal the two charged entries. Reopening and rechecking a successful hash
must preserve charge time, cost and evidence without duplication.

The rehearsal also restores the reviewed #75 aged-revalidation/history-rollback
drill, which was absent from main's runtime script despite the PR's merged status.
An actual local `evm_revert` removes the swaps. Revalidation must quarantine both
journal rows; coordinator rechecks must then freeze both budget entries and retain
both holds across reopening. Done queue jobs remain idle and cannot clear either
store's quarantine. The JSON artifact records these assertions only after they
all pass; engine CI retains it and the log, and fails on missing RPC evidence.

These are fixture-only limits and temporary stores, not existing operator books
or proposed live budgets. Reservations occur over known mined hashes; this does
not bind an unsigned order to a signer or prevent a wallet from overspending.
Only the two successful swap gas charges are accounted here: deployment, approval,
reverted/revoked calls and other gas are excluded, not free capacity for a service.
There is no hold recovery, independent-provider/public coordinator evidence,
public deployment, host provisioning, profit allocation or execution authority.
Local VM impersonation uses no private keys, generated accounts or public broadcasts.

Run the existing engine CI command after compiling its pinned artifacts:

```bash
FORTUNE_ANVIL_BIN=<pinned-local-anvil-1.7.1> \
FORTUNE_STRATEGY_FORK_RPC_URL=https://bsc-testnet-dataseed.bnbchain.org \
node --import ./scripts/register-ts.mjs contracts-omnichain/scripts/strategy-vault-runtime.mjs
```

An unavailable upstream/fork or failed assertion is a failed rehearsal. The
source alone is not a passing run; inspect the exact-head CI report and logs.

The October 28, 2026 local run at source block **139449642** passed two swaps,
120 forwarded client actions with visible persisted holds, three journal commits
while held (including replay), and exact combined swap gas of
**652322000000000 native wei**. Replay preserved both charge rows; rollback
quarantined both journal rows and retained two frozen budget holds after reopen.
This is a point-in-time local fork observation, not retained CI evidence or a
public coordinator deployment. Its temporary stores were removed after the run.
