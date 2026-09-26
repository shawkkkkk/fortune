# Fortune release handoff — 2026-09-26

## Public state and identity

- Public BSC Testnet alpha: https://fortune-rho-snowy.vercel.app
- Official X: https://x.com/fortunepad (`@fortunepad`, confirmed by the project owner).
- Intended domain: `fortunepad.fun`. A fresh public check at 22:08–22:11 UTC on September 25 returned HTTPS 200 from Vercel for the apex and HTTPS 308 from www to the apex, replacing the earlier Squarespace observation. Authenticated project inspection still returns 403, so project attachment/ownership and full DNS verification are not yet confirmed. Keep domain cutover PR #12 draft pending those checks.
- Claude's frontend redesign PR #14 and canonical metadata correction PR #13 are merged.
- Release preparation PR #15 is merged at `a7c3e2344af3389769f4b0a5fcf12659f2cefcec`. GitHub Actions run `36182869836` passed; Vercel production deployment `dpl_ApGRY9nLpHjuVK3UW6n47wyNn3AX` reached READY. Browser checks confirmed `@fortunepad` in the footer and social metadata.
- Creator-flow PR #22, market/pair-universe PR #20 and pair-market-data recovery PR #23 are merged. File uploads remain disabled until their server-only provider credentials and drills are complete, and registry policy still decides which displayed assets are launchable.
- Frontend/data PR #26 and its production security follow-up PR #27 are merged. Main `ce6f65f49cce0489bab4ba5565aaa8f320ecb5fa` has READY Vercel production deployment `dpl_3pm7m6yfTd51RyhAHyPDMEXreuhn`. The release now includes share cards, supply breakdowns, local watchlists, wallet portfolios, creator histories and verified pair-asset pages. Server-rendered share cards fetch creator artwork only from validated IPFS URIs through Fortune's fixed gateway; arbitrary external HTTPS artwork falls back to the token monogram.
- Mainnet contract deployment and activation remain blocked. There is no published official mainnet token CA in this release.

## Release scope

The frozen Standard candidate supports WBNB-only, single-pair launches on chain 56, a $10,000 graduation ceiling, 0.5% creator plus 0.5% protocol fees, Pancake V3 graduation and permanently locked LP positions. The opening shield applies to the optional creator purchase too.

Burn + Rewards v2 is isolated research. Its direct pair-asset accounting prototype is not a deployed Infinity hook. It must not be advertised as live or activated with real funds. Broader assets, tokenized securities, multi-pair launches and legacy tax-token mechanics are outside this first mainnet release.

The Brew/LESGO comparison is recorded in `BREW_REVIEW.md`. The owner's GO revenue reference is captured separately in `PLATFORM_REVENUE.md`: platform buybacks must not consume holder rewards or liquidity. It is a proposed architecture with no deployed Fortune token, configured percentage or release approval.

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

