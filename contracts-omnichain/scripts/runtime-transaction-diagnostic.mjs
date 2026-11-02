// Test-fixture diagnostics only. No writes, retries, raw errors, addresses or calldata.
const LIMIT_MS = 3_000;
const quantity = value => typeof value === "string" && /^0x(?:0|[1-9a-f][0-9a-f]{0,63})$/.test(value) ? value : null;
const quantities = (value, fields) => {
  if (!value || typeof value !== "object") return { status: "invalid" };
  const result = {};
  for (const field of fields) {
    result[field] = quantity(value[field]);
    if (result[field] === null) return { status: "invalid" };
  }
  return { status: "observed", ...result };
};

export async function inspectLocalDeploymentFailure(rpc, hash, sender) {
  if (typeof hash !== "string" || !/^0x[0-9a-f]{64}$/i.test(hash)
    || typeof sender !== "string" || !/^0x[0-9a-f]{40}$/i.test(sender)) throw Error("Invalid local diagnostic binding");
  const transaction = value => {
    if (value === null) return { status: "not-found" };
    if (!value || typeof value.hash !== "string" || value.hash.toLowerCase() !== hash.toLowerCase()
      || typeof value.from !== "string" || value.from.toLowerCase() !== sender.toLowerCase() || value.to !== null) return { status: "invalid" };
    const result = quantities(value, ["nonce", "gas"]);
    if (result.status !== "observed") return result;
    for (const field of ["gasPrice", "maxFeePerGas", "maxPriorityFeePerGas"]) {
      if (value[field] === undefined || value[field] === null) result[field] = null;
      else if ((result[field] = quantity(value[field])) === null) return { status: "invalid" };
    }
    if (value.blockNumber !== null && quantity(value.blockNumber) === null) return { status: "invalid" };
    return { ...result, status: value.blockNumber === null ? "pending" : "mined", blockNumber: value.blockNumber };
  };
  const block = value => {
    const result = quantities(value, ["number", "gasLimit", "timestamp"]);
    if (result.status !== "observed") return result;
    if (value.baseFeePerGas === undefined || value.baseFeePerGas === null) return { ...result, baseFeePerGas: null };
    const baseFeePerGas = quantity(value.baseFeePerGas);
    return baseFeePerGas === null ? { status: "invalid" } : { ...result, baseFeePerGas };
  };
  const nonce = value => quantity(value) === null ? { status: "invalid" } : { status: "observed", value };
  const reads = [
    ["transaction", "eth_getTransactionByHash", [hash], transaction],
    ["latestBlock", "eth_getBlockByNumber", ["latest", false], block],
    ["latestNonce", "eth_getTransactionCount", [sender, "latest"], nonce],
    ["pendingNonce", "eth_getTransactionCount", [sender, "pending"], nonce],
    ["transactionPool", "txpool_status", [], value => quantities(value, ["pending", "queued"])],
  ];
  let ended = false, timer;
  const result = Object.fromEntries(reads.map(([key]) => [key, { status: "deadline" }]));
  try {
    await Promise.race([
      Promise.all(reads.map(async ([key, method, params, project]) => {
        try {
          if (ended) return;
          const value = await rpc.request({ method, params }, { retryCount: 0 });
          if (!ended) result[key] = project(value);
        } catch { if (!ended) result[key] = { status: "unavailable" }; }
      })),
      new Promise(resolve => { timer = setTimeout(resolve, LIMIT_MS); }),
    ]);
  } finally { ended = true; clearTimeout(timer); }
  return { schemaVersion: 1, scope: "local-fixture-deployment-failure", ...result,
    nonAtomicObservations: true, failureCauseEstablished: false, publicBroadcasts: false };
}
