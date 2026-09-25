# Fortune release handoff — 2026-09-25

## Public state and identity

- Public BSC Testnet alpha: https://fortune-rho-snowy.vercel.app
- Official X: https://x.com/fortunepad (`@fortunepad`, confirmed by the project owner).
- Intended domain: `fortunepad.fun`. Apex and www still served Squarespace when checked on September 25. Domain attachment, DNS and HTTPS must be verified before merging the domain cutover PR #12.
- Claude's frontend redesign PR #14 and canonical metadata correction PR #13 are merged.
- Release preparation PR #15 is merged at `a7c3e2344af3389769f4b0a5fcf12659f2cefcec`. GitHub Actions run `36182869836` passed; Vercel production deployment `dpl_ApGRY9nLpHjuVK3UW6n47wyNn3AX` reached READY. Browser checks confirmed `@fortunepad` in the footer and social metadata.
- Mainnet contract deployment and activation remain blocked. There is no published official mainnet token CA in this release.

## Release scope

The frozen Standard candidate supports WBNB-only, single-pair launches on chain 56, a $10,000 graduation ceiling, 0.5% creator plus 0.5% protocol fees, Pancake V3 graduation and permanently locked LP positions. The opening shield applies to the optional creator purchase too.

Burn + Rewards v2 is isolated research. Its direct pair-asset accounting prototype is not a deployed Infinity hook. It must not be advertised as live or activated with real funds. Broader assets, tokenized securities, multi-pair launches and legacy tax-token mechanics are outside this first mainnet release.

## Engineering changes in this preparation

- Preserve the redesigned frontend and official mascot; add the official X link and social metadata.
- Recheck wallet account/network and release readiness before each launch signature. Reject invalid precision and uint256 overflow. Simulate launches, check approval receipt status, retain submitted hashes, recover confirmed launches from trusted factory events, and prevent resubmission while an outcome is unresolved. Disable form editing during signing and pending confirmation.
- Read the full bounded factory catalog instead of just the newest 25 entries. Resolve older token addresses, paginate Explore and creator profiles, pin pagination to a block, and expose block number/hash with public data.
- Incrementally refresh verified immutable factory entries, coalesce concurrent requests, reject partial reads and wrong-chain responses, and invalidate cached history after a detected reorg.
- Permit read-only inspection of a configured paused mainnet deployment without enabling transaction signing. This allows pre-activation data verification.
- Make `/api/ready` require full release readiness on chain 56 instead of reporting ready from factory bytecode alone.
- Stop exposing raw upstream RPC error strings through public data APIs.
- Add transaction/catalog regression tests to CI and a scheduled public-site monitor. GitHub scheduling is best-effort; a configured workflow is not evidence of delivered production incident alerts.

## Data boundary

The RPC catalog is an interim read path with an explicit 10,000-entry maximum across configured factories. It fails rather than truncates beyond that bound. It is not a durable event indexer or a high-volume production SLA. Name/ticker search still covers recent entries; exact token addresses and creator pages use the complete bounded catalog.

Volume, revenue, burns and rewards remain unavailable until their full onchain event ledgers are implemented and reconciled. No approximate or fabricated totals are published. Snapshot block hashes must be checked for reorgs; these are recent-state observations, not finality claims.

Reproduce a catalog snapshot without changing chain state:

```bash
node --import ./scripts/register-ts.mjs scripts/export-onchain-catalog.mjs
FORTUNE_CATALOG_BLOCK=<reported-block> node --import ./scripts/register-ts.mjs scripts/export-onchain-catalog.mjs
```

The output includes the chain, block/hash, every included factory record and a SHA-256 digest. Mainnet read-only exports require correct public factory/registry addresses and configured RPC access; they do not require enabling the mainnet UI.

## Observed verification

- Production Next.js build passed. Ten new web regression tests passed.
- Foundry v1.8.3: 53 tests passed at 1,000 fuzz runs. The separately executed live BSC-mainnet fork lifecycle passed. Isolated rewards v2: four tests passed at 1,000 fuzz runs.
- Production-runtime checks passed, including all seven testnet launches paginated at one fixed block, oldest-token API/page lookup, malformed-input rejection, release status and metadata. See `release-evidence/2026-09-25/runtime.json`.
- All 12 smoke checks also passed against the public production URL after PR #15 deployed, including live readiness, stats, launches and launchable assets. See `release-evidence/2026-09-25/public-site-smoke.txt`. This is a point-in-time observation, not an uptime guarantee.
- Testnet readiness passed with one of two providers responding (degraded redundancy). Slow public testnet responses exceeded the earlier two-second probe budget; only the testnet liveness budgets were increased. Mainnet budgets and gates are unchanged. See `release-evidence/2026-09-25/testnet-readiness.json`.
- npm audit returned zero reported vulnerabilities. This is dependency evidence, not a smart-contract audit.

