# Receipt revalidation worker

This change is stacked on PR #73's read-only journal inspection. It does not
change the observation queue or mark any launch engine ready. Source on main
already verifies and persists fills, but completed observation jobs do not
periodically recheck those receipts.

## Executable boundary

`revalidateFillBatch` selects at most ten observed fills older than five minutes,
oldest first, and runs the existing two-client `journal.refresh` verifier on each.
The library permits reviewed bounds of 1–100 rows and 1 second–24 hours; the CLI
uses the fixed defaults. Selection includes the exact age boundary. Successful
rechecks persist a new observation time. Restarted invocations select the oldest
remaining evidence without an in-memory cursor. A batch never claims queue jobs.

Provider unavailability, insufficient depth, invalid receipts, changed block or
economic evidence and changed swap log identities quarantine the transaction.
Previously, a different swap log index could create a different receipt ID and
leave the old row observed. The journal now checks transaction identity inside
its write transaction, stores the conflicting evidence against the original row
and refuses a trusted replacement. Quarantine remains persistent; success later
does not restore trust. Existing direct-router and vault policy hashes do not
change. No schema migration or evidence deletion is performed.

The JSON report contains bounded counts only, including remaining due evidence
(capped at 100, with a cap flag), quarantine count and explicit false readiness,
execution and profit flags. A failed check, remaining due work or any quarantined
row makes the report unhealthy and the CLI exit nonzero. Invalid/backwards host
time fails closed; a host-clock correction needs operator investigation.

```bash
FORTUNE_ARBITRAGE_READ_RPC_URL=https://<reviewed-provider-one> \
FORTUNE_ARBITRAGE_SECONDARY_RPC_URL=https://<reviewed-provider-two> \
node --import ./scripts/register-ts.mjs scripts/run-fill-revalidation.mjs \
  /protected/reviewed-market.json /durable/fills.sqlite
```

The manifest must match the initialized journal, is bounded to 16 KiB, and the
journal must already exist. Read-only inspection validates its schema before
opening a writable connection. Both RPC origins must be distinct HTTPS origins;
credentials belong in protected configuration. Each RPC request has an eight
second timeout and no automatic retries. The fixed ten-row CLI batch is finite,
but several requests are needed per row; supervise its total runtime externally.
No provider error text, credentials, filesystem paths or receipt hashes appear
in the CLI report or error message. Use a single durable host, not ephemeral
Vercel storage. Protect the SQLite files, permissions, backups and clock.

## Limits and deployment evidence

This is an executable bounded invocation, not a provisioned daemon, schedule,
supervisor or delivered alert. There are no new RPC credentials or public routes.
Multiple invocations can duplicate read work, but cannot clear quarantine; use a
single supervisor to bound provider load. Queue health from #73 remains scoped
to local scheduling files and does not assert receipt freshness.

Selection, network reads and final status are separate snapshots. Concurrent
writers, a later reorg, host tampering or provider collusion can invalidate a
point-in-time result. An empty or healthy batch never authorizes spending or
settles profit. Downstream settlement must independently revalidate complete
cycle, inventory and cost evidence immediately before use. Native gas conversion,
bridge costs, global limits and realized-profit allocation remain unimplemented.

Regression tests use real SQLite files, the actual CLI and two receipt-client
fixtures. They test changed swap identity, persistent quarantine, unavailable or
changed evidence, restart freshness, oldest-first draining beyond ten rows,
exact cutoffs, bounds, missing/empty files and clock problems. Synthetic extra
rows in the pagination test are deliberately rejected by the real verifier;
they are not authenticated fills or public-provider evidence.
