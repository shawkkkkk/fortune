# Budgeted receipt reconciliation

This integration is stacked on #77 and incorporates #74 (including #73) as a
reviewed dependency. Merge those branches into main first, then retarget this PR
to main. Do not merge into an already-integrated feature branch. No active branch
is overwritten. #74's transaction-identity guard is required: a changed swap log
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
capacity. An explicit reviewed migration/recovery tool is still required before
existing installations can adopt this candidate. Journal schema/policy is unchanged.

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
