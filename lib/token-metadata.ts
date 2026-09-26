import { createPublicClient, fallback, http, parseAbi, type Address } from "viem";
import { FORTUNE_NETWORK } from "@/lib/fortune-network";
import { configuredRpcUrls } from "@/lib/bsc-rpc";
import { publicMetadataUrl } from "@/lib/creator-metadata";

const abi = parseAbi([
  "function metadataRegistry() view returns (address)",
  "function factory() view returns (address)",
  "function record(address token) view returns (address creator, bool editable, bool frozen, uint64 revision)",
  "function metadata(address token) view returns ((string displayName, string displaySymbol, string description, string imageURI, string website, string xProfile, string telegram, string github, string youtube, string debox))",
]);

export async function readTokenMetadata(factory: Address, token: Address, creator: Address, blockNumber: bigint, blockHash: string) {
  const urls = configuredRpcUrls(FORTUNE_NETWORK.chainId);
  const rpc = createPublicClient({ transport: fallback((urls.length ? urls : [FORTUNE_NETWORK.publicRpcUrl]).map((url) => http(url, { timeout: 8000, retryCount: 0 }))) });
  if (await rpc.getChainId() !== FORTUNE_NETWORK.chainId) throw new Error("Metadata RPC chain mismatch.");
  const registry = await rpc.readContract({ address: factory, abi, functionName: "metadataRegistry", blockNumber });
  const [boundFactory, record, metadata] = await Promise.all([
    rpc.readContract({ address: registry, abi, functionName: "factory", blockNumber }),
    rpc.readContract({ address: registry, abi, functionName: "record", args: [token], blockNumber }),
    rpc.readContract({ address: registry, abi, functionName: "metadata", args: [token], blockNumber }),
  ]);
  if (boundFactory.toLowerCase() !== factory.toLowerCase() || record[0].toLowerCase() !== creator.toLowerCase() ||
      (await rpc.getBlock({ blockNumber })).hash !== blockHash) throw new Error("Metadata provenance could not be verified.");
  const link = (key: string, value: string, ipfs = false) => { try { return publicMetadataUrl(key, value, ipfs); } catch { return ""; } };
  return {
    name: metadata.displayName, symbol: metadata.displaySymbol, description: metadata.description,
    image: link("Image", metadata.imageURI, true),
    external_url: link("Website", metadata.website),
    extensions: { twitter: link("X", metadata.xProfile), telegram: link("Telegram", metadata.telegram),
      github: link("GitHub", metadata.github), youtube: link("YouTube", metadata.youtube), debox: link("DeBox", metadata.debox) },
    provenance: { chainId: FORTUNE_NETWORK.chainId, token, factory, registry, creator, editable: record[1], frozen: record[2], revision: record[3].toString(), blockNumber: blockNumber.toString(), blockHash },
  };
}
