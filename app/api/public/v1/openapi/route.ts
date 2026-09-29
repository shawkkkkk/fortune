import { NextResponse } from "next/server";

export const revalidate = 3600;

export async function GET(request: Request) {
  const origin = new URL(request.url).origin;

  const document = {
    openapi: "3.1.0",
    info: {
      title: "Fortune Public API",
      version: "1.0.0-research",
      description:
        "Keyless public reads and deterministic launch preflight for the Fortune BNB Chain launch protocol. Production write preparation remains disabled until the audited testnet stack is deployed.",
    },
    servers: [{ url: origin + "/api/public/v1" }],
    tags: [
      { name: "Protocol" },
      { name: "Assets" },
      { name: "Markets" },
      { name: "Launches" },
      { name: "Analytics" },
    ],
    paths: {
      "/meta": {
        get: {
          tags: ["Protocol"],
          summary: "API capabilities and design guarantees",
          responses: { "200": { description: "API metadata" } },
        },
      },
      "/readiness": {
        get: {
          tags: ["Protocol"],
          summary: "14-point infrastructure readiness gate",
          responses: {
            "200": {
              description:
                "Factory, RPC redundancy, graduation, LP-lock and Pancake deployment readiness",
            },
          },
        },
      },
      "/protocol": {
        get: {
          tags: ["Protocol"],
          summary: "Canonical Fortune deployment configuration",
          responses: { "200": { description: "Protocol configuration" } },
        },
      },
      "/assets": {
        get: {
          tags: ["Assets"],
          summary: "Fortune Asset Registry catalog",
          parameters: [
            { name: "q", in: "query", schema: { type: "string" } },
            { name: "category", in: "query", schema: { type: "string" } },
            {
              name: "capability",
              in: "query",
              schema: {
                type: "string",
                enum: ["quote", "reward", "graduation"],
              },
            },
            { name: "launchable", in: "query", schema: { type: "boolean" } },
            { name: "cursor", in: "query", schema: { type: "string" } },
            {
              name: "limit",
              in: "query",
              schema: { type: "integer", minimum: 1, maximum: 100 },
            },
          ],
          responses: { "200": { description: "Asset catalog" } },
        },
      },
      "/assets/check": {
        post: {
          tags: ["Assets"],
          summary: "Inspect a custom BSC token before Fortune registry approval",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["address"],
                  properties: {
                    address: { type: "string" },
                  },
                },
              },
            },
          },
          responses: {
            "200": { description: "Active-chain contract reads, live registry eligibility and Standard asset-policy restrictions at a verified block. Not an audit or transaction authorization." },
            "400": { description: "Invalid address or JSON" },
            "503": { description: "BSC RPC unavailable or not configured" },
          },
        },
      },
      "/universe": {
        get: {
          tags: ["Assets"],
          summary: "Pair universe: BNB tokenized stocks, funds, gold, pre-IPO tokens and majors with live prices and Fortune launchability",
          description:
            "Contract identity comes from Fortune's reviewed snapshot, where every address answered onchain with a matching symbol. Prices come live from CoinGecko, DexScreener and Lighter. fortune.status is launchable only for assets the active onchain Asset Registry approves; discovery and reference rows are never approval.",
          responses: { "200": { description: "Items with live market data, issuer controls and launchability reasons, featured ids and data coverage" } },
        },
      },
      "/pairs": {
        get: {
          tags: ["Assets"],
          summary: "Quote assets and launchability/preflight state",
          parameters: [
            { name: "q", in: "query", schema: { type: "string" } },
            { name: "category", in: "query", schema: { type: "string" } },
            {
              name: "launchable",
              in: "query",
              schema: { type: "boolean", default: true },
            },
            { name: "cursor", in: "query", schema: { type: "string" } },
            {
              name: "limit",
              in: "query",
              schema: { type: "integer", minimum: 1, maximum: 100 },
            },
          ],
          responses: { "200": { description: "Pair catalog" } },
        },
      },
      "/stocks": {
        get: {
          tags: ["Assets"],
          summary: "Discovered BSC tokenized-stock representations",
          parameters: [
            { name: "q", in: "query", schema: { type: "string" } },
            { name: "provider", in: "query", schema: { type: "string" } },
            { name: "pairable", in: "query", schema: { type: "boolean" } },
            { name: "cursor", in: "query", schema: { type: "string" } },
            {
              name: "limit",
              in: "query",
              schema: { type: "integer", minimum: 1, maximum: 100 },
            },
          ],
          responses: { "200": { description: "Stock-token catalog" } },
        },
      },
      "/tokens": {
        get: {
          tags: ["Markets"],
          summary: "Fortune token markets",
          parameters: [
            { name: "q", in: "query", schema: { type: "string" } },
            { name: "status", in: "query", schema: { type: "string" } },
            { name: "quote", in: "query", schema: { type: "string" } },
            {
              name: "sort",
              in: "query",
              schema: {
                type: "string",
                enum: ["marketCap", "newest", "volume"],
              },
            },
            { name: "cursor", in: "query", schema: { type: "string" } },
            {
              name: "limit",
              in: "query",
              schema: { type: "integer", minimum: 1, maximum: 100 },
            },
          ],
          responses: { "200": { description: "Token markets" } },
        },
      },
      "/tokens/{id}/metadata": {
        get: {
          tags: ["Markets"], summary: "Verified Standard project metadata with onchain provenance",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: { "200": { description: "Creator-supplied metadata, filtered public links, registry/factory/creator binding, frozen flag and block evidence" }, "404": { description: "Not a verified Standard launch" }, "503": { description: "Onchain metadata unavailable" } },
        },
      },
      "/tokens/{id}": {
        get: {
          tags: ["Markets"],
          summary: "Token market, pool health and chart phase",
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
          ],
          responses: {
            "200": { description: "Token detail" },
            "404": { description: "Token not found" },
          },
        },
      },
      "/launches": {
        get: {
          tags: ["Launches"],
          summary: "Launch ledger with explicit health state",
          parameters: [
            { name: "creator", in: "query", schema: { type: "string" } },
            { name: "status", in: "query", schema: { type: "string" } },
            { name: "cursor", in: "query", schema: { type: "string" } },
            {
              name: "limit",
              in: "query",
              schema: { type: "integer", minimum: 1, maximum: 100 },
            },
          ],
          responses: { "200": { description: "Launch ledger" } },
        },
      },
      "/markets": {
        get: {
          tags: ["Markets"],
          summary: "Explore board: live prices, market caps, pair assets and bounded trade activity",
          description:
            "Graduated tokens are priced from the official Pancake pools that hold Fortune's locked liquidity. Activity comes from a bounded eth_getLogs ledger and is null unless its coverage spans the whole window; ledger.coverage states the exact block range. Sorts other than newest rank the 100 most recent launches.",
          parameters: [
            { name: "sort", in: "query", schema: { type: "string", enum: ["newest", "volume24h", "trending", "marketCap", "graduating"] } },
            { name: "tokens", in: "query", description: "Up to 50 comma-separated token addresses (a watchlist). Overrides sort and paging; tokens that are not Fortune launches are skipped.", schema: { type: "string" } },
            { name: "offset", in: "query", schema: { type: "integer", minimum: 0 } },
            { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 25 } },
          ],
          responses: {
            "200": { description: "Ranked markets; sortAvailable is false when the ledger cannot support the requested ranking" },
            "400": { description: "Unknown sort or out-of-range offset" },
          },
        },
      },
      "/markets/{token}": {
        get: {
          tags: ["Markets"],
          summary: "One market: live summary, pair weights and reserves, canonical price chart and recent trades",
          parameters: [
            { name: "token", in: "path", required: true, schema: { type: "string" } },
            { name: "range", in: "query", schema: { type: "string", enum: ["24h", "7d", "30d"] } },
          ],
          responses: {
            "200": { description: "Market detail; chart.ledger.coversRange is false when the log provider could not serve the whole range. supply splits totalSupply into curve, pools, creator, vaults, burned and holders, read at the same block. creator is a creator check: launches and phase counts across every Fortune launch by the creator, holdsShare of this token now, and flow, every transfer of this token out of (sent) and into (received) the creator wallet since launch; flow.coverage.complete is false when the log provider could not reach back to the launch." },
            "404": { description: "Not recorded by the configured Fortune factories" },
          },
        },
      },
      "/holders/{token}": {
        get: {
          tags: ["Markets"],
          summary: "Holder count, top ten holders and the Launch Shield window for one launch",
          description:
            "From Fortune's holder index: every Transfer since the launch's creation block folded into exact balances. The curve, official pools, Fortune vaults and burn addresses are excluded from holders and the top list. view.status is tracked, untracked (created before indexing began), pending, gap or inconsistent (history incomplete; no numbers are returned). enabled is false when no index store is configured. Each read may advance the index once per interval, after the response.",
          parameters: [{ name: "token", in: "path", required: true, schema: { type: "string" } }],
          responses: {
            "200": { description: "enabled, token, creator and view: holders, top[] (address, balance, share, early), topShare, shield (buys, wallets, tokens, share, taxedBuys, tax[], checked, stillHolding, holdingNow, holdingShare), indexedTo, updatedAt, reconciledAt" },
            "404": { description: "Not a Fortune launch on this network" },
            "503": { description: "The launch could not be read" },
          },
        },
      },
      "/pairs/inspect": {
        get: {
          tags: ["Assets"],
          summary: "Measure any BEP-20 as a custom pair",
          description:
            "Reads metadata and bytecode (proxy slots; pause, blacklist, fee-change, limit, mint and rebasing selectors), then simulates the transfers a custom-pair curve makes with eth_call state overrides: wallet to curve, curve to wallet and curve to pool. Each leg reports the measured tax in basis points. Nothing is signed or broadcast. A simulation at one block, not an audit.",
          parameters: [
            { name: "address", in: "query", required: true, schema: { type: "string" } },
            { name: "chain", in: "query", schema: { type: "integer", enum: [56, 97] } },
            { name: "holder", in: "query", schema: { type: "string" }, description: "Optional wallet to simulate from when no fresh-wallet balance can be synthesized" },
          ],
          responses: {
            "200": { description: "verdict (clear, caution, unsupported), findings, per-leg taxes, stock identity (a verified issuer stock token, an imitation of one, an unverified token presenting itself as one, or a shared company name or ticker, with the verified contract) and the block the simulation used" },
            "400": { description: "Not an address or unsupported chain" },
            "503": { description: "The network could not be read" },
          },
        },
      },
      "/custom-pairs": {
        get: {
          tags: ["Launches"],
          summary: "Custom-pair beta launches (any BEP-20 pair), newest first",
          description:
            "Unaudited beta, never enabled on BNB Smart Chain mainnet. Returns configured=false where the custom-pair factory is not deployed. Prices are in pair-token base units per whole launch token, scaled by 1e18.",
          parameters: [
            { name: "offset", in: "query", schema: { type: "integer", minimum: 0 } },
            { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 48 } },
          ],
          responses: { "200": { description: "Factory, protocol fee, pause state, launchRules (the factory's launch rules contract, or null when it offers none) and one page of launches, each with rulesContract when it was created with rules" }, "503": { description: "The network could not be read" } },
        },
      },
      "/custom-pairs/{curve}": {
        get: {
          tags: ["Launches"],
          summary: "One custom-pair launch: curve state, fees, graduation or rescue",
          parameters: [{ name: "curve", in: "path", required: true, schema: { type: "string" } }],
          responses: { "200": { description: "Launch detail read at one block. rules is null unless the launch chose launch rules; then it lists every setting, caps in launch tokens, exempt wallets and active (false after graduation or rescue)" }, "404": { description: "No custom-pair launch uses this curve" } },
        },
      },
      "/social/status": {
        get: {
          tags: ["Launches"],
          summary: "Social fee routing: vault, verifier and supported platforms",
          description:
            "Custom-pair beta only. Launches can split their creator fee between wallets and social accounts; accounts claim after verifying. Returns the vault the custom-pair factory uses, the attestor address the vault trusts, the address this server signs with (never the key) and ready=true when they match and bindings are not paused.",
          responses: { "200": { description: "Status, vault rules (delays, share limits) and platforms with their proof method" }, "503": { description: "The network could not be read" } },
        },
      },
      "/social/identity": {
        get: {
          tags: ["Launches"],
          summary: "A social account's or wallet's fee balances, binding and launches",
          description:
            "Pass platform and account (a handle or profile link) for one account, or wallet for every account bound to it or waiting to be. Includes owed and claimable amounts per pair token, and each launch naming the account with its share of fees not yet collected.",
          parameters: [
            { name: "platform", in: "query", schema: { type: "string", enum: ["x", "github", "tiktok", "telegram", "youtube", "farcaster", "bluesky", "weibo", "bilibili", "wechat", "xiaohongshu", "link"] } },
            { name: "account", in: "query", schema: { type: "string" } },
            { name: "wallet", in: "query", schema: { type: "string" } },
          ],
          responses: {
            "200": { description: "Identity with binding state (wallet, pendingWallet, pendingAt, nonce), balances and curves" },
            "400": { description: "Unknown platform, invalid handle or wallet" },
            "503": { description: "Social fees are not enabled here, or the network could not be read" },
          },
        },
      },
      "/social/resolve": {
        get: {
          tags: ["Launches"],
          summary: "Turn a Weibo, Bilibili, WeChat or Xiaohongshu link into the account id the vault stores",
          description:
            "Weibo and Bilibili accounts are stored by numeric UID, WeChat Official Accounts by their gh_ id and Xiaohongshu accounts by their 24-character user id. Accepts a UID, a profile or space link, a Weibo custom domain, any WeChat article link, or a Xiaohongshu profile link, note link or share text, and returns the account id with the display name when the platform shares it. Other platforms return the canonical handle. Rate limited.",
          parameters: [
            { name: "platform", in: "query", required: true, schema: { type: "string" } },
            { name: "input", in: "query", required: true, schema: { type: "string" } },
          ],
          responses: {
            "200": { description: "platform, account and name (null when unknown)" },
            "400": { description: "Unknown platform or unreadable input" },
            "429": { description: "Too many lookups" },
            "503": { description: "The platform did not answer" },
          },
        },
      },
      "/social/attest": {
        post: {
          tags: ["Launches"],
          summary: "Verify a public ownership proof and sign a wallet binding",
          description:
            "Body: { platform, account, wallet, proofUrl, secret }. The proof must be a public post by the account containing the challenge code for this wallet (fortune- followed by 24 hex characters, derived from the chain, vault, account, wallet and the account's nonce). Farcaster needs no post: the wallet must be a verified address of the account. A private claim link (platform link) needs no post either: send the link's secret, whose keccak256 is the account; a link binds once, so this returns 409 once any wallet is bound or pending. Returns an EIP-712 Binding signature that only `wallet` can submit to FortuneSocialFeeVault.bind within 30 minutes; the binding then takes effect after 1 hour (3 days to change an existing wallet). Rate limited.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["platform", "account", "wallet"],
                  properties: {
                    platform: { type: "string" },
                    account: { type: "string" },
                    wallet: { type: "string" },
                    proofUrl: { type: "string" },
                    secret: { type: "string", description: "Private claim links only: the 43-character secret after #claim= in the link" },
                  },
                },
              },
            },
          },
          responses: {
            "200": { description: "identityId, stableId, nonce, deadline, signature and the evidence that was checked" },
            "400": { description: "Invalid platform, handle, wallet or missing proof link" },
            "409": { description: "Already bound or pending for this wallet, the handle now belongs to a different account, or the claim link was already used (details.reason LINK_USED)" },
            "422": { description: "The proof failed: wrong author, code missing, post not found or wallet not verified (details.reason, details.code)" },
            "429": { description: "Too many attempts" },
            "503": { description: "Verification not configured, paused, or the platform did not answer" },
          },
        },
      },
      "/portfolio/{address}": {
        get: {
          tags: ["Markets"],
          summary: "Every Fortune launch a wallet holds, valued at live prices",
          description:
            "Balances are read for the whole factory catalog at one block. Positions are valued at the live curve price, or the liquidity-weighted official pool price after graduation; valueUsd is not a sale quote. At most 100 positions are detailed; held counts all of them.",
          parameters: [{ name: "address", in: "path", required: true, schema: { type: "string" } }],
          responses: {
            "200": { description: "Positions sorted by value, with totalValueUsd, held, created and the snapshot block" },
            "400": { description: "Not an address" },
          },
        },
      },
      "/creators/{address}": {
        get: {
          tags: ["Launches"],
          summary: "A creator's launch history: phase counts and priced launches",
          description:
            "phases counts every launch the address created (on the curve, ready to graduate, graduated, rescued). items is one page of priced launches, newest first, with creatorShare: the share of supply the creator wallet holds now.",
          parameters: [
            { name: "address", in: "path", required: true, schema: { type: "string" } },
            { name: "cursor", in: "query", schema: { type: "string" } },
            { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 25 } },
          ],
          responses: {
            "200": { description: "Creator record with page.nextCursor pinned to the first page's block" },
            "400": { description: "Not an address, or an invalid cursor" },
          },
        },
      },
      "/launches/preview": {
        post: {
          tags: ["Launches"],
          summary:
            "Validate a launch configuration before any transaction is built",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: [
                    "name",
                    "symbol",
                    "quoteAssets",
                    "primaryQuote",
                    "feeBps",
                  ],
                  properties: {
                    name: { type: "string" },
                    symbol: { type: "string", maxLength: 16 },
                    totalSupply: {
                      oneOf: [{ type: "string" }, { type: "number" }],
                    },
                    quoteAssets: {
                      type: "array",
                      minItems: 1,
                      maxItems: 5,
                      items: {
                        type: "object",
                        properties: {
                          id: { type: "string" },
                          address: { type: "string" },
                          weightBps: { type: "integer" },
                        },
                      },
                    },
                    primaryQuote: { type: "string" },
                    graduationMode: {
                      type: "string",
                      enum: ["fixed", "demand-weighted"],
                    },
                    launchEngine: {
                      type: "string",
                      enum: ["basket", "stock-floor", "preipo-perp"],
                    },
                    metadataEditable: { type: "boolean" },
                    rewardAsset: { type: ["string", "null"] },
                    feeBps: {
                      type: "object",
                      properties: {
                        creator: { type: "integer" },
                        holders: { type: "integer" },
                        buyback: { type: "integer" },
                        liquidity: { type: "integer" },
                        treasury: { type: "integer" },
                        protocol: { type: "integer" },
                      },
                    },
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description:
                "Normalized preview with checks, errors and immutable protocol terms",
            },
            "400": { description: "Malformed JSON" },
          },
        },
      },
      "/transactions/{hash}": {
        get: {
          tags: ["Protocol"],
          summary: "Resolve an uncertain transaction from BSC RPC before retrying",
          parameters: [
            {
              name: "hash",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
          ],
          responses: {
            "200": { description: "Transaction state" },
            "400": { description: "Malformed transaction hash" },
            "503": { description: "RPC unavailable or not configured" },
          },
        },
      },
      "/stats": {
        get: {
          tags: ["Analytics"],
          summary: "Aggregate protocol statistics",
          responses: { "200": { description: "Stats" } },
        },
      },
      "/automations": {
        get: {
          tags: ["Analytics"],
          summary: "Automation health and execution model",
          responses: { "200": { description: "Automation state" } },
        },
      },
      "/revenue": {
        get: {
          tags: ["Analytics"],
          summary: "Protocol revenue and fee-routing aggregates",
          responses: { "200": { description: "Revenue" } },
        },
      },
    },
    components: {
      schemas: {
        ErrorEnvelope: {
          type: "object",
          properties: {
            error: {
              type: "object",
              required: ["code", "message"],
              properties: {
                code: {
                  type: "string",
                  enum: [
                    "invalid_request",
                    "forbidden",
                    "not_found",
                    "conflict",
                    "rate_limited",
                    "dependency_unavailable",
                    "protocol_not_configured",
                    "preflight_failed",
                    "internal",
                  ],
                },
                message: { type: "string" },
                details: { type: "object" },
              },
            },
          },
        },
      },
    },
  };

  return NextResponse.json(document, {
    headers: {
      "Cache-Control":
        "public, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
