import { encodeAbiParameters, keccak256, pad, parseAbi, parseAbiParameters, toHex, type Address, type Hex, type PublicClient } from "viem";

// Interfaces/config layouts from the isolated lockfile's protocol-v2 3.0.168 and
// messagelib-v2 3.0.168. EIDs are reviewed inputs, never derived from chain IDs.
export const ROUTE_ABI = parseAbi([
  "function deploymentChainId() view returns(uint256)", "function globalSupplyCap() view returns(uint256)",
  "function initialAllocation() view returns(uint256)", "function launchManifestHash() view returns(bytes32)",
  "function endpoint() view returns(address)", "function owner() view returns(address)",
  "function decimals() view returns(uint8)", "function sharedDecimals() view returns(uint8)",
  "function decimalConversionRate() view returns(uint256)", "function bridgeEnabled() view returns(bool)",
  "function peerCount() view returns(uint256)", "function peers(uint32) view returns(bytes32)",
  "function totalSupply() view returns(uint256)", "function permanentlyBurned() view returns(uint256)",
  "function eid() view returns(uint32)", "function delegates(address) view returns(address)",
  "function getSendLibrary(address,uint32) view returns(address)",
  "function isRegisteredLibrary(address) view returns(bool)", "function isSupportedEid(uint32) view returns(bool)",
  "function isDefaultSendLibrary(address,uint32) view returns(bool)",
  "function getReceiveLibrary(address,uint32) view returns(address,bool)",
  "function receiveLibraryTimeout(address,uint32) view returns(address,uint256)",
  "function getConfig(address,address,uint32,uint32) view returns(bytes)",
  "function getAppUlnConfig(address,uint32) view returns((uint64 confirmations,uint8 requiredDVNCount,uint8 optionalDVNCount,uint8 optionalDVNThreshold,address[] requiredDVNs,address[] optionalDVNs))",
  "function executorConfigs(address,uint32) view returns(uint32,address)",
]);
export const ULN_PARAMETERS = parseAbiParameters("(uint64 confirmations,uint8 requiredDVNCount,uint8 optionalDVNCount,uint8 optionalDVNThreshold,address[] requiredDVNs,address[] optionalDVNs)");
export const EXECUTOR_PARAMETERS = parseAbiParameters("(uint32 maxMessageSize,address executor)");
type Pin = { address: Address; codeHash: Hex };
type Uln = { confirmations: string; required: Pin[]; optional: Pin[]; threshold: number };
type Side = { chainId: 97 | 84532 | 11155111; eid: number; token: Pin; endpoint: Pin; sendLibrary: Pin; receiveLibrary: Pin;
  owner: Address; delegate: Address; initialAllocation: string; executor: Pin; maxMessageSize: number; send: Uln; receive: Uln };
export type OmnichainRoutePolicy = { manifestHash: Hex; globalSupplyCap: string; networks: [Side, Side] };
const ZERO = "0x0000000000000000000000000000000000000000";
const address = (x: unknown): x is Address => typeof x === "string" && /^0x[0-9a-fA-F]{40}$/.test(x) && x.toLowerCase() !== ZERO;
const hash = (x: unknown): x is Hex => typeof x === "string" && /^0x[0-9a-fA-F]{64}$/.test(x) && !/^0x0{64}$/i.test(x);
const same = (a: unknown, b: string) => typeof a === "string" && a.toLowerCase() === b.toLowerCase();
function integer(x: unknown, bits: number) {
  if (typeof x !== "string" || !/^(0|[1-9][0-9]{0,77})$/.test(x) || BigInt(x) >= 1n << BigInt(bits)) throw Error("Invalid route integer");
  return BigInt(x);
}
function pin(p: Pin) { if (!p || !address(p.address) || !hash(p.codeHash)) throw Error("Reviewed runtime pin required"); }
export function encodeRouteUln(u: Uln, raw = false) {
  const confirmations = integer(u.confirmations, 64);
  if (!confirmations || confirmations === (1n << 64n) - 1n || !Array.isArray(u.required) || !Array.isArray(u.optional)
    || u.required.length < 1 || u.required.length > 8 || u.optional.length > 8 || !Number.isInteger(u.threshold)
    || (u.optional.length === 0 ? u.threshold !== 0 : u.threshold < 1 || u.threshold > u.optional.length)) throw Error("Explicit bounded ULN policy required");
  for (const list of [u.required, u.optional]) {
    list.forEach(pin);
    if (list.some((v, i) => i > 0 && v.address.toLowerCase() <= list[i - 1].address.toLowerCase())) throw Error("DVNs must be unique and sorted");
  }
  // Reject overlap for this first policy subset, even though upstream permits it.
  if (new Set([...u.required, ...u.optional].map(p => p.address.toLowerCase())).size !== u.required.length + u.optional.length) throw Error("Overlapping DVN policy unsupported");
  return encodeAbiParameters(ULN_PARAMETERS, [{ confirmations, requiredDVNCount: u.required.length,
    optionalDVNCount: raw && u.optional.length === 0 ? 255 : u.optional.length, optionalDVNThreshold: u.threshold,
    requiredDVNs: u.required.map(p => p.address), optionalDVNs: u.optional.map(p => p.address) }]);
}
function validate(p: OmnichainRoutePolicy) {
  if (!p || !hash(p.manifestHash) || !Array.isArray(p.networks) || p.networks.length !== 2) throw Error("Two-network manifest required");
  const cap = integer(p.globalSupplyCap, 256), rate = 10n ** 12n;
  if (!cap || cap % rate || cap / rate >= 1n << 64n) throw Error("Shared-decimal cap required");
  for (const n of p.networks) {
    if (!n || ![97, 84532, 11155111].includes(n.chainId) || !Number.isInteger(n.eid) || n.eid <= 0 || n.eid >= 2 ** 32
      || !address(n.owner) || !address(n.delegate) || !Number.isInteger(n.maxMessageSize) || n.maxMessageSize < 40 || n.maxMessageSize >= 2 ** 32
      || integer(n.initialAllocation, 256) > cap || BigInt(n.initialAllocation) % rate) throw Error("Reviewed testnet network required");
    const pins = [n.token, n.endpoint, n.sendLibrary, n.receiveLibrary, n.executor]; pins.forEach(pin);
    if (new Set(pins.map(p => p.address.toLowerCase())).size !== pins.length) throw Error("Distinct contract roles required");
    encodeRouteUln(n.send); encodeRouteUln(n.receive);
  }
  if (p.networks[0].chainId === p.networks[1].chainId || p.networks[0].eid === p.networks[1].eid
    || p.networks.reduce((s, n) => s + BigInt(n.initialAllocation), 0n) !== cap) throw Error("Unique networks and conserved genesis allocation required");
}