## Verification commands

```bash
node --import ./scripts/register-ts.mjs --test tests/web/*.test.mjs
npm run build
node scripts/verify-release-runtime.mjs
npm run mainnet:fingerprint
npm run mainnet:check
npm run mainnet:deps:require
npm run mainnet:require-deploy
npm run mainnet:require-activate
```

The final two commands must currently fail: missing evidence is not a passing release. Foundry verification uses the pinned v1.8.3 toolchain, `forge test --fuzz-runs 1000`, and the dedicated `FortuneMainnetForkTest` with a real `BSC_MAINNET_FORK_RPC_URL`. The normal suite returns early from the fork test without that variable, so its success alone is not fork evidence.

The 63-file frozen candidate fingerprint remains:

`d70ed0820e5cc9d86919dcfd15618ad021d777a86397ce5ebcb4450fc5677129`

## Manual dependencies before deploying any mainnet contracts

| Gate | Required action / evidence |
| --- | --- |
| Independent smart-contract audit | Commission or provide the final independent report for the frozen candidate, including remediation verification. Use `docs/MAINNET_AUDIT_REQUEST.md` as the scope packet. |
| MEV / cross-reserve review | Obtain an independent assessment covering curve economics, ordering attacks and the assumptions of the single-WBNB release. |
| Oracle / asset-policy review | Independently verify WBNB, the pinned Chainlink feed, freshness limits and permitted token behavior. |
| Graduation adapter audit | Include Pancake V3 pricing, existing-pool handling, slippage/dust, atomicity and permanent LP custody in the final audit. |
| Automation vault audit | Include disabled-for-v1 automation boundaries and vault purpose isolation in independent review. |
| Governance multisig | Establish a BSC Safe-compatible contract with threshold at least two, independent signers and a demonstrated harmless transaction. Provide only its public address/evidence. |
| Deployment key controls | Configure a protected GitHub `mainnet` environment with required reviewers, a dedicated deployer secret and an agreed funding/retirement procedure. Never put keys in chat, source or public variables. |
| Legal/compliance review | Obtain applicable legal approval for operating and releasing this product. Technical tests cannot provide it. |

The economic simulation gate already contains evidence; this work does not change its status or substitute it for external review.

## Dependencies before activation and public real-value trading

- Two genuinely independent production RPC providers, with credentials in protected server/CI secrets, matching chain and block-height checks, and a successful failover drill.
- Durable event indexing, reconciliation and restart/reorg tests from the actual production deployment block. The bounded catalog alone does not satisfy `reproducibleIndexerAnalytics`.
- Production alerts delivered to the actual responders, plus an incident drill. The new public-site workflow and existing disabled mainnet monitor do not satisfy these gates without configuration and delivery evidence.
- A reproducible, independently verified deployment that is still paused; ownership acceptance by the Safe for factory, asset registry, automation registry and oracle; removal of deployer privileges.
- A production canary and recovery drill with retained evidence.
- Completion of every activation-manifest gate, explicit final operator approval, and Safe signatures for the verified activation calldata. Do not replace this ceremony with a deployer-key unpause.

## Account / domain tasks for the owner

1. Reauthorize the Vercel connection for team `hoque-industries` and project `fortune` (`prj_QwYhAacsiUZe6B6uuWL79mYu0gZG`). Deployment listing works, but project access and authenticated preview access returned scope-related 403 responses.
2. Add apex and www in that project's Domains settings. Copy the exact A/CNAME and any ownership TXT values Vercel shows into Squarespace. Preserve unrelated DNS/email records. Configure www to redirect to apex and wait for valid HTTPS before merging PR #12.
3. Provide the completed external reviews, public Safe address and signer availability. Configure dedicated RPC/deployer secrets through the protected services, not chat. Funding and governance signatures require the actual wallet owners.
4. Provision durable indexer storage/worker and image hosting credentials if those product paths are to be included. Image URLs/IPFS URIs work today; upload hosting is not configured.

Hourly cloud continuation checks are configured to inspect GitHub, finish safe work when accessible, and surface changed blockers. They do not guarantee continuous execution or automatically authorize mainnet activation. Avoid concurrent edits to another active release-preparation branch.
