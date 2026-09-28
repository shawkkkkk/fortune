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

The verifier (`lib/social-verify.ts`) only calls configured platform endpoints; a pasted link supplies an id, never a host. Redirects are never followed, unsuccessful HTTP response bodies cannot establish ownership, and responses are bounded while streaming (1,000,000 bytes normally; 6,000,000 for WeChat articles). Two reads look at a redirect's `Location` without fetching it: Xiaohongshu sends a missing note to `/404`, and an `xhslink.com` short link names the note, whose page is then fetched from the fixed Xiaohongshu origin. Any other redirect fails closed. No platform credentials are needed.

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
| 11 | Xiaohongshu 小红书 (RedNote) | 24-character user id | Public note whose title or text contains the code, read from the note page's server-rendered state | user id |
| 12 | Private claim link 私密领取链接 | `keccak256(secret)`, 64 hex characters | The link's secret (see below) | the account itself |

The challenge code is `fortune-` plus 24 hex characters of `keccak256(abi.encode("fortune-social-bind-v1", chainId, vault, identityId, wallet, nonce))`: specific to the wallet and single-use per binding. Chinese platforms get only the bare code, with no promotional wording.

Weibo, Bilibili, WeChat and Xiaohongshu accounts are stored by id because the vault only accepts ASCII handles and Chinese display names can change. `GET /api/public/v1/social/resolve` turns profile links, Weibo custom domains, WeChat article links and Xiaohongshu note links or share text into ids and returns display names, so launchers can paste links and everyone sees names. Xiaohongshu profile pages need a login, so a profile link gives the id but not the name; a note link gives both.

### Platforms Fortune cannot check

Checked again from a server outside mainland China on 2026-09-28. Fortune does not solve bot challenges or reverse-engineer request signing, so these stay unverifiable:

- **Douyin 抖音**: share pages and the open player page (`open.douyin.com/player/video`) answer with a `byted_acrawler` script challenge. The supported path would be a Douyin Open Platform app ("log in with Douyin"), which needs a mainland company registration and Douyin's approval.
- **Personal WeChat 微信**: no public page or handle anyone can reference. The only official path is WeChat Login (mainland business verification and an ICP-filed website).
- **Zhihu 知乎**: every page answers 403 with a `zse-ck` script challenge.
- **Binance Square**: every page answers 202 with an AWS WAF challenge (`x-amzn-waf-action: challenge`); the API only posts, with a key.

Xiaohongshu note pages, by contrast, are served to plain requests with the note and its author in `window.__INITIAL_STATE__`, so Xiaohongshu is verified directly (id 11). Its profile pages and `/discovery/item/` links still redirect to a login or `/404`, so the verifier always fetches `/explore/<note id>`. Share tokens (`xsec_token`) are not needed and are never forwarded.

For everyone else there is the private claim link.

### Private claim links (id 12)

For people Fortune cannot verify: Douyin and personal WeChat users, Zhihu and Binance Square writers, or anyone without a public account.

1. The launcher chooses **Private claim link** in the fee split. Their browser makes a 32-byte random secret; the launch names `keccak256(secret)` (64 hex characters) as the account. The secret never goes onchain or to Fortune's server at launch.
2. The launcher sends the link, `https://fortunepad.fun/claims#claim=<secret>`, privately. The secret is in the URL fragment, which browsers never send to servers or in `Referer` headers. Launching stays disabled until the launcher ticks that each link is saved; the links are also kept in that browser's storage and listed on `/claims`.
3. The recipient opens the link in a wallet browser and presses **Bind this wallet**. `POST /social/attest` checks `keccak256(secret) == account` and signs the binding, which the recipient's wallet submits. It takes effect after the usual hour.

A link binds once. The attestor refuses a link once any wallet is bound or waiting to be (`409`, `LINK_USED`), and the vault's per-account nonce makes a second signature for the same nonce fail once the first binding lands, so two people racing with one link cannot both bind. After the first binding, a leaked link is worthless.

What it does and does not prove: possession of the link, not identity. The launcher who made the link could claim it too, just as they could have routed the share to their own wallet. A link sent over an insecure channel can be intercepted before it is used. A lost link strands its share: nobody, including Fortune, can recover it. A bound wallet cannot be changed later, so a recipient who loses that wallet loses future fees too. That is the price of making a used link worthless. As for every platform, the guardian can cancel a pending first binding within its hour, after which the link can bind again.

A launch can technically name any platform id up to 32, but the website only offers platforms the verifier supports, so fees are never routed to accounts that could not claim.

### Regional and platform rules

WeChat and Douyin developer terms prohibit virtual-currency services, and mainland China prohibits token issuance and crypto trading. Official logins for those platforms would be refused, and marketing Fortune launches to mainland users is a legal question for counsel, separate from the technical support above. Keyless proofs work for Chinese-speaking creators wherever they live; the product decision about which regions Fortune serves belongs to the owner.

## Website and API

- `/launch/custom`: fee split editor (your wallet, other wallets, social accounts on global and Chinese platforms, private claim links with copy-link and bilingual copy-message buttons), link resolution and display names. Claim links are saved in the browser before the launch is signed and shown again on the receipt.
- `/custom/[curve]`: who receives the creator fee, verification state, fees waiting in the curve and collected, and a permissionless collect button.
- `/claims`: accounts and launches paying the connected wallet, account lookup, challenge code, proof check, binding, pending-change cancellation, collect-and-claim. Opening a claim link goes straight to a one-step bind; links this browser created are listed with their status.
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
- Xiaohongshu, live on 2026-09-28: note links and app share text resolve to the author's id and name; a real note fails verification without the code and for the wrong author, and passes when the searched text is in it. Unit tests cover a forged state inside escaped page text, `/404` and login redirects, and short links (only a note on xiaohongshu.com counts, fetched from the fixed origin). Every public `xhslink.com` sample found redirected to the home page from this server, so short links are covered by tests only; when one fails, the error asks for the full note link.
- Private claim links, rehearsed in a browser on a local chain-97 node: a launch paying the launcher 40%, a claim link 30% and a Xiaohongshu account 30% (named by a note link). Launching stayed disabled until the link was marked saved; the link holder bound in one step and claimed exactly the 30% share; a second wallet with the same link was refused on the page and by the API (`409`, `LINK_USED`); the Xiaohongshu owner verified with a mocked note and claimed the same amount. axe found nothing, and Chinese dark mode at 390 px had no horizontal overflow.

## Before mainnet

Independent audit of the vault together with `contracts-custom-pairs/`; the attestor key in managed key storage with monitoring that alerts on bindings the server did not sign; a guardian able to respond within the 1-hour window; the owner on a multisig; and a regional access decision.