/** Trusted, point-in-time observation of a PAUSED two-network route. Never authorizes opening/sending. */
export async function inspectOmnichainRoute(clients: readonly [readonly [PublicClient, PublicClient], readonly [PublicClient, PublicClient]], policy: OmnichainRoutePolicy) {
  const p = structuredClone(policy); validate(p);
  if (!Array.isArray(clients) || clients.length !== 2 || clients.some(c => !Array.isArray(c) || c.length !== 2)
    || new Set(clients.flat()).size !== 4) throw Error("Four distinct read clients required");
  const started = Date.now(); let last = started, finished = false, timer: ReturnType<typeof setTimeout> | undefined;
  const time = () => { const now = Date.now(); if (finished || now < last || now - started > 30_000) throw Error("Route read expired or clock moved backward"); last = now; return now; };
  const action = async <T>(call: () => Promise<T>) => { time(); const value = await call(); time(); return value; };
  const observe = async (c: PublicClient, n: Side, remote: Side, height: bigint) => {
    const chain = () => action(() => c.getChainId());
    const block = () => action(() => c.getBlock({ blockNumber: height }));
    const read = (a: Address, f: string, args: readonly unknown[] = []) => action(() => c.readContract({ address: a, abi: ROUTE_ABI, functionName: f, args, blockNumber: height } as never)) as Promise<unknown>;
    if (await chain() !== n.chainId) throw Error("Route chain differs");
    const b = await block();
    if (b.number !== height || !hash(b.hash) || typeof b.timestamp !== "bigint" || b.timestamp < 0n
      || b.timestamp * 1000n > BigInt(time()) || BigInt(time()) - b.timestamp * 1000n > 120_000n) throw Error("Fresh confirmed block required");
    const pins = [n.token, n.endpoint, n.sendLibrary, n.receiveLibrary, n.executor, ...n.send.required, ...n.send.optional, ...n.receive.required, ...n.receive.optional];
    // Each occurrence must match its reviewed pin, including repeated DVN roles.
    for (const v of pins) {
      const code = await action(() => c.getCode({ address: v.address, blockNumber: height }));
      if (!code || !/^0x(?:[0-9a-fA-F]{2}){1,131072}$/.test(code) || !same(keccak256(code), v.codeHash)) throw Error("Route runtime differs");
    }
    const expected: [Address, string, readonly unknown[], unknown][] = [
      [n.token.address, "deploymentChainId", [], BigInt(n.chainId)], [n.token.address, "globalSupplyCap", [], BigInt(p.globalSupplyCap)],
      [n.token.address, "initialAllocation", [], BigInt(n.initialAllocation)], [n.token.address, "launchManifestHash", [], p.manifestHash],
      [n.token.address, "endpoint", [], n.endpoint.address], [n.token.address, "owner", [], n.owner],
      [n.token.address, "decimals", [], 18], [n.token.address, "sharedDecimals", [], 6], [n.token.address, "decimalConversionRate", [], 10n ** 12n],
      [n.token.address, "bridgeEnabled", [], false], [n.token.address, "peerCount", [], 1n], [n.token.address, "peers", [remote.eid], pad(remote.token.address)],
      [n.endpoint.address, "eid", [], n.eid], [n.endpoint.address, "delegates", [n.token.address], n.delegate],
      [n.endpoint.address, "getSendLibrary", [n.token.address, remote.eid], n.sendLibrary.address],
      [n.endpoint.address, "isDefaultSendLibrary", [n.token.address, remote.eid], false],
    ];
    for (const [a, f, args, want] of expected) { const got = await read(a, f, args); if (typeof want === "string" ? !same(got, want) : got !== want) throw Error("Route identity or authority differs"); }
    const receive = await read(n.endpoint.address, "getReceiveLibrary", [n.token.address, remote.eid]);
    const timeout = await read(n.endpoint.address, "receiveLibraryTimeout", [n.token.address, remote.eid]);
    if (!Array.isArray(receive) || receive.length !== 2 || !same(receive[0], n.receiveLibrary.address) || receive[1] !== false
      || !Array.isArray(timeout) || timeout.length !== 2 || !same(timeout[0], ZERO) || timeout[1] !== 0n) throw Error("Explicit receive library without grace path required");
    for (const [library, uln] of [[n.sendLibrary, n.send], [n.receiveLibrary, n.receive]] as const) {
      if (await read(n.endpoint.address, "isRegisteredLibrary", [library.address]) !== true
        || await read(library.address, "isSupportedEid", [remote.eid]) !== true) throw Error("Route library unavailable");
      if (!same(await read(n.endpoint.address, "getConfig", [n.token.address, library.address, remote.eid, 2]), encodeRouteUln(uln))) throw Error("Effective ULN differs");
      const raw = await read(library.address, "getAppUlnConfig", [n.token.address, remote.eid]);
      if (!same(encodeAbiParameters(ULN_PARAMETERS, [raw as never]), encodeRouteUln(uln, true))) throw Error("Explicit application ULN differs");
    }
    const executor = encodeAbiParameters(EXECUTOR_PARAMETERS, [{ maxMessageSize: n.maxMessageSize, executor: n.executor.address }]);
    const rawExecutor = await read(n.sendLibrary.address, "executorConfigs", [n.token.address, remote.eid]);
    if (!same(await read(n.endpoint.address, "getConfig", [n.token.address, n.sendLibrary.address, remote.eid, 1]), executor)
      || !Array.isArray(rawExecutor) || rawExecutor.length !== 2 || rawExecutor[0] !== n.maxMessageSize || !same(rawExecutor[1], n.executor.address)) throw Error("Explicit executor differs");
    const supply = await read(n.token.address, "totalSupply"), burned = await read(n.token.address, "permanentlyBurned");
    if (typeof supply !== "bigint" || typeof burned !== "bigint" || supply < 0n || burned < 0n || supply + burned > BigInt(p.globalSupplyCap)) throw Error("Local supply invalid");
    const after = await block();
    if (await chain() !== n.chainId || after.number !== height || after.hash !== b.hash || after.timestamp !== b.timestamp) throw Error("Route snapshot changed");
    return { chainId: n.chainId, eid: n.eid, token: n.token.address.toLowerCase(), blockNumber: height.toString(), blockHash: b.hash.toLowerCase(),
      blockTimestamp: b.timestamp.toString(), totalSupply: supply.toString(), permanentlyBurned: burned.toString(), bridgeEnabled: false };
  };
  const work = async () => {
    const results = await Promise.all(clients.map(async (pair, i) => {
      const heads = await Promise.all(pair.map(c => action(() => c.getBlockNumber({ cacheTime: 0 }))));
      if (heads.some(h => typeof h !== "bigint" || h < 20n) || (heads[0] > heads[1] ? heads[0] - heads[1] : heads[1] - heads[0]) > 10n) throw Error("Route provider heads differ");
      const height = (heads[0] < heads[1] ? heads[0] : heads[1]) - 20n;
      const reads = await Promise.all(pair.map(c => observe(c, p.networks[i], p.networks[1 - i], height)));
      if (JSON.stringify(reads[0]) !== JSON.stringify(reads[1])) throw Error("Route providers disagree");
      return reads[0];
    }));
    const observedAtMs = time();
    if (results.some(n => BigInt(observedAtMs) - BigInt(n.blockTimestamp) * 1000n > 120_000n)) throw Error("Route snapshot expired before completion");
    return Object.freeze({ source: "reviewed-paused-testnet-route-rpc-observation", policyHash: keccak256(toHex(JSON.stringify(p))), manifestHash: p.manifestHash,
      networks: results, observedAtMs, configurationMatches: true, independentProvidersVerified: false, routeDeliveryVerified: false,
      globalSupplyReconciled: false, securityReadiness: false, executionAuthorized: false });
  };
  try { return await Promise.race([work(), new Promise<never>((_, reject) => { timer = setTimeout(() => { finished = true; reject(Error("Route observation timed out")); }, 30_000); })]); }
  finally { finished = true; clearTimeout(timer); }
}
