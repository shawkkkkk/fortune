# Durable reported strategy-profit accounting

`scripts/reported-strategy-profit-book.mjs` adds an isolated local operator book
that invokes the **unchanged** `allocateRealizedProfit` reducer inside SQLite
transactions. It persists reported costs, losses, cumulative modeled allocations,
cycle IDs and consumed receipt labels across restarts. It is **not authenticated
realized-profit settlement**. No service, signer, wallet action, purchase, burn,
onchain funding, public configuration or adopted buyback percentage is added.

## Explicit access and policy

The library is disabled unless `enabled: true` is supplied. `initialize(path,
policy, {enabled: true, now})` creates a new exclusive mode0600 file; it never
overwrites an existing file. `new ReportedStrategyProfitBook(path, policy,
{enabled: true})` opens an existing book read-only by default. Writing additionally
requires literal `readOnly: false`. A missing/empty/foreign/unprotected file fails;
construction never initializes or repairs it. Initialization failure can leave an
invalid exclusive file for operator investigation, not automatic deletion/retry.

Policy fields are exactly `scopeId`, `accountingAsset` and `buybackBps`:

| Field | Meaning and boundary |
| --- | --- |
| `scopeId` | 1–80 ASCII letters/digits/underscore/hyphen; operator label, not factory/creator authentication or capital ownership |
| `accountingAsset` | Existing reducer's explicit denomination string; a label does not authenticate asset equivalence or conversion |
| `buybackBps` | Explicit integer0–10000, bound to this book; no default or Fortune policy is adopted |

The random public book ID is not a wallet, account or secret. Constructor policy
must match persisted canonical bytes. A different policy requires separate review
and a migration preserving history and deduplication; opening another book is not
that migration. Receipt/cycle uniqueness is scoped to one book, not copied files,
other hosts, other markets or different economic-intent labels.

Paths must be absolute filesystem paths; SQLite URI-like and in-memory paths
reject before file creation/open. A child-process URI-memory regression failed
the unpublished prototype and now enforces this boundary. Files must be regular,
single-link, without group/other mode permissions and at
most16MiB; symlinks and hardlinks reject. Before/after inode/device checks are local
consistency checks, not protection against a privileged host/path swap. Store the
book and its WAL on a protected durable local volume, never ephemeral serverless
storage. SQLite-consistent backup/restore and owner/operator procedures remain
unverified; copying only the main file with an active WAL is not a backup plan.

## Append, retry and inspection

`read()` verifies and returns the bounded complete history, policy, head digest,
reported loss carry, cumulative modeled buyback allocation and retained profit.
Amounts are exact decimal strings. Allocations are cumulative model outputs,
**not available cash, executed spending, successful buybacks or confirmed burns**.

`appendReportedCycle({cycle, expectedHead})` accepts exactly the existing reducer's
cycle fields. API amounts must be bigint uint128; all four explicit gas/bridge/
rebalance/other costs are required in the same denomination. Existing canonical
testnet receipt IDs, strict cycle IDs, `reconciled === true`, zero inventory delta,
loss carry recovery, rounding and cumulative uint128 limits are enforced by the
actual reducer. The report's reconciliation boolean and values remain supplied
assertions. There is no native-cost conversion, event authentication, inventory
proof, fee-origin or legitimate-capital verification here.

A write uses `BEGIN IMMEDIATE`, WAL/FULL and a five-second SQLite busy timeout.
It replays all stored reports through the reducer, checks canonical payloads/hash
links/receipt-index equality and then atomically inserts the cycle plus globally
unique receipt labels **within this file**. State/totals are derived from that
same transactional history, rather than independently updated caches. A stale
expected head, reused receipt, conflicting retry, invalid clock or overflow rolls
back the entire write. There is no partial allocation or automatic replay.

An exact historical retry must present the same cycle payload **and its original
predecessor head**; receipt order is part of that payload. It returns the original
sequence/digest/recorded time, without renewing time or inserting another report,
even when later reports exist. A changed payload or current-head substitution
rejects. Different valid IDs and receipt labels can still duplicate economic intent.

The book retains at most256 cycles, each at most32 receipt labels and8KiB canonical
payload. Reads replay at most256 reports/8192 receipt labels; capacity rejects new
reports without pruning old ones, while exact historical retries remain possible.
There is no reset/edit/delete/prune, rate change, migration or recovery API.

Host time must be safe, nonnegative and nondecreasing during each append and no
earlier than the persisted clock. It is checked before the transaction, after
the write lock/full history scan, and after row/index inserts before persisting
the final observed clock and committing. Rejection rolls back report, receipt
index and metadata together. Host clock/storage are trusted and can change after
the last check; this is not an independent timestamp, general filesystem deadline,
power-loss certification or atomicity with journal/gas-book/queue databases.

## Verification and authority

Outputs always identify `local-unverified-operator-profit-reports`, null current
authorization, and false receipt/inventory/cost/realized-profit/capital/provider/
finality/buyback/execution/full-strategy-readiness flags. Hash links detect local
inconsistency; a privileged host can rewrite, truncate, copy or rehash history.
They do not certify authenticity, completeness, global uniqueness or solvency.

Tests use actual SQLite files/reopen, the unchanged reducer, unsafe final clocks,
policy/history corruption, capacity/overflow and two actual worker processes.
No public chain/provider, independent audit, service, financial settlement or
power-loss evidence follows. No real book/configuration is enabled by this PR.

Still separate: authenticated fill/cost/native-conversion/inventory reconciliation,
fresh canonicality/finality and reorg recovery, authoritative global deduplication,
constrained signer/custody limits, funding and spending reconciliation, protected
operations/backups/alerts, actual testnet routes, economic/legal/governance review
and independent audits. Never spend creator/holder/LP liabilities or launch
reserves as strategy capital. Launch-token fees only burn; holder rewards and
earned platform recirculation remain separate. Full M01/M07/M08 and mainnet
readiness are unfinished; frozen Standard/root pins and release gates are unchanged.
