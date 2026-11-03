# Contributing to Fortune

Start with [AGENTS.md](AGENTS.md). Slop Cash tasks and this guide describe work to
deliver; they do not claim that the complete product is deployed or audited.
The [feature requirements](docs/MEME_OS_PARITY.md) define the full scope and the
[current implementation ledger](docs/TESTNET_IMPLEMENTATION.md) records progress.

## Pick and claim a useful task

Read [AGENT_WORK_QUEUE.md](docs/AGENT_WORK_QUEUE.md), inspect actual current source
and open PRs, and select a small missing integration or reproducible failure.
Do not recreate a component already delivered by another PR. Record the feature
IDs, trigger, expected behavior, files, dependencies, acceptance evidence and
remaining gates in the PR description. Coordinate overlapping work through the
existing issue/PR; preserve work in progress.

A useful contribution produces an actual engine/runtime/API/data/creator flow,
or fixes a demonstrated problem in one. A UI-only contribution should say so and
must not advertise an unavailable engine. Documentation-only tasks are valid
when explicitly requested or needed to explain implemented behavior.

## Set up without changing the baseline

Use Node 22 as pinned by current CI and the checked-in lockfiles. At repo root:

```bash
npm ci
npm run dev
```

Do not use an unpinned install or update dependencies to repair a local setup
failure. If node_modules is shared/hardlinked with another worktree, do not
mutate its files or install into it. Read the current CI workflow for exact
Foundry/library pins; isolated packages have their own lockfiles and commands.
No real credentials are required for fixture tests.

Use an isolated branch/worktree from actual current main. Check existing local
changes first. With a shallow clone, fetch dependency branches explicitly.
GitHub connector users can publish a tree based on the exact base tree and
independently refetch changed UTF-8 blobs; document that method honestly instead
of claiming local git commands or tests that were not run.

## Implement and prove one slice

1. State an observable acceptance case and the failure behavior first.
2. Read the actual called engine, not only its UI or wrapper. Preserve existing
   interfaces and financial/authorization invariants.
3. Add a meaningful regression for a behavioral fix; establish the old-source
   failure when feasible and distinguish fixture/setup errors from a real repro.
4. Exercise the actual changed call path. Use real local SQLite/HTTP/ABI or
   compiled zero-account VM flows when appropriate. A mock of the entire engine
   does not prove that engine works.
5. Preserve durable IDs, original receipt/record times, loss carry, quarantines,
   holds and pending liabilities. After an uncertain commit, inspect existing
   state before explicit retry. Never silently reset or refresh a predecessor.
6. Update the relevant engine docs and implementation ledger with exactly what
   changed, what was tested, limitations and remaining work.

## Validation

Read current [.github/workflows/ci.yml](.github/workflows/ci.yml) and every
workflow triggered by your files. Run relevant focused tests first. Root checks:

```bash
node --import ./scripts/register-ts.mjs --test tests/web/*.test.mjs
npm run build
node scripts/verify-release-runtime.mjs
npm run mainnet:check
npm run mainnet:deps
node scripts/check-release-handoff-fingerprint.mjs
npm run mainnet:fingerprint
git diff --check
```

Finish npm ci before building; run runtime checks only after a successful build.
Runtime probes require available public read services and are separate from
offline tests. Report an unavailable environment/provider as NOT RUN or BLOCKED,
not PASS. Do not suppress warnings globally or alter CI to disguise local issues.

For Standard contract validation, follow CI's pinned Foundry v1.8.3 and exact
library commits, then run forge test with 1,000 fuzz runs. Other contract packages
must use their own reviewed workflow/toolchain. Run applicable desktop/mobile
creator, launch-catalog and Studio checks using CI's isolated browser runner.
Do not install browser tooling into the frozen root dependency tree.

Keep normal CI commands/limits unchanged. A controlled local repeat can help
investigate a failure; it does not classify an old failure or authorize unlimited
remote reruns. Distinguish final-head checks from preliminary-source checks.

For testnet/mainnet qualification, use
[AGENT_RELEASE_CHECKLIST.md](docs/AGENT_RELEASE_CHECKLIST.md). A green schema check,
alpha health endpoint or general Foundry suite is not a live-mainnet result.

## Review, merge and handoff

Use the [PR template](.github/pull_request_template.md). Link exact commits,
workflow runs/jobs and retained artifact metadata. Say whether archives were
actually inspected; artifact metadata alone is not archive inspection.
Clearly separate local, PR and separate post-merge evidence.

Before an authorized merge: verify all final-head checks and latest statuses,
scope, base, real dependency integration, preview and review state. If base or
source changes, reassess integration and obtain checks for the resulting head.
Do not merge a stacked child until dependencies are actually present on main.
Do not infer delivery from a closed PR alone.

After merge, independently compare actual main files/tree and real parents,
then check separate main CI and exact-source deployment health. Report any
changed failure; do not transfer old audit/deployment approval to new source.
Report completed behavior and precise remaining owner actions. The full goal
stays unfinished until its own evidence supports completion.

## Security reports

Follow [SECURITY.md](SECURITY.md). Use private vulnerability reporting where
available; do not publish exploitable details or credentials in public issues.
No contribution agent is authorized to sign, provision secrets, fund workflows,
deploy/activate mainnet, fabricate external review or grant legal approval.
