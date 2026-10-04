# Fortune release handoff — 2026-10-04

## Public state and identity

- Public BSC Testnet alpha: https://fortunepad.fun
- Official X: https://x.com/fortunepad (`@fortunepad`, confirmed by the project owner).
- Custom domain: `fortunepad.fun`. Authenticated Vercel inspection on October 4 confirmed the apex and `www` are attached to project `prj_QwYhAacsiUZe6B6uuWL79mYu0gZG` with `verified: true`; `www` is a 308 redirect to the apex, HTTPS loads publicly, and production `NEXT_PUBLIC_SITE_URL` is the apex URL. Domain cutover PR #12 is merged as main `6cbdf3124deb1f5014611cce07a5776b2caf71dc`; Vercel production deployment `dpl_GeJmXwfF4h6AwdDEAViXRnc3Psi9` reached READY. The homepage canonical, Open Graph image, `/launch`, `/status`, and official `@fortunepad` link were rechecked on the custom origin.
- Claude's frontend redesign PR #14 and canonical metadata correction PR #13 are merged.
- Release preparation PR #15 is merged at `a7c3e2344af3389769f4b0a5fcf12659f2cefcec`. GitHub Actions run `36182869836` passed; Vercel production deployment `dpl_ApGRY9nLpHjuVK3UW6n47wyNn3AX` reached READY. Browser checks confirmed `@fortunepad` in the footer and social metadata.
- Creator-flow PR #22, market/pair-universe PR #20 and pair-market-data recovery PR #23 are merged. File uploads remain disabled until their server-only provider credentials and drills are complete, and registry policy still decides which displayed assets are launchable.
- Frontend/data PR #26 and its production security follow-up PR #27 are merged. Main `ce6f65f49cce0489bab4ba5565aaa8f320ecb5fa` has READY Vercel production deployment `dpl_3pm7m6yfTd51RyhAHyPDMEXreuhn`. The release now includes share cards, supply breakdowns, local watchlists, wallet portfolios, creator histories and verified pair-asset pages. Server-rendered share cards fetch creator artwork only from validated IPFS URIs through Fortune's fixed gateway; arbitrary external HTTPS artwork falls back to the token monogram.
- Custom-pairs PR #28 is merged at `df907757b7155ee55f2e5f928a7d746461788268`; Vercel production deployment `dpl_8duqQg7V4nhRobGBFKU5ghGuPvcr` reached READY. The public site now includes the read-only pair-token inspector and an isolated custom-pair beta surface. Launches remain disabled until a BSC Testnet factory is explicitly configured, and code hard-disables this engine on every chain except 97. Review follow-ups #29–#31 removed false audit claims, made unavailable transfer simulations block launches and narrowed the chain allowlist to exactly BSC Testnet.
- Social-fee routing PR #33 and security follow-up PR #34 are merged. Current main `bf429b1988906983a96a251357f6710a2070bb32` has a successful [Vercel deployment](https://vercel.com/hoque-industries/fortune/Cyrh7vV1wn8Ppkbx8guXkMVE7osB). The custom-pairs beta can describe immutable creator-fee splits across wallet and supported social recipients, but the contracts remain unaudited, BSC-Testnet-only and unconfigured in the public release. PR #34 made ownership verification reject redirects and unsuccessful responses and enforce byte limits while streaming. This work does not add social routing to the frozen Standard candidate.
- Penny-stock discovery and counterfeit stock-token checks PR #36 and normalization follow-up PR #37 are merged. Current main `8702dcb41c6945a9e69d21ae02dee5258699ce02` has a successful [Vercel deployment](https://vercel.com/hoque-industries/fortune/HguGD6WEzznZr46S67gwWuV5ArmT). The pair picker can show verified BSC tokenized-company assets trading below $5, but they remain discovery-only and outside v1 launch eligibility. The custom-pair inspector blocks unverified tokens that impersonate tracked stock tokens, including punctuation, zero-width and full-width variants. This is a compatibility guard, not legal approval or a guarantee that an issuer token is safe.
- Stock-identity correction PR #39 and Anchored catalog PR #40 are merged. Current main `2eb5e653f139908168f6e930e903554137a291d5` has a successful [Vercel production deployment](https://vercel.com/hoque-industries/fortune/4N9PDq8oq5GCJSZTn2BEqi2tWY9r). The reviewed snapshot now contains 780 BNB Chain assets: 704 stocks and ETFs, 11 RWAs, 1 pre-IPO token and 64 crypto assets. PR #39 stopped case-insensitive ticker collisions from blocking unrelated crypto tokens and separates unverified stock-token claims from confirmed imitations. PR #40 added Anchored aStocks and checks every xStocks entry against the issuer's deployment list. Both remain discovery and compatibility work: tokenized securities and every non-WBNB quote remain outside Standard mainnet v1.
- Market trading PR #42 is merged as main `67f0d696e7d80b44e3833cbb4cafb4c6afe5a9c3`. The market page now supports BNB-funded curve buys, curve sells with WBNB redemption, PancakeSwap V3 swaps for graduated Standard launches and a manual holder rescue path. Tax-mode post-graduation swaps remain deliberately excluded. Receipt-status follow-up #43, trusted-factory-curve follow-up #44 and canonical-pool follow-up #45 are included in the merged head. This is a frontend transaction path over existing testnet deployments; it does not change or approve the frozen Standard mainnet contracts.
- Holder Shield part 1 and the market-route race fix are merged as main `aa769b4ca31922b6e1601895cbc096ec3d036524` through PR #47. Explore can rank active curves closest to graduation, and token/market pages show the creator's Fortune launch record, current holding and gross token outflow. Outflow coverage is explicit and falls back to the provider's retained window rather than claiming complete history. Late reads from a previous client-side route are dropped; transient refresh failures keep only a market already verified for the same curve and launch type.
- Holder Shield part 2 and optional custom-pair launch rules PR #50 are merged as main `dcaea8124975882849cc84da02b9898f8b822924`; its [Vercel production deployment](https://vercel.com/hoque-industries/fortune/5TuGKRjwumdPTzvxXm4wK2jfvw4f) reports success. The holder API/index remains off without server-only Redis and index configuration; incomplete or inconsistent histories fail closed instead of publishing holder numbers. Launch rules remain unaudited custom-pairs beta code for BSC Testnet only, hidden until an owner-run testnet deployment configures the new factory. They do not alter or approve the frozen Standard mainnet candidate.
- Stock Rewards beta PR #52 is merged as main `8fa46ded9fa3ee866a52f02518c2c859ce2226dd`; [Fortune CI run 37132489961](https://github.com/shawkkkkk/fortune/actions/runs/37132489961), [Stock Rewards Beta run 37132489947](https://github.com/shawkkkkk/fortune/actions/runs/37132489947) and the resulting [Vercel production deployment](https://vercel.com/hoque-industries/fortune/5C8jDun99khriPJdTMr6y7kk4cmW) report success. The source adds an isolated, unaudited BSC-Testnet-only launch engine for fixed baskets of one to five registry stocks. It remains disabled until an owner-run deployment and real lifecycle drill configure its factory. Launch-token-side pool fees only burn; pair-asset rewards accrue in the stock assets, and no platform-recirculation allocation is counted in this path. It does not change or approve the frozen Standard candidate or Burn + Rewards v2.
- Mainnet contract deployment and activation remain blocked. There is no published official mainnet token CA in this release.

