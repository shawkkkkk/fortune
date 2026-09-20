export type RpcCallOptions = {
  timeoutMs?: number;
};

function unique(values: Array<string | undefined>) {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

export function configuredRpcUrls(chainId: number) {
  const listValue =
    chainId === 56
      ? process.env.BSC_RPC_URLS
      : process.env.BSC_TESTNET_RPC_URLS;

  const singleValue =
    chainId === 56
      ? process.env.BSC_RPC_URL
      : process.env.BSC_TESTNET_RPC_URL;

  return unique([
    ...(listValue || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
    singleValue?.trim(),
  ]);
}

async function rpcCallUrl(
  rpcUrl: string,
  method: string,
  params: unknown[],
  timeoutMs: number
) {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    timeoutMs
  );

  try {
    const response = await fetch(rpcUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method,
        params,
      }),
      signal: controller.signal,
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(
        "RPC_HTTP_" + response.status
      );
    }

    const body = await response.json();

    if (body?.error) {
      throw new Error(
        String(
          body.error?.message || "RPC_ERROR"
        )
      );
    }

    return body?.result ?? null;
  } finally {
    clearTimeout(timer);
  }
}

export async function rpcCall(
  chainId: number,
  method: string,
  params: unknown[],
  options?: RpcCallOptions
) {
  const urls = configuredRpcUrls(chainId);

  if (!urls.length) {
    throw new Error("RPC_NOT_CONFIGURED");
  }

  const timeoutMs = options?.timeoutMs ?? 3000;
  const failures: string[] = [];

  for (let i = 0; i < urls.length; i += 1) {
    try {
      const result = await rpcCallUrl(
        urls[i],
        method,
        params,
        timeoutMs
      );

      return {
        result,
        providerIndex: i,
        providerCount: urls.length,
      };
    } catch (error) {
      failures.push(
        error instanceof Error
          ? error.message
          : "RPC_FAILURE"
      );
    }
  }

  throw new Error(
    "ALL_RPC_PROVIDERS_FAILED:" +
      failures.join("|")
  );
}

export async function probeRpcEndpoints(
  chainId: number,
  timeoutMs = 2000
) {
  const urls = configuredRpcUrls(chainId);

  const probes = await Promise.all(
    urls.map(async (url, index) => {
      try {
        const result = await rpcCallUrl(
          url,
          "eth_chainId",
          [],
          timeoutMs
        );

        const observedChainId =
          typeof result === "string"
            ? Number.parseInt(result, 16)
            : null;

        return {
          index,
          ok: observedChainId === chainId,
          observedChainId,
        };
      } catch {
        return {
          index,
          ok: false,
          observedChainId: null,
        };
      }
    })
  );

  return {
    configured: urls.length,
    healthy: probes.filter((probe) => probe.ok)
      .length,
    probes,
  };
}
