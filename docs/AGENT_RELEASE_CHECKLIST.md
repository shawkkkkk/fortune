# Agent testnet and mainnet qualification checklist

Use this with [MAINNET_READINESS.md](MAINNET_READINESS.md),
[RELEASE_HANDOFF.md](RELEASE_HANDOFF.md), [AUDIT_SCOPE.md](AUDIT_SCOPE.md),
[MAINNET_AUDIT_REQUEST.md](MAINNET_AUDIT_REQUEST.md), and the root release/dependency
manifests. This checklist grants no standing deployment, signing, funding or
activation authority and does not alter any gate. A current explicit owner
instruction can authorize only the exact capped test or canary it names, subject
to every chain/asset/custody/recipient/provider/receipt/recovery gate below.

The question is not only "does testnet work?" Each exact engine/release needs
separate functional, security, operational and authorization evidence.
Independent audit is required where specified, but audit alone is not activation
approval. The full MEME OS target cannot inherit frozen Standard's qualification.

## Record the candidate before testing

Record source commit/tree, measured fingerprint, lock/toolchain/dependency pins,
engine, chain, deployed addresses/runtime hashes (when independently verified),
test commands, run/job IDs and observation times. State whether artifacts were
downloaded or only metadata/logs inspected. Do not include credentials.

Current status comes from fresh source/manifests and live evidence, not a
hardcoded PASS in this guide. The repository's Standard mainnet manifest is
blocked; a syntactically valid manifest may still intentionally block deployment.
Historical audit packets, fork runs and reviewedCommit fields are not acceptance
of a changed candidate or the current root dependency baseline.

## Separate qualification stages

| Stage | Required evidence | What a pass does not establish |
| --- | --- | --- |
| Offline/source checks | Exact-source regressions, fuzz/invariants, dependencies, sizes, policy and fingerprint checks | Live providers, deployment, funds, audit or legal approval |
| Actual local runtime | Real HTTP/ABI/SQLite or compiled zero-account VMs; receipt/accounting, restart/replay/rollback and failure tests | Independent providers, public custody, legitimate capital or power-loss certification |
| Public testnet | Verified target chain/code/config plus actual authorized lifecycle receipts, API/UI state, refunds/recovery and operations | Equivalent chain-56 behavior, an independent audit or mainnet activation |
| Mainnet-state fork | Explicit chain-56 RPC-backed local fork with actual pinned WBNB/oracle/Pancake dependencies and positive/negative lifecycle assertions | Public mainnet deployment, independent providers, live canary, governance consent or audit approval |
| Paused production | Separately authorized deployed code/config, governance acceptance, oracle/assets, independent RPCs, indexer/alerts and recovery drills | Permission to unpause or enable a different engine |
| Activation/canary | All required release gates, independent review, legal/asset/governance/operations evidence and explicit owner/operator authorization | Approval for expanded assets, new bytecode, v2, omnichain or another release scope |

The existing Standard fork test in contracts/test/MainnetFork.t.sol returns
without running its lifecycle when BSC_MAINNET_FORK_RPC_URL is absent. A green
general Foundry suite is therefore not fork evidence. Confirm the dedicated
mainnet-fork workflow actually configured a chain-56 fork and completed the
named lifecycle/assertions. A failed RPC/setup or early return is not a pass for
the intended rehearsal. Do not change frozen source/tests or weaken guards to
force a result.

## Agent-safe validation

After pinned setup, run the relevant source/CI checks in CONTRIBUTING.md. Also
inspect the existing workflows before any manual dispatch; a workflow called
testnet or audit may still broadcast or consume credentials. Do not dispatch a
funded, signer, deploy or activate workflow without a current explicit owner
instruction for that exact workflow and scope. Record the cap and gates before
dispatch, inspect persisted state before any retry, and never expand a canary
authorization into general activation.

```bash
npm run mainnet:check
npm run mainnet:deps
npm run mainnet:deps:require
node scripts/check-release-handoff-fingerprint.mjs
npm run mainnet:fingerprint
```

The first command checks schema, not readiness. Dependency/address validation is
not issuer/oracle/custody/legal approval. Check compiled size headroom and the
reviewed fuzz/invariant suite using the exact workflow pins.

The existing read-only mainnet-readiness and local mainnet-fork workflows are
entrypoints for qualification after reviewing their actual steps, authorization
and environment. A fork uses local VM impersonation with zero generated accounts;
no signing, keys or public transactions. Record provider availability/limits;
never bypass denied access or call two clients of one fixture independent.

The following commands are validation-only and are expected to fail while their
gates are incomplete. Record the blocked result and reasons; do not flip flags,
invent evidence or change reviewedCommit merely to make them pass.

```bash
npm run mainnet:require-deploy
npm run mainnet:require-activate
```

## Functional and adversarial coverage

Cover the actual supported launch, quote, approval, buy/sell, first-buy/refund,
graduation, locked LP and rescue paths, including wrong-chain/runtime/asset,
oracle staleness, slippage, failed graduation and retry. Exercise wallet review
and API/UI accounting against the actual receipts, not just rendered success.

For each new engine add its own authority, liability/capital separation, exact
asset units, constrained execution, deduplication, uncertain-transaction,
partial failure, restart/reorg and recovery cases. Test paused/disabled gates.
Custody, provider independence, backups, alert delivery and legal/identity claims
need their own evidence; fixtures cannot certify them.

## Release report template

For every stage use PASS, FAIL, BLOCKED or NOT RUN, with a reason and exact-source
evidence. Preserve old failures/skips/unclassified runs; new passes do not
retroactively diagnose or approve them.

```text
Candidate commit/tree/fingerprint:
Engine and chain scope:
Commands, workflow run/job and attempt:
Offline/source:
Local runtime:
Public testnet:
Mainnet-state fork:
Paused production and governance:
Audit/economic/MEV/oracle/asset/legal review:
RPC/indexer/alerts/incident/recovery/privacy:
Deployment/activation gates:
Failures, skips, assumptions and unclassified outcomes:
Precise owner/operator actions still required:
```

Read mainnet-release.json and the engine-specific release requirements; enumerate
every missing gate, not only audit. Credentials/funding, independent auditors,
legal reviewers and governance signatures remain separate owner/operator work
unless the owner expressly authorizes one exact bounded operation under the
rules above. Do not generate signatures, grant permissions or enable mainnet
merely to complete a contribution. Update the implementation ledger and review
packet honestly.
