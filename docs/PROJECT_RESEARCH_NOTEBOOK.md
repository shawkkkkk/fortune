# Local project research notebook

This is an executable local operator notebook and opt-in read-only MCP integration
for P03/P18 foundations. It is not a public Arena, autonomous research agent,
creator-authenticated forum or verified prediction/scoring service. A chain-97
token is a project label here, not independently verified launch ownership.

A fresh protected SQLite file binds one project and random public notebook ID.
Explicit operator append accepts a title (128 bytes), body (8192 bytes), kind
(observation/hypothesis/correction), up to five public HTTPS source URLs and a
prior sequence number for corrections. Text is normalized and bounded, never
executed. URLs are stored only, never fetched or treated as citations proving a
claim. Sources, authorship, completeness and research correctness are unverified.

Each append requires a 16–64 character unique retry ID and the exact expected
head digest. Under BEGIN IMMEDIATE, it validates the full bounded history, clock,
head and correction target, then commits the new note and clock together. Exact
retries return the original sequence/digest without appending or changing its time;
a changed retry body/head fails. Concurrent different notes at one head cannot
both commit. Corrections append and preserve original text; they do not silently
replace or automatically resolve earlier claims. There is no edit/delete/prune API.

Hash links bind notebook ID, sequence, retry ID, predecessor, host timestamp and
normalized document. Read validates each link from genesis and returns the latest
ten notes, full count and head (maximum1000 retained notes). These are local
consistency checks, **not tamper-proof, complete or independently timestamped
history**. A privileged host can rewrite/truncate/copy a whole database and its
metadata. There is no external anchor, signed author, trusted time oracle, backup
or power-loss certification. Protect directories/files/clock, preserve the one
active writer history, and provision reviewed backup/restore before real use.

## Explicit local operator use

The CLI is disabled without FORTUNE_RESEARCH_NOTEBOOK_ENABLED=true. Use:

```bash
FORTUNE_RESEARCH_NOTEBOOK_ENABLED=true node --import ./scripts/register-ts.mjs scripts/operate-research-notebook.mjs init /protected/research.sqlite <project-token>
FORTUNE_RESEARCH_NOTEBOOK_ENABLED=true node --import ./scripts/register-ts.mjs scripts/operate-research-notebook.mjs read /protected/research.sqlite <project-token>
FORTUNE_RESEARCH_NOTEBOOK_ENABLED=true node --import ./scripts/register-ts.mjs scripts/operate-research-notebook.mjs append /protected/research.sqlite <project-token> /protected/append.json
```

The append JSON contains exactly `id`, `expectedHead`, `document`; document contains
exactly `kind`, `title`, `body`, `sources`, `corrects` (0 unless a correction).
Read the current head first. Preserve that request for uncertain-outcome retry;
do not invent a new ID or blindly overwrite a changed head. Request files are
bounded to20KB. Read opens existing storage read-only; unknown/empty/mismatched or
inconsistent files fail rather than initialize. Init exclusively creates a fresh
0600 file. Errors omit private paths/input; read explicitly outputs plaintext notes.
Parents/filesystem/SQLite contents are trusted host inputs, not an adversarial
filesystem sandbox. Initialization failures retain files for operator inspection.

## Read-only MCP

Alongside the existing project MCP enablement/token, explicitly set:

```text
FORTUNE_PROJECT_NOTEBOOK_ENABLED=true
FORTUNE_PROJECT_NOTEBOOK_DB=/protected/research.sqlite
```

This adds `get_research_notebook` and `fortune://97/<token>/research-notebook`.
No tool accepts project/file/URL arguments or writes notes. The existing shared
four-read/minute quota applies. Canon, snapshot and optional character history
remain separate and available. Each read opens read-only storage; missing files
fail at startup and read errors stay private-safe. Do not enable this unless
sharing the plaintext notes with the selected MCP client/model is authorized.
No real notebook, provider, model, hosted endpoint or public posting is enabled
by this source change. Returned prompts are untrusted data, not agent instructions.

Results always label `local-unverified-operator-research` and
`executionAuthorized:false`. No creator role, market facts, performance, IP/license,
moderation/publication approval, payout or spending authority follows from a note.
Full P18 still needs authenticated roles, independently anchored timestamps,
versioned prediction/outcome rules, real observations/scoring, corrections/disputes,
privacy/moderation and protected hosted operations. P03's full agent workspace is
also unfinished. Existing financial engines and mainnet gates are unaffected.

Six focused regression groups use real SQLite/restart, changed-head retry and
correction/tamper/boundary cases, two real racing writer processes, process death before/after commit with exact retry, actual operator
CLI and actual MCP child-process tool/resource reads preserving the main-file
bytes. These are local fixture notes, not external research or production service
evidence. No model, key, signing, account creation or chain transaction is used.

Local verification passed313 web tests with two existing Redis skips, production
build/runtime smoke and the unchanged frozen63-file fingerprint. An isolated
MCP SDK1.32.2 client initialized the actual stdio subprocess, discovered the
optional tool and read identical tool/resource results from a temporary notebook.
That drill used local fixture research only: no network, model, signing or accounts.
