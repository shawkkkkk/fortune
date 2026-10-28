# Offline native-gas book migration

This explicit operator tool upgrades the known PR77 schema1 budget book to the
schema2 fenced-recheck layout. It is never called by constructors, public APIs,
keepers or deployments. No existing operator files were migrated by this change.
Tests use temporary files from the historical v1 runtime and provider-fixture
receipts, not public transactions or live custody.

## Required offline procedure

Stop ALL v1/v2 budget workers and supervisors; prevent old binaries restarting.
Protect source, backup directories and the reviewed policy. Inspect the initialized
v1 book, review its counts and logical source digest, then invoke migration with
that digest and a fresh separate backup path. The explicit offline flag is an
operator assertion, not proof of shutdown. An idle existing connection cannot be
detected by this tool. Keep normal host backups and review custody independently.

```bash
node --import ./scripts/register-ts.mjs scripts/migrate-native-gas-budget.mjs \
  inspect /protected/gas.sqlite /protected/reviewed-gas-policy.json

node --import ./scripts/register-ts.mjs scripts/migrate-native-gas-budget.mjs \
  migrate /protected/gas.sqlite /protected/reviewed-gas-policy.json \
  /protected/fresh-original-v1.sqlite <reviewed-source-digest> \
  --offline-workers-stopped
```

Inspect v2 using the normal read-only runtime and compare totals and the retained
v1 backup before manually starting only reviewed v2 code. This is not trading or
unattended-service permission. Policy manifests are bounded to 16 KiB. CLI output is
count/digest/clock/blocked state only; errors use fixed text and nonzero exit.
Outputs contain no transaction evidence, paths or upstream error strings. No RPC,
credential or private key is used.

## Preserved data and failure behavior

`BEGIN IMMEDIATE` locks source writes while the tool checks exact legacy schema,
integrity, policy fingerprint, inode, clock, retention/row bounds and the inspected
source digest. Unsupported versions, unknown tables/indexes/triggers/views,
malformed evidence, changed data, future clock and final-path symlink/hard-link source aliases
are rejected. Inspection is read-only; neither operation initializes missing books.

A separate backup is reserved exclusively without overwrite or following a final-path symlink.
Parent directories are trusted protected-host inputs, not an adversarial-path sandbox.
Original tables and rows are copied, verified against the same logical digest,
committed with synchronous FULL, closed, set to mode0400 and fsynced along with the
parent directory. It preserves original logical state, not identical SQLite pages,
freelists or WAL bytes. File mode0400 is not WORM, encryption or protection against
a privileged host owner. Do not use this backup as a second active budget.

Only then does the source transaction add an empty fenced-hold table and change
version1 to2. Payer/policy, ceilings, states, costs, original charge timestamps,
evidence strings, conflicts, last_clock and blocked flag are unchanged. Migration
does not cancel, free, reverify or rebrand a charge. Pending/quarantined exposure
never expires; normal aging of old charges remains the existing runtime behavior.
Any unexpected preexisting hold table is rejected. No quarantine is cleared.

Old binaries reopening v2 reject it. **An already-open v1 connection can ignore the
new version and holds and corrupt accounting.** The temporary SQLite write lock
cannot solve that: stopping every worker and preventing old restarts are mandatory
trusted-host responsibilities. Never infer quiescence from a flag or migrate online.

Failures before source commit roll it back to v1; a committed or partial backup
may remain. Failure after commit leaves v2. Existing backup paths are rejected on
retry. Preserve all files and investigate; never delete/recreate to gain capacity,
blindly rerun or automatically restore a backup. POSIX protected-filesystem/fsync
and SQLite FULL behavior are assumptions, not power-loss certification or host
rollback protection. There is no automatic rollback or migration at worker startup.

Eight tests cover actual historical v1-produced charges/reservations, quarantine,
overruns/deduplication, same-time v1/v2 totals, malformed schemas/rows, stale review
digest/policy/clock rejection, actual CLI and real subprocess exits immediately
before/after source commit and two concurrent migration processes. These establish process-death transaction recovery,
not live worker fencing, arbitrary disk faults or chain/provider authenticity.

This closes the explicit offline schema-migration gap only. Schema2 crashed-hold
recovery, quarantine removal, inventory/profit settlement, constrained signing,
funding provenance, storage/supervision/alerts and audit/legal/governance/mainnet
gates remain. Root pins and the frozen Standard candidate are unchanged.

Primary references checked October28: SQLite
[transactions](https://www.sqlite.org/lang_transaction.html) and
[synchronous settings](https://www.sqlite.org/pragma.html#pragma_synchronous).
Durability still depends on the stated filesystem/host assumptions and tests;
these references do not certify this application or its deployment.
