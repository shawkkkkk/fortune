import { createPublicClient, fallback, http, parseAbi, type Address } from "viem";
import { configuredRpcUrls } from "@/lib/bsc-rpc";
import { FORTUNE_NETWORK } from "@/lib/fortune-network";
import { readFortuneAssetUniverse } from "@/lib/onchain-assets";
import { pairEligibility } from "@/lib/pair-policy";
import { readLimitedBytes } from "@/lib/creator-metadata";
import { apiError, apiOk, normalizeAddress } from "@/lib/public-api";

export const dynamic = "force-dynamic";
const tokenAbi = parseAbi(["function name() view returns (string)", "function symbol() view returns (string)", "function decimals() view returns (uint8)", "function totalSupply() view returns (uint256)"]);

export async function POST(request: Request) {
  let address: Address;
  try {
    const body = JSON.parse(new TextDecoder().decode(await readLimitedBytes(request, 2048)));
    const clean = normalizeAddress(typeof body.address === "string" ? body.address : null);
    if (!clean || /^0x0{40}$/i.test(clean)) throw new Error("address");
    address = clean as Address;
  } catch { return apiError("invalid_request", "Provide a valid token address on the active BNB network.", 400); }
  try {
    const universe = await readFortuneAssetUniverse();
    if (!universe.configured || !universe.blockNumber) return apiError("protocol_not_configured", "The active onchain registry is not configured.", 503);
    const urls = configuredRpcUrls(FORTUNE_NETWORK.chainId);
    const rpc = createPublicClient({ transport: fallback((urls.length ? urls : [FORTUNE_NETWORK.publicRpcUrl]).map((url) => http(url, { timeout: 5000, retryCount: 0 }))) });
    if (await rpc.getChainId() !== universe.chainId) throw new Error("chain mismatch");
    const blockNumber = BigInt(universe.blockNumber);
    const [code, name, symbol, decimals, supply] = await Promise.all([
      rpc.getCode({ address, blockNumber }),
      rpc.readContract({ address, abi: tokenAbi, functionName: "name", blockNumber }).catch(() => null),
      rpc.readContract({ address, abi: tokenAbi, functionName: "symbol", blockNumber }).catch(() => null),
      rpc.readContract({ address, abi: tokenAbi, functionName: "decimals", blockNumber }).catch(() => null),
      rpc.readContract({ address, abi: tokenAbi, functionName: "totalSupply", blockNumber }).catch(() => null),
    ]);
    if ((await rpc.getBlock({ blockNumber })).hash !== universe.blockHash) throw new Error("snapshot changed");
    const asset = universe.assets.find((item) => item.address.toLowerCase() === address.toLowerCase());
    const hasCode = Boolean(code && code !== "0x");
    const reasons = pairEligibility(asset, universe.chainId).reasons;
    if (!hasCode) reasons.push("NO_CONTRACT_CODE");
    if (decimals == null || decimals > 36) reasons.push("UNSUPPORTED_DECIMALS");
    if (!symbol || symbol.length > 128) reasons.push("SYMBOL_UNREADABLE");
    if (supply == null) reasons.push("SUPPLY_UNREADABLE");
    return apiOk({
      chainId: universe.chainId, blockNumber: universe.blockNumber, blockHash: universe.blockHash, address,
      metadata: { name: name?.slice(0, 128) || null, symbol: symbol?.slice(0, 128) || null, decimals, totalSupplyRaw: supply?.toString() ?? null },
      fortuneRegistry: asset ? { category: asset.category, active: asset.active, healthy: asset.healthy } : null,
      launchability: { fortuneApproved: Boolean(asset?.active), quoteEnabled: Boolean(asset?.quoteEnabled), graduationEnabled: Boolean(asset?.graduationEnabled), launchableNow: reasons.length === 0, reasonCodes: reasons },
      policy: "Eligibility is from the active onchain registry and release asset policy, never the discovery catalog. This is not an audit; launch preflight and release readiness are still required.",
      runtimeChecksStillRequired: ["transfer taxes and rebasing", "blacklist and transfer restrictions", "oracle freshness", "graduation liquidity and compatibility", "current factory preflight and release readiness"],
    });
  } catch { return apiError("dependency_unavailable", "The active network could not verify this token. No pair has been approved.", 503); }
}