Creator-flow follow-up ([merged PR #22](https://github.com/shawkkkkk/fortune/pull/22),
not a mainnet capability claim): see `CREATOR_FLOW.md`. It adds visible project fields, local drafts, bounded JSON
import, credential-gated IPFS uploads, metadata provenance and registry-backed
address inspection. Storage/pinning credentials and real-provider upload checks
remain owner/operator prerequisites. Multi-pool, Dev Launch and unrestricted
pairing are not activated. Existing Standard/mainnet evidence is unchanged.

The RPC catalog is an interim read path with an explicit 10,000-entry maximum across configured factories. It fails rather than truncates beyond that bound. It is not a durable event indexer or a high-volume production SLA. Name/ticker search still covers recent entries; exact token addresses and creator pages use the complete bounded catalog.

Volume, revenue, burns and rewards remain unavailable until their full onchain event ledgers are implemented and reconciled. No approximate or fabricated totals are published. Snapshot block hashes must be checked for reorgs; these are recent-state observations, not finality claims.

Reproduce a catalog snapshot without changing chain state:

```bash
node --import ./scripts/register-ts.mjs scripts/export-onchain-catalog.mjs
FORTUNE_CATALOG_BLOCK=<reported-block> node --import ./scripts/register-ts.mjs scripts/export-onchain-catalog.mjs
```

The output includes the chain, block/hash, every included factory record and a SHA-256 digest. Mainnet read-only exports require correct public factory/registry addresses and configured RPC access; they do not require enabling the mainnet UI.

## Observed verification

- [Pair-market-data PR #23 CI run 36204534985](https://github.com/shawkkkkk/fortune/actions/runs/36204534985) passed its web build/runtime/browser checks and contract suite with 1,000 fuzz runs. PR #23 is now merged into main `dec346088c573ae88fc9db705804338f77738f99`; Vercel production deployment `dpl_Dw77tGFrkdLixdAPp3LVeZtMyonN` reached READY.
- [Frontend/data PR #26 CI run 36223903240](https://github.com/shawkkkkk/fortune/actions/runs/36223903240) passed its production build, runtime/browser checks and contract suite with 1,000 fuzz runs. PR #26 merged as main `0254b457f5bd78617bc46f0454deb4bcbc71fc69`; its production deployment reached READY.
- [Share-card security PR #27 CI run 36245450216](https://github.com/shawkkkkk/fortune/actions/runs/36245450216) passed the production build, runtime smoke gate, desktop/mobile browser checks and contract suite with 1,000 fuzz runs. PR #27 then merged as main `ce6f65f49cce0489bab4ba5565aaa8f320ecb5fa`; Vercel production deployment `dpl_3pm7m6yfTd51RyhAHyPDMEXreuhn` reached READY.
- [Ten-launch graduation-wave run 36204084110](https://github.com/shawkkkkk/fortune/actions/runs/36204084110) failed closed during its chain/balance preflight on September 26. The configured testnet deployer had `0.0110827725 tBNB`, below the workflow's conservative `0.25 tBNB` safety budget. No setup, launch, graduation or load-test step ran and no evidence artifact was produced; this run does not satisfy a rehearsal gate.
- Creator-flow PR #22: [CI run 36195640178](https://github.com/shawkkkkk/fortune/actions/runs/36195640178) passed on September 25: 22 web tests, production build/runtime smoke and 53 contract tests with 1,000 fuzz runs. The normal contract suite does not independently establish a live fork pass. Follow-up [web job 108273239958](https://github.com/shawkkkkk/fortune/actions/runs/36196438248/job/108273239958) also passed desktop/mobile browser checks at 22:24 UTC, with four screenshots retained in the `creator-flow-browser` artifact. Those UI checks use localhost fixtures, not production chain or provider evidence.
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
2. Verify the existing apex/www attachment in that project's Domains settings and compare Squarespace DNS with the exact A/CNAME and any ownership TXT values Vercel requires. Public HTTPS and the www-to-apex redirect now pass; do not replace working records unnecessarily. Preserve unrelated DNS/email records. Keep PR #12 draft until authenticated attachment/ownership and DNS checks also pass.
3. Provide the completed external reviews, public Safe address and signer availability. Configure dedicated RPC/deployer secrets through the protected services, not chat. Funding and governance signatures require the actual wallet owners.
4. Provision durable indexer storage/worker and image hosting credentials if those product paths are to be included. Image URLs/IPFS URIs work today; upload hosting is not configured.
5. Fund the public BSC-testnet rehearsal deployer with enough faucet tBNB to meet the `0.25 tBNB` ten-launch safety budget, then rerun failed job `36204084110`. Its last observed balance was `0.0110827725 tBNB`; do not substitute mainnet BNB or a mainnet key.

Hourly cloud continuation checks are configured to inspect GitHub, finish safe work when accessible, and surface changed blockers. They do not guarantee continuous execution or automatically authorize mainnet activation. Avoid concurrent edits to another active release-preparation branch.
