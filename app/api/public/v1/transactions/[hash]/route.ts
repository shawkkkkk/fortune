import { apiError, apiOk } from "@/lib/public-api";

export const dynamic = "force-dynamic";

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

  const body = await response.json();

  if (body?.error) {
    throw new Error(
      String(body.error?.message || "RPC_ERROR")
    );
  }

  return body?.result ?? null;
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ hash: string }> }
) {
  const { hash } = await context.params;

  if (!/^0x[a-fA-F0-9]{64}$/.test(hash)) {
    return apiError(
      "invalid_request",
      "Transaction hash must be a 32-byte 0x-prefixed hash.",
      400
    );
  }

  const chainId = Number(
    process.env.NEXT_PUBLIC_CHAIN_ID || 97
  );

  const rpcUrl =
    chainId === 56
      ? process.env.BSC_RPC_URL
      : process.env.BSC_TESTNET_RPC_URL;

  if (!rpcUrl) {
    return apiError(
      "protocol_not_configured",
      "No server-side BSC RPC is configured for transaction recovery.",
      503,
      { chainId }
    );
  }

  try {
    const [receipt, transaction] =
      await Promise.all([
        rpc(
          rpcUrl,
          "eth_getTransactionReceipt",
          [hash]
        ),
        rpc(
          rpcUrl,
          "eth_getTransactionByHash",
          [hash]
        ),
      ]);

    if (!receipt && !transaction) {
      return apiOk(
        {
          hash,
          chainId,
          state: "not_found",
          safeToBlindlyResubmit: false,
          guidance:
            "Do not automatically resubmit. Confirm the sending account nonce and RPC propagation state first.",
        },
        {
          meta: {
            authoritativeSource: "BSC RPC",
          },
        }
      );
    }

    if (!receipt) {
      return apiOk(
        {
          hash,
          chainId,
          state: "pending",
          from: transaction?.from || null,
          to: transaction?.to || null,
          nonce: transaction?.nonce || null,
          safeToBlindlyResubmit: false,
        },
        {
          meta: {
            authoritativeSource: "BSC RPC",
          },
        }
      );
    }

    const success =
      receipt.status === "0x1";

    return apiOk(
      {
        hash,
        chainId,
        state: success
          ? "confirmed"
          : "reverted",
        success,
        blockNumber: receipt.blockNumber,
        transactionIndex:
          receipt.transactionIndex,
        from: receipt.from,
        to: receipt.to,
        contractAddress:
          receipt.contractAddress || null,
        gasUsed: receipt.gasUsed,
        logsCount: Array.isArray(receipt.logs)
          ? receipt.logs.length
          : null,
        safeToBlindlyResubmit: false,
      },
      {
        meta: {
          authoritativeSource: "BSC RPC",
        },
      }
    );
  } catch (error) {
    return apiError(
      "dependency_unavailable",
      "BSC RPC could not resolve the transaction right now.",
      503,
      {
        chainId,
        reason:
          error instanceof Error
            ? error.message
            : "RPC unavailable",
      }
    );
  }
}
