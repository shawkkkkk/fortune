import { createHash } from "node:crypto";

import { assets } from "@/data/assets";
import { apiError, apiOk } from "@/lib/public-api";

type PreviewAsset = {
  id?: string;
  address?: string;
  weightBps?: number;
};

type PreviewBody = {
  name?: string;
  symbol?: string;
  totalSupply?: string | number;
  quoteAssets?: PreviewAsset[];
  primaryQuote?: string;
  graduationMode?: "fixed" | "demand-weighted";
  feeBps?: {
    creator?: number;
    holders?: number;
    buyback?: number;
    liquidity?: number;
    treasury?: number;
    protocol?: number;
  };
  rewardAsset?: string | null;
  metadataEditable?: boolean;
  launchEngine?:
    | "basket"
    | "stock-floor"
    | "preipo-perp";
};

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return "[" + value.map(stableJson).join(",") + "]";
  }

  if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    return (
      "{" +
      Object.keys(object)
        .sort()
        .map(
          (key) =>
            JSON.stringify(key) +
            ":" +
            stableJson(object[key])
        )
        .join(",") +
      "}"
    );
  }

  return JSON.stringify(value);
}

export async function POST(request: Request) {
  let body: PreviewBody;

  try {
    body = (await request.json()) as PreviewBody;
  } catch {
    return apiError(
      "invalid_request",
      "Request body must be valid JSON.",
      400
    );
  }

  const errors: Array<{
    code: string;
    field: string;
    message: string;
  }> = [];
  const warnings: Array<{
    code: string;
    message: string;
  }> = [];

  const name = String(body.name || "").trim();
  const symbol = String(body.symbol || "")
    .trim()
    .toUpperCase();
  const quoteAssets = Array.isArray(body.quoteAssets)
    ? body.quoteAssets
    : [];

  if (!name) {
    errors.push({
      code: "NAME_REQUIRED",
      field: "name",
      message: "Token name is required.",
    });
  }

  if (!symbol || symbol.length > 16) {
    errors.push({
      code: "BAD_SYMBOL",
      field: "symbol",
      message:
        "Symbol is required and must be 16 characters or fewer.",
    });
  }

  if (
    quoteAssets.length < 1 ||
    quoteAssets.length > 5
  ) {
    errors.push({
      code: "BAD_QUOTE_COUNT",
      field: "quoteAssets",
      message:
        "Fortune launches require 1–5 quote assets.",
    });
  }

  const resolved = quoteAssets.map((requested, index) => {
    const match = assets.find((asset) => {
      if (
        requested.id &&
        asset.id === requested.id
      ) {
        return true;
      }

      if (
        requested.address &&
        asset.address?.toLowerCase() ===
          requested.address.toLowerCase()
      ) {
        return true;
      }

      return false;
    });

    if (!match) {
      errors.push({
        code: "UNKNOWN_ASSET",
        field: `quoteAssets[${index}]`,
        message:
          "Asset is not resolved in the Fortune Registry seed catalog.",
      });

      return {
        requested,
        resolved: null,
        ready: false,
        reasonCodes: ["UNKNOWN_ASSET"],
      };
    }

    const reasonCodes: string[] = [];

    if (match.chain !== "BSC") {
      reasonCodes.push("WRONG_CHAIN");
    }
    if (!match.address) {
      reasonCodes.push("NO_VERIFIED_BSC_ADDRESS");
    }
    if (!match.capabilities.includes("quote")) {
      reasonCodes.push("QUOTE_CAPABILITY_DISABLED");
    }
    if (
      !match.capabilities.includes("graduation")
    ) {
      reasonCodes.push(
        "GRADUATION_CAPABILITY_DISABLED"
      );
    }

    if (reasonCodes.length) {
      errors.push({
        code: "ASSET_NOT_LAUNCHABLE",
        field: `quoteAssets[${index}]`,
        message:
          match.symbol +
          " is not currently ready as a Fortune quote asset: " +
          reasonCodes.join(", "),
      });
    }

    return {
      requested,
      resolved: {
        id: match.id,
        symbol: match.symbol,
        address: match.address || null,
        category: match.category,
        verification: match.verification,
      },
      ready: reasonCodes.length === 0,
      reasonCodes,
    };
  });

  const weights = quoteAssets.map(
    (asset) => Number(asset.weightBps || 0)
  );
  const weightSum = weights.reduce(
    (sum, value) => sum + value,
    0
  );

  if (weightSum !== 10_000) {
    errors.push({
      code: "BAD_WEIGHTS",
      field: "quoteAssets",
      message:
        "Quote-asset weights must total exactly 10,000 bps.",
    });
  }

  const primary = body.primaryQuote || "";
  const primaryFound = resolved.some(
    (entry) =>
      entry.resolved?.id === primary ||
      entry.resolved?.address?.toLowerCase() ===
        primary.toLowerCase()
  );

  if (!primaryFound) {
    errors.push({
      code: "PRIMARY_NOT_IN_BASKET",
      field: "primaryQuote",
      message:
        "Primary quote must be one of the selected assets.",
    });
  }

  const fees = body.feeBps || {};
  const feeRoutes = [
    fees.creator || 0,
    fees.holders || 0,
    fees.buyback || 0,
    fees.liquidity || 0,
    fees.treasury || 0,
    fees.protocol || 0,
  ];
  const totalFeeBps = feeRoutes.reduce(
    (sum, value) => sum + Number(value),
    0
  );

  if (
    totalFeeBps <= 0 ||
    totalFeeBps > 500
  ) {
    errors.push({
      code: "BAD_TOTAL_FEE",
      field: "feeBps",
      message:
        "Normal Fortune trading fees must be >0 and <=500 bps total.",
    });
  }

  if (body.rewardAsset) {
    const reward = assets.find(
      (asset) =>
        asset.id === body.rewardAsset ||
        asset.address?.toLowerCase() ===
          body.rewardAsset?.toLowerCase()
    );

    if (
      !reward ||
      !reward.capabilities.includes("reward")
    ) {
      errors.push({
        code: "BAD_REWARD_ASSET",
        field: "rewardAsset",
        message:
          "Reward asset must have Fortune reward capability.",
      });
    }
  }

  if (
    body.launchEngine === "stock-floor" &&
    quoteAssets.length !== 1
  ) {
    errors.push({
      code: "STOCK_FLOOR_SINGLE_ASSET",
      field: "quoteAssets",
      message:
        "Stock Floor launches use exactly one approved stock-token reserve.",
    });
  }

  if (body.launchEngine === "preipo-perp") {
    warnings.push({
      code: "EXPERIMENTAL_PERP_REFERENCE",
      message:
        "Pre-IPO Perp launches require an approved external reference oracle and settlement adapter; a perp is not a BEP-20 reserve token.",
    });
  }

  const canonicalInput = {
    ...body,
    name,
    symbol,
    quoteAssets,
  };

  const previewId =
    "fp_" +
    createHash("sha256")
      .update(stableJson(canonicalInput))
      .digest("hex")
      .slice(0, 32);

  const factory =
    process.env.NEXT_PUBLIC_FORTUNE_FACTORY_ADDRESS || null;

  return apiOk(
    {
      previewId,
      valid: errors.length === 0,
      errors,
      warnings,
      normalized: {
        name,
        symbol,
        totalSupply:
          body.totalSupply == null
            ? null
            : String(body.totalSupply),
        quoteAssets: resolved,
        weightSumBps: weightSum,
        primaryQuote: primary || null,
        graduationMode:
          body.graduationMode || "demand-weighted",
        totalFeeBps,
        metadataEditable:
          body.metadataEditable !== false,
        launchEngine:
          body.launchEngine || "basket",
      },
      immutableProtocolTerms: {
        tokenAddressSuffix: "fe",
        postLaunchMint: false,
        launchShield: {
          openingBuyTaxBps: 9900,
          taxDurationSeconds: 5,
          walletCapBps: 200,
          walletCapDurationSeconds: 15,
          creatorExemptions: false,
        },
        graduation: {
          preflightRequired: true,
          atomic: true,
          retryable: true,
          chartPriceAnchor: true,
        },
      },
      prepare: {
        factoryConfigured: Boolean(factory),
        factoryAddress: factory,
        ready:
          errors.length === 0 &&
          Boolean(factory),
        reason:
          !factory
            ? "Fortune testnet factory is not configured on this deployment."
            : errors.length
              ? "Resolve preview errors before preparing a transaction."
              : null,
      },
    },
    {
      meta: {
        expiresInSeconds: 60,
        note:
          "previewId is an API configuration fingerprint, not the onchain Launch Manifest hash. The final manifest is produced by FortuneFactory.",
      },
    }
  );
}
