import { apiError, apiOk } from "@/lib/public-api";
import { configuredRpcUrls, rpcCall } from "@/lib/bsc-rpc";

export const dynamic = "force-dynamic";

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

  const rpcUrls = configuredRpcUrls(chainId);

  if (!rpcUrls.length) {
    return apiError(
      "protocol_not_configured",
      "No server-side BSC RPC is configured for transaction recovery.",
      503,
      { chainId }
    );
  }

  try {
    const [receiptResponse, transactionResponse] =
      await Promise.all([
        rpcCall(
          chainId,
          "eth_getTransactionReceipt",
          [hash]
        ),
        rpcCall(
          chainId,
          "eth_getTransactionByHash",
          [hash]
        ),
      ]);

    const receipt = receiptResponse.result;
    const transaction = transactionResponse.result;
    const providerIndex = Math.min(
      receiptResponse.providerIndex,
      transactionResponse.providerIndex
    );

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
            authoritativeSource: "BSC RPC failover",
            providerIndex,
            configuredProviders: rpcUrls.length,
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
            authoritativeSource: "BSC RPC failover",
            providerIndex,
            configuredProviders: rpcUrls.length,
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
