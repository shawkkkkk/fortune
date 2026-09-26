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
            { name: "sort", in: "query", schema: { type: "string", enum: ["newest", "volume24h", "trending", "marketCap"] } },
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
            "200": { description: "Market detail; chart.ledger.coversRange is false when the log provider could not serve the whole range. supply splits totalSupply into curve, pools, creator, vaults, burned and holders, read at the same block." },
            "404": { description: "Not recorded by the configured Fortune factories" },
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
            "200": { description: "verdict (clear, caution, unsupported), findings, per-leg taxes and the block the simulation used" },
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
          responses: { "200": { description: "Factory, protocol fee, pause state and one page of launches" }, "503": { description: "The network could not be read" } },
        },
      },
      "/custom-pairs/{curve}": {
        get: {
          tags: ["Launches"],
          summary: "One custom-pair launch: curve state, fees, graduation or rescue",
          parameters: [{ name: "curve", in: "path", required: true, schema: { type: "string" } }],
          responses: { "200": { description: "Launch detail read at one block" }, "404": { description: "No custom-pair launch uses this curve" } },
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