## Release scope

The frozen Standard candidate supports WBNB-only, single-pair launches on chain 56, a $10,000 graduation ceiling, 0.5% creator plus 0.5% protocol fees, Pancake V3 graduation and permanently locked LP positions. The opening shield applies to the optional creator purchase too.

Burn + Rewards v2 is isolated research. Its direct pair-asset accounting prototype is not a deployed Infinity hook. It must not be advertised as live or activated with real funds. Broader assets, tokenized securities, multi-pair launches and legacy tax-token mechanics are outside this first mainnet release. The separate `contracts-custom-pairs/` workspace, including its social-fee vault and attestation service, is also unaudited testnet research and does not inherit Standard approval. The separate `contracts-stock-rewards/` workspace is likewise unaudited BSC-Testnet-only research; it is not Burn + Rewards v2 and does not inherit Standard approval.

The Brew/LESGO comparison is recorded in `BREW_REVIEW.md`. The owner's GO revenue reference is captured separately in `PLATFORM_REVENUE.md`: platform buybacks must not consume holder rewards or liquidity. It is a proposed architecture with no deployed Fortune token, configured percentage or release approval.

## Engineering changes in this preparation

- Preserve the redesigned frontend and official mascot; add the official X link and social metadata.
- Recheck wallet account/network and release readiness before each launch signature. Reject invalid precision and uint256 overflow. Simulate launches, check approval receipt status, retain submitted hashes, recover confirmed launches from trusted factory events, and prevent resubmission while an outcome is unresolved. Disable form editing during signing and pending confirmation.
- Read the full bounded factory catalog instead of just the newest 25 entries. Resolve older token addresses, paginate Explore and creator profiles, pin pagination to a block, and expose block number/hash with public data.
- Incrementally refresh verified immutable factory entries, coalesce concurrent requests, reject partial reads and wrong-chain responses, and invalidate cached history after a detected reorg.
- Permit read-only inspection of a configured paused mainnet deployment without enabling transaction signing. This allows pre-activation data verification.
- Make `/api/ready` require full release readiness on chain 56 instead of reporting ready from factory bytecode alone.
- Stop exposing raw upstream RPC error strings through public data APIs.
- Fail closed before market signatures unless the curve is registered by the configured mode-specific Fortune factory. For graduated Standard launches, resolve the pool from PancakeSwap V3 Factory, require the API and factory addresses to match, and verify the pool's two tokens are exactly the launch token and quote asset.
- Check every mined approval, wrap, swap, rescue and unwrap receipt before reporting success or submitting a dependent transaction.
- Keep signing controls keyed to the exact curve and launch type so an in-flight read from another route cannot reattach a verified market. Creator outflow scans pin a chain head, detect pruned history, report bounded coverage and reject a changed head.
- Add transaction/catalog regression tests to CI and a scheduled public-site monitor. GitHub scheduling is best-effort; a configured workflow is not evidence of delivered production incident alerts.

