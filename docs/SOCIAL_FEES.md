# Social fee routing (beta)

Status: unaudited beta inside the custom-pairs workspace (`contracts-custom-pairs/`), BSC Testnet only, outside the frozen Standard candidate and the mainnet fingerprint. Updated 2026-09-27.

A custom-pair launch can split its creator fee between up to ten recipients: wallets and social accounts. A social account claims its share on `/claims` after proving it owns the account. This is the WIRED model (verify a public challenge, bind a wallet, claim), with several recipients per launch and pooled claims across every launch that names an account.

## Why only custom pairs

The frozen Standard fee router pushes creator fees to an immutable `creator` address on every trade, so fees cannot be redirected there without changing the frozen candidate. That candidate still requires independent audit and release approval. The custom-pair curve pulls fees and lets the factory set its fee recipient, so a split launch points it at the vault in the launch transaction. Standard support needs a future Standard version.

## Contracts

`FortuneSocialFeeVault` (`contracts-custom-pairs/src/FortuneSocialFeeVault.sol`):

| Piece | Behavior |
| --- | --- |
| Split | 1 to 10 shares, each at least 1%, summing to 100%, no duplicates, fixed at launch. Wallet shares are bound from the start. |
| Identities | `keccak256(abi.encode(uint8 platform, string account))`; wallets use `keccak256(abi.encode(uint8(0), address))`. Accounts are lowercase `[a-z0-9_.-]`, at most 64 bytes. |
| Collect | Permissionless. Pulls the curve's creator fees and credits exactly what arrived (balance delta), rounding dust to the first recipient. |
| Claim | Only the bound wallet. Pays what is owed; if the vault's balance of that token has fallen below the total owed, every claim takes the same pro-rata haircut. A token that takes more from the vault than it sends cannot be claimed, so it can never short others. Claims can never be paused. |
| Binding | EIP-712 `Binding(identityId, wallet, stableId, nonce, deadline)` signed by the attestor and submitted by that wallet. Effective after 1 hour, or 3 days to replace a bound wallet. Cancellable until then by the guardian, the owner, the bound wallet or the pending wallet. |
| Permanent ids | The first binding to take effect pins the platform's permanent account id where there is one, so a recycled handle cannot take the account over. |
| Admin | Owner sets attestor, guardian and registrars; the guardian can pause new bindings (only the owner resumes). Nobody can move funds or change a split. |

The factory gained `LaunchParams.feeShares` and `setSocialFeeVault`; the curve config gained an optional `feeRecipient`. Split launches register their shares with the vault in the launch transaction, and the curve's recipient can never be changed away from the vault.

## Platforms and proofs

The verifier (`lib/social-verify.ts`) only calls configured platform endpoints; a pasted link supplies an id, never a host. Redirects fail closed, unsuccessful HTTP response bodies cannot establish ownership, and responses are bounded while streaming (1,000,000 bytes normally; 6,000,000 for WeChat articles). A platform that requires a redirect needs a reviewed endpoint update before verification can succeed. No platform credentials are needed.

| Id | Platform | Account | Proof | Permanent id pinned |
| --- | --- | --- | --- | --- |
| 1 | X | handle | Public post with the code (syndication, oEmbed fallback) | Numeric user id |
| 2 | GitHub | username | Gist with the code | Numeric user id |
| 3 | TikTok | handle | Video caption (oEmbed) | — |
| 4 | Telegram | public channel | Channel post (embed page, must be posted by the channel) | — |
| 5 | YouTube | @handle | Video title (oEmbed) | — |
| 6 | Farcaster | username | Wallet listed as a verified externally owned address | fid |
| 7 | Bluesky | handle | Post with the code | DID |
| 8 | Weibo 微博 | numeric UID | Code in the bio (个人简介), read with Weibo's visitor cookies | UID |
| 9 | Bilibili 哔哩哔哩 | numeric UID | Code in the bio (个性签名), public card API | UID |
| 10 | WeChat Official Account 微信公众号 | `gh_` original id | Article containing the code, published by that account | `gh_` id |

The challenge code is `fortune-` plus 24 hex characters of `keccak256(abi.encode("fortune-social-bind-v1", chainId, vault, identityId, wallet, nonce))`: specific to the wallet and single-use per binding. Chinese platforms get only the bare code, with no promotional wording.

Weibo, Bilibili and WeChat accounts are stored by id because the vault only accepts ASCII handles and Chinese display names can change. `GET /api/public/v1/social/resolve` turns profile links, Weibo custom domains and WeChat article links into ids and returns display names, so launchers can paste links and everyone sees names.

### Not supported yet, and why

Checked from a server outside mainland China on 2026-09-27:

