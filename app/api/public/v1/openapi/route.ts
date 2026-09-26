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
