import { assets } from "@/data/assets";
import {
  apiError,
  apiOk,
  normalizeAddress,
} from "@/lib/public-api";

export const dynamic = "force-dynamic";

type RpcResponse = {
  result?: string | null;
  error?: { message?: string };
};

async function rpc(
  rpcUrl: string,
  method: string,
  params: unknown[]
) {
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method,
      params,
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("RPC_HTTP_" + response.status);
  }

  const body = (await response.json()) as RpcResponse;
  if (body.error) {
    throw new Error(body.error.message || "RPC_ERROR");
  }

  return body.result ?? null;
}

async function ethCall(
  rpcUrl: string,
  to: string,
  data: string
) {
  return rpc(
    rpcUrl,
    "eth_call",
    [{ to, data }, "latest"]
  );
}

function decodeUint(hex: string | null) {
  if (!hex || hex === "0x") return null;

  try {
    return BigInt(hex).toString();
  } catch {
    return null;
  }
}

function decodeString(hex: string | null) {
  if (!hex || hex === "0x") return null;
  const value = hex.startsWith("0x")
    ? hex.slice(2)
    : hex;

  try {
    // Some older ERC-20s return bytes32 instead of ABI dynamic strings.
    if (value.length === 64) {
      const bytes = Buffer.from(value, "hex");
      return bytes
        .toString("utf8")
        .replace(/\0+$/g, "")
        .trim() || null;
    }

    if (value.length < 128) return null;

    const offset =
      Number(BigInt("0x" + value.slice(0, 64))) * 2;
    if (
      !Number.isSafeInteger(offset) ||
      offset < 0 ||
      offset + 64 > value.length
    ) {
      return null;
    }

    const length = Number(
      BigInt("0x" + value.slice(offset, offset + 64))
    );

    if (
      !Number.isSafeInteger(length) ||
      length < 0
    ) {
      return null;
    }

    const start = offset + 64;
    const end = start + length * 2;
    if (end > value.length) return null;

    return Buffer.from(
      value.slice(start, end),
      "hex"
    ).toString("utf8");
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  let suppliedAddress: string | null = null;

  try {
    const body = await request.json();
    suppliedAddress =
      typeof body?.address === "string"
        ? body.address
        : null;
  } catch {
    return apiError(
      "invalid_request",
      "Request body must be valid JSON.",
      400
    );
  }

  const address = normalizeAddress(suppliedAddress);
  if (!address) {
    return apiError(
      "invalid_request",
      "Provide a valid 20-byte BSC token contract address.",
      400
    );
  }

  const rpcUrl = process.env.BSC_RPC_URL;
  if (!rpcUrl) {
    return apiError(
      "protocol_not_configured",
      "BSC_RPC_URL is required for custom-token compatibility checks.",
      503
    );
  }

  try {
    const [
      code,
      decimalsRaw,
      symbolRaw,
      nameRaw,
      supplyRaw,
    ] = await Promise.all([
      rpc(rpcUrl, "eth_getCode", [
        address,
        "latest",
      ]),
      ethCall(
        rpcUrl,
        address,
        "0x313ce567"
      ).catch(() => null),
      ethCall(
        rpcUrl,
        address,
        "0x95d89b41"
      ).catch(() => null),
      ethCall(
        rpcUrl,
        address,
        "0x06fdde03"
      ).catch(() => null),
      ethCall(
        rpcUrl,
        address,
        "0x18160ddd"
      ).catch(() => null),
    ]);

    const decimalsText =
      decodeUint(decimalsRaw);
    const decimals =
      decimalsText == null
        ? null
        : Number(decimalsText);

    const symbol = decodeString(symbolRaw);
    const name = decodeString(nameRaw);
    const totalSupplyRaw =
      decodeUint(supplyRaw);

    const hasCode =
      Boolean(code) &&
      code !== "0x" &&
      code !== "0x0";

    const registryAsset = assets.find(
      (asset) =>
        asset.address?.toLowerCase() ===
        address.toLowerCase()
    );

    const reasonCodes: string[] = [];
    if (!hasCode) {
      reasonCodes.push("NO_CONTRACT_CODE");
    }
    if (
      decimals == null ||
      !Number.isInteger(decimals) ||
      decimals < 0 ||
      decimals > 36
    ) {
      reasonCodes.push("UNSUPPORTED_DECIMALS");
    }
    if (!symbol) {
      reasonCodes.push("SYMBOL_UNREADABLE");
    }
    if (!totalSupplyRaw) {
      reasonCodes.push("SUPPLY_UNREADABLE");
    }

    const staticErc20Compatible =
      reasonCodes.length === 0;

    const fortuneApproved =
      Boolean(registryAsset) &&
      registryAsset!.chain === "BSC" &&
      registryAsset!.verification !==
        "Unavailable";

    const quoteEnabled =
      fortuneApproved &&
      registryAsset!.capabilities.includes(
        "quote"
      );

    const graduationEnabled =
      fortuneApproved &&
      registryAsset!.capabilities.includes(
        "graduation"
      );

    return apiOk({
      chainId: 56,
      address,
      metadata: {
        name,
        symbol,
        decimals,
        totalSupplyRaw,
      },
      staticChecks: {
        hasCode,
        staticErc20Compatible,
        reasonCodes,
      },
      fortuneRegistry: registryAsset
        ? {
            id: registryAsset.id,
            verification:
              registryAsset.verification,
            category: registryAsset.category,
            capabilities:
              registryAsset.capabilities,
          }
        : null,
      launchability: {
        fortuneApproved,
        quoteEnabled,
        graduationEnabled,
        launchableNow:
          staticErc20Compatible &&
          quoteEnabled &&
          graduationEnabled,
      },
      runtimeChecksStillRequired: [
        "exact transfer-in / transfer-out accounting",
        "fee-on-transfer behavior",
        "rebasing or share-accounting behavior",
        "blacklist / pause / transfer restrictions",
        "oracle availability and freshness",
        "minimum external liquidity",
        "graduation-adapter pool compatibility",
      ],
      policy:
        "Passing metadata/code checks does not automatically approve a custom token. Fortune Registry approval is required before it can hold user launch reserves.",
    });
  } catch (error) {
    return apiError(
      "dependency_unavailable",
      "BSC RPC could not inspect this token right now.",
      503,
      {
        reason:
          error instanceof Error
            ? error.message
            : "RPC unavailable",
      }
    );
  }
}