## Data boundary

Creator-flow follow-up ([merged PR #22](https://github.com/shawkkkkk/fortune/pull/22),
not a mainnet capability claim): see `CREATOR_FLOW.md`. It adds visible project fields, local drafts, bounded JSON
import, credential-gated IPFS uploads, metadata provenance and registry-backed
address inspection. Storage/pinning credentials and real-provider upload checks
remain owner/operator prerequisites. Multi-pool, Dev Launch and unrestricted
pairing are not activated. Existing Standard/mainnet evidence is unchanged.

Social-fee routing ([merged PR #33](https://github.com/shawkkkkk/fortune/pull/33),
not a mainnet capability claim): see `SOCIAL_FEES.md`. Splits are registered only by the isolated custom-pair
factory and claims require a wallet binding signed by the configured server attestor. The public deployment has
no configured custom-pair factory or attestor, so this is source and test evidence rather than a live claim path.
The server verifier uses fixed platform endpoints, rejects redirects and non-success bodies, and stops reading
responses above its byte limits. Platform compatibility and regional policy still require live review before beta use.

Stock-token identity checks ([merged PRs #36–#40](https://github.com/shawkkkkk/fortune/pull/40),
not a mainnet capability claim): see `STOCK_PAIRING.md`. Verified status requires an exact tracked issuer contract
on BNB Smart Chain mainnet; xStocks candidates must also appear in the issuer's deployment list. Lookalike names,
symbols and stock-token wording block the isolated custom-pair path, while unreviewed issuer-looking contracts are
reported as unverified rather than counterfeit. Name/ticker overlap without a stronger match is only a warning.
Unicode and punctuation normalization closes trivial text evasions, but the registry, transfer simulation and asset
policy remain independent gates. Anchored and other tokenized securities are discovery-only; mainnet v1 is still WBNB-only.

The RPC catalog is an interim read path with an explicit 10,000-entry maximum across configured factories. It fails rather than truncates beyond that bound. It is not a durable event indexer or a high-volume production SLA. Name/ticker search still covers recent entries; exact token addresses and creator pages use the complete bounded catalog.

Volume, revenue, burns and rewards remain unavailable until their full onchain event ledgers are implemented and reconciled. No approximate or fabricated totals are published. Snapshot block hashes must be checked for reorgs; these are recent-state observations, not finality claims.

Reproduce a catalog snapshot without changing chain state:

```bash
node --import ./scripts/register-ts.mjs scripts/export-onchain-catalog.mjs
FORTUNE_CATALOG_BLOCK=<reported-block> node --import ./scripts/register-ts.mjs scripts/export-onchain-catalog.mjs
```

The output includes the chain, block/hash, every included factory record and a SHA-256 digest. Mainnet read-only exports require correct public factory/registry addresses and configured RPC access; they do not require enabling the mainnet UI.

## Observed verification

- [Public-site monitor run 37194373435](https://github.com/shawkkkkk/fortune/actions/runs/37194373435) passed on October 4 at exact main `facdfd72eb638d70f436dd7508ed4490e9b178b9` against `https://fortunepad.fun`. On its first attempt it passed health, readiness, public metadata, testnet and launch pages, robots, sitemap, canonical root, release, stats, launch catalog and launchable-asset checks; its evidence artifact is retained for 14 days. PR #56 now also invokes this fail-closed monitor after every push to `main`, with bounded retries only for post-deploy propagation. This is point-in-time production evidence, not an uptime SLA or delivered incident-alert drill.
- [Domain cutover PR #12 CI run 37184274899](https://github.com/shawkkkkk/fortune/actions/runs/37184274899) passed the production build/runtime/browser checks and frozen Standard contract suite with 1,000 fuzz runs at exact head `97a632d640331df0d6bf33ad3f084c713ddaa41b`; its Vercel preview reached READY. PR #12 then merged as main `6cbdf3124deb1f5014611cce07a5776b2caf71dc`, and production deployment `dpl_GeJmXwfF4h6AwdDEAViXRnc3Psi9` reached READY. This verifies the web cutover only; it changes no contract or mainnet release gate.
- [Pair-market-data PR #23 CI run 36204534985](https://github.com/shawkkkkk/fortune/actions/runs/36204534985) passed its web build/runtime/browser checks and contract suite with 1,000 fuzz runs. PR #23 is now merged into main `dec346088c573ae88fc9db705804338f77738f99`; Vercel production deployment `dpl_Dw77tGFrkdLixdAPp3LVeZtMyonN` reached READY.
- [Frontend/data PR #26 CI run 36223903240](https://github.com/shawkkkkk/fortune/actions/runs/36223903240) passed its production build, runtime/browser checks and contract suite with 1,000 fuzz runs. PR #26 merged as main `0254b457f5bd78617bc46f0454deb4bcbc71fc69`; its production deployment reached READY.
- [Share-card security PR #27 CI run 36245450216](https://github.com/shawkkkkk/fortune/actions/runs/36245450216) passed the production build, runtime smoke gate, desktop/mobile browser checks and contract suite with 1,000 fuzz runs. PR #27 then merged as main `ce6f65f49cce0489bab4ba5565aaa8f320ecb5fa`; Vercel production deployment `dpl_3pm7m6yfTd51RyhAHyPDMEXreuhn` reached READY.
- [Custom-pairs PR #28 CI run 36254655403](https://github.com/shawkkkkk/fortune/actions/runs/36254655403) passed the production build, runtime/browser checks and frozen Standard contract suite with 1,000 fuzz runs. Its dedicated [custom-pairs run 36254655416](https://github.com/shawkkkkk/fortune/actions/runs/36254655416) passed contract-size and generated-artifact drift checks, unit/fuzz/invariant suites and the real PancakeSwap V2 lifecycle on a BSC-mainnet fork. The reviewed head had READY preview `dpl_AnRjix2FKbzUYkWrg4cjT441cHAx`; merged main `df907757b7155ee55f2e5f928a7d746461788268` has READY production deployment `dpl_8duqQg7V4nhRobGBFKU5ghGuPvcr`.
- [Social-proof hardening PR #34 CI run 36331068535](https://github.com/shawkkkkk/fortune/actions/runs/36331068535) passed 98 web tests, the production build, runtime smoke gate, desktop/mobile creator-flow checks, the frozen Standard contract tests and 1,000-run fuzzing. PR #34 merged as current main `bf429b1988906983a96a251357f6710a2070bb32`; its Vercel deployment reports success. This run exercises the repository at that revision but is not an independent audit of the social-fee vault or custom-pairs workspace.
- [Hardened penny-stock PR #36 CI run 36342449905](https://github.com/shawkkkkk/fortune/actions/runs/36342449905) passed 102 web tests, the production build, runtime smoke gate, desktop/mobile creator-flow checks, the frozen Standard contract tests and 1,000-run fuzzing after normalization follow-up #37 merged into the feature branch. PR #36 then merged as current main `8702dcb41c6945a9e69d21ae02dee5258699ce02`; its Vercel deployment reports success. The frozen Standard fingerprint did not change.
- [Combined market PR #42 CI run 36357575952](https://github.com/shawkkkkk/fortune/actions/runs/36357575952) passed the pinned-dependency and release-manifest checks, 119 web regression tests, production build/runtime smoke checks, desktop/mobile creator flows, the frozen Standard contract suite and 1,000-run fuzzing after safety follow-ups #43–#45 were merged into its exact head `3700a129fd964d3f6bc24b166c965eb1eab3c4f7`. Its Vercel preview also reached READY. PR #42 then merged as main `67f0d696e7d80b44e3833cbb4cafb4c6afe5a9c3`. These checks exercise the transaction UI and unchanged frozen contracts; they are not an independent audit or approval for real-value trading.
- [Holder Shield PR #47 CI run 36358965247](https://github.com/shawkkkkk/fortune/actions/runs/36358965247) passed 123 web tests, the production build/runtime/browser checks, the frozen Standard contract suite and 1,000-run fuzzing at exact head `33b9a637ef6021311644b8a8f067bc82737e42b8`; its Vercel preview reached READY. PR #47 then merged as main `aa769b4ca31922b6e1601895cbc096ec3d036524`. Creator outflow is gross transfer activity, not verified sales or identity attribution, and incomplete provider history remains labeled incomplete.
- [PR #50 Fortune CI run 36507446982](https://github.com/shawkkkkk/fortune/actions/runs/36507446982) passed the release-manifest and pinned-dependency gates, web regressions, production build/runtime smoke, desktop/mobile creator flows, frozen Standard contract tests and 1,000-run fuzzing at exact head `732450387ca869cb1cf772f90473d139a448caba`. The dedicated [Custom Pairs Beta run 36507446977](https://github.com/shawkkkkk/fortune/actions/runs/36507446977) passed size and generated-ABI checks, unit/fuzz/invariant suites with 1,000 fuzz runs, and the PancakeSwap V2 lifecycle on a BSC-mainnet fork. Review fixes made holder-index lease ownership atomic with its Redis mutation and rejected vesting windows that outlast the complete unlock schedule. These checks are not an independent audit or authorization to deploy the beta contracts.
- [Ten-launch graduation-wave run 36204084110](https://github.com/shawkkkkk/fortune/actions/runs/36204084110) failed closed during its chain/balance preflight on September 26. The configured testnet deployer had `0.0110827725 tBNB`, below the workflow's conservative `0.25 tBNB` safety budget. No setup, launch, graduation or load-test step ran and no evidence artifact was produced; this run does not satisfy a rehearsal gate.
- Creator-flow PR #22: [CI run 36195640178](https://github.com/shawkkkkk/fortune/actions/runs/36195640178) passed on September 25: 22 web tests, production build/runtime smoke and 53 contract tests with 1,000 fuzz runs. The normal contract suite does not independently establish a live fork pass. Follow-up [web job 108273239958](https://github.com/shawkkkkk/fortune/actions/runs/36196438248/job/108273239958) also passed desktop/mobile browser checks at 22:24 UTC, with four screenshots retained in the `creator-flow-browser` artifact. Those UI checks use localhost fixtures, not production chain or provider evidence.
- Production Next.js build passed. Ten new web regression tests passed.
- Foundry v1.8.3: 53 tests passed at 1,000 fuzz runs. The separately executed live BSC-mainnet fork lifecycle passed. Isolated rewards v2: four tests passed at 1,000 fuzz runs.
- Production-runtime checks passed, including all seven testnet launches paginated at one fixed block, oldest-token API/page lookup, malformed-input rejection, release status and metadata. See `release-evidence/2026-09-25/runtime.json`.
- All 12 smoke checks also passed against the public production URL after PR #15 deployed, including live readiness, stats, launches and launchable assets. See `release-evidence/2026-09-25/public-site-smoke.txt`. This is a point-in-time observation, not an uptime guarantee.
- Testnet readiness passed with one of two providers responding (degraded redundancy). Slow public testnet responses exceeded the earlier two-second probe budget; only the testnet liveness budgets were increased. Mainnet budgets and gates are unchanged. See `release-evidence/2026-09-25/testnet-readiness.json`.
- npm audit returned zero reported vulnerabilities. This is dependency evidence, not a smart-contract audit.

- [Stock Rewards PR #52 Fortune CI run 37132489961](https://github.com/shawkkkkk/fortune/actions/runs/37132489961) passed the Standard production build/runtime/browser checks, frozen-candidate validation and contract suite with 1,000-run fuzzing. Its dedicated [Stock Rewards Beta run 37132489947](https://github.com/shawkkkkk/fortune/actions/runs/37132489947) passed EIP-170 size and ABI-drift checks, unit/fuzz/invariant suites and the real PancakeSwap V3 lifecycle on a BSC Testnet fork. The merged code has a successful Vercel production deployment, but the feature remains unconfigured and unavailable until the protected owner-run testnet deploy-and-drill succeeds.

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

1. The `fortunepad.fun` attachment, DNS verification, HTTPS, `www` redirect and production site URL are verified; PR #12 is merged. Preserve the working Squarespace DNS and unrelated email records. No further domain-owner action is currently required.
2. Provide the completed external reviews, public Safe address and signer availability. Configure dedicated RPC/deployer secrets through the protected services, not chat. Funding and governance signatures require the actual wallet owners.
3. To enable Holder Shield's exact holder index, provision the server-only Redis store and a full-history BSC provider starting at the configured factory deployment block, generate `CRON_SECRET` offline, schedule the documented holder cron, and retain reconciliation/restart evidence before calling the index operational. Durable production indexing and image hosting remain separate prerequisites; image URLs/IPFS URIs work today, while upload hosting is not configured.
4. Fund the public BSC-testnet rehearsal deployer with enough faucet tBNB to meet the `0.25 tBNB` ten-launch safety budget, then rerun failed job `36204084110`. Its last observed balance was `0.0110827725 tBNB`; do not substitute mainnet BNB or a mainnet key.
5. To activate the unaudited custom-pairs beta on BSC Testnet, create the social attestor key offline, store it only as the server-only Vercel secret `FORTUNE_SOCIAL_ATTESTOR_PRIVATE_KEY`, and pass only its public address to **Custom Pairs Beta Testnet Deploy + Drill** with confirmation `DEPLOY_CUSTOM_PAIRS_BETA`. Only after its real lifecycle and social-fee drill passes, configure the reported factory/test-token addresses in Vercel and redeploy. Never reuse these contracts, keys or credentials on mainnet.
6. To activate the unaudited Stock Rewards beta on BSC Testnet, fund the protected testnet deployer with at least `0.1 tBNB`, run **Stock Rewards Beta Testnet Deploy + Drill** with confirmation `DEPLOY_STOCK_REWARDS_BETA`, and retain its launch, graduation, swap, fee-collection and multi-asset claim evidence. Only then set `NEXT_PUBLIC_FORTUNE_STOCK_REWARDS_FACTORY_ADDRESS` to the reported testnet factory and redeploy. Do not use a mainnet key, mainnet BNB, or treat this as audit or mainnet evidence.

Hourly cloud continuation checks are configured to inspect GitHub, finish safe work when accessible, and surface changed blockers. They do not guarantee continuous execution or automatically authorize mainnet activation. Avoid concurrent edits to another active release-preparation branch.