- **Douyin 抖音**: share pages now load data client-side through signed requests. Reading them would mean reverse-engineering request signatures against Douyin's terms. The supported path is a Douyin Open Platform app ("log in with Douyin"), which requires a mainland company registration and Douyin's approval.
- **Personal WeChat 微信**: personal accounts have no public page or handle anyone can reference. The only path is WeChat Login through the WeChat Open Platform (mainland business verification and an ICP-filed website).
- **Xiaohongshu 小红书** and **Zhihu 知乎**: profile pages and APIs redirect to login.
- **Binance Square**: only a posting API with an API key; no public read endpoint.

A launch can technically name any platform id up to 32, but the website only offers platforms the verifier supports, so fees are never routed to accounts that could not claim.

### Regional and platform rules

WeChat and Douyin developer terms prohibit virtual-currency services, and mainland China prohibits token issuance and crypto trading. Official logins for those platforms would be refused, and marketing Fortune launches to mainland users is a legal question for counsel, separate from the technical support above. Keyless proofs work for Chinese-speaking creators wherever they live; the product decision about which regions Fortune serves belongs to the owner.

## Website and API

- `/launch/custom`: fee split editor (your wallet, other wallets, social accounts; global and Chinese platforms), link resolution and display names.
- `/custom/[curve]`: who receives the creator fee, verification state, fees waiting in the curve and collected, and a permissionless collect button.
- `/claims`: accounts and launches paying the connected wallet, account lookup, challenge code, proof check, binding, pending-change cancellation, collect-and-claim.
- `GET /api/public/v1/social/status`, `GET /api/public/v1/social/identity`, `GET /api/public/v1/social/resolve`, `POST /api/public/v1/social/attest` (rate limited). Documented in the OpenAPI spec.

## Configuration

| Variable | Where | Purpose |
| --- | --- | --- |
| `FORTUNE_SOCIAL_ATTESTOR_PRIVATE_KEY` | Vercel, server-only, secret | Key the verifier signs bindings with. Its address must equal `vault.attestor()`. Generate it offline (for example `cast wallet new`), store it only in Vercel, never in chat, the repository or a `NEXT_PUBLIC_` variable. `GET /api/public/v1/social/status` shows its address and whether it matches. |
| `FORTUNE_GITHUB_TOKEN` | Vercel, optional secret | Read-only token without scopes; only raises GitHub's rate limit. |
| `FORTUNE_FARCASTER_HUB_URL` | optional | HTTPS Farcaster hub (default `https://hub.pinata.cloud`). |
| `FORTUNE_SOCIAL_PROOF_MOCK_ORIGIN` | tests only | Loopback origin for local end-to-end tests. Anything but `http://127.0.0.1:<port>` or `http://localhost:<port>` is ignored. |

The vault address is read from the custom-pair factory (`socialFeeVault()`), so no public variable is needed.

## Deployment

The **Custom Pairs Beta Testnet Deploy + Drill** workflow deploys the factory and the vault, wires them (`setRegistrar`, `setSocialFeeVault`), and runs a drill whose launch splits its creator fee 60% to the deployer wallet and 40% to X `fortunepad`: it collects, claims the wallet share and checks the X share is credited. Its optional `social_fee_attestor` input takes the attestor's public address only. Set `FORTUNE_SOCIAL_ATTESTOR_PRIVATE_KEY` in Vercel first, read the address from `/api/public/v1/social/status`, then pass it to the workflow (or call `setAttestor` later from the owner).

## Verification so far

- Foundry: 29 vault tests (splits, taxed and rebasing tokens, tax-on-top refusal, haircuts, rescue payouts, signature forgery, replay, expiry and theft, delays, veto, guardian, pause, permanent ids, zero attestor, recipient views) and a 1,000-run split fuzz test. The invariant suite (8,192 random calls) checks that owed amounts add up to the total, the vault holds exactly what it owes, collected equals owed plus claimed, and that after every run everything collected can be claimed until the vault is empty. Mutation checks (dropping rounding dust, paying without the haircut) make the suites fail.
- The website's EIP-712 digest and identity ids are pinned to the same constants in the Foundry and web test suites.
- Local rehearsal on a chain-97 node with the real PancakeSwap V2 factory bytecode: the deploy script and drill, and two browser runs. One launched a three-way split, collected, claimed the wallet share and verified a GitHub account through a mocked gist (claims matched shares exactly). The other named a Bilibili UID and a Weibo custom domain, verified the Bilibili bio, bound and claimed.
- Live checks against the real platforms: X, TikTok, Telegram, YouTube, Bluesky, Farcaster, Weibo, Bilibili and WeChat articles accept a matching post or bio and reject a missing code or the wrong author. GitHub's API is covered by tests only (unreachable from the build sandbox).
- axe: no violations on the launch split, market recipients and claims pages (light English desktop, dark Chinese mobile).

## Before mainnet

Independent audit of the vault together with `contracts-custom-pairs/`; the attestor key in managed key storage with monitoring that alerts on bindings the server did not sign; a guardian able to respond within the 1-hour window; the owner on a multisig; and a regional access decision.
