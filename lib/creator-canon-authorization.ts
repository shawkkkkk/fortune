import { hashTypedData, keccak256, parseAbi, recoverTypedDataAddress, type Address, type Hex, type PublicClient } from "viem";
import { CHARACTER_FIELDS, characterDraft } from "@/lib/creator-character";
import { PUBLIC_TESTNET } from "@/lib/public-testnet";

export const CANON_ORIGIN = "https://fortunepad.fun";
export const ZERO_CANON_DIGEST = `0x${"0".repeat(64)}`;
const hash = (v: unknown): v is Hex => typeof v === "string" && /^0x[0-9a-f]{64}$/.test(v);
const address = (v: unknown): v is Address => typeof v === "string" && /^0x[0-9a-f]{40}$/.test(v) && !/^0x0{40}$/.test(v);
export type CanonPolicy = { chainId: 97; factory: Address; factoryCodeHash: Hex; token: Address; launchIndex: number };
export function canonPolicy(input: CanonPolicy): CanonPolicy {
  if (!input || input.chainId !== 97 || input.factory !== PUBLIC_TESTNET.contracts.factory.toLowerCase() || !address(input.token)
    || !hash(input.factoryCodeHash) || input.factoryCodeHash === ZERO_CANON_DIGEST || !Number.isInteger(input.launchIndex)
    || input.launchIndex < 0 || input.launchIndex >= 10000) throw Error("Reviewed Standard testnet policy required");
  return { chainId: 97, factory: input.factory, factoryCodeHash: input.factoryCodeHash, token: input.token, launchIndex: input.launchIndex };
}
export type CanonUpdate = { version: 1; token: string; revision: number; previousDigest: string; issuedAtMs: number; expiresAtMs: number; fields: ReturnType<typeof characterDraft>["fields"] };
const keys = ["version", "token", "revision", "previousDigest", "issuedAtMs", "expiresAtMs", "fields"];
export function canonUpdate(value: CanonUpdate): CanonUpdate {
  if (!value || Object.keys(value).sort().join() !== [...keys].sort().join() || value.version !== 1 || !address(value.token)
    || !Number.isSafeInteger(value.revision) || value.revision < 1 || value.revision > 1000 || !hash(value.previousDigest)
    || !Number.isSafeInteger(value.issuedAtMs) || value.issuedAtMs < 1 || !Number.isSafeInteger(value.expiresAtMs)
    || value.expiresAtMs !== value.issuedAtMs + 300000) throw Error("Invalid canon update");
  const fields = characterDraft(value.token, value.fields).fields;
  if (Object.keys(value.fields).sort().join() !== Object.keys(CHARACTER_FIELDS).sort().join()
    || Object.keys(fields).some(k => fields[k as keyof typeof fields] !== value.fields[k as keyof typeof fields])) throw Error("Use exact normalized profile fields");
  return { version: 1, token: value.token, revision: value.revision, previousDigest: value.previousDigest, issuedAtMs: value.issuedAtMs, expiresAtMs: value.expiresAtMs, fields };
}
/** Full character wording is visible in typed data; no wallet/financial permission. */
export function canonTypedData(policy: CanonPolicy, registryId: Hex, value: CanonUpdate) {
  const p = canonPolicy(policy), v = canonUpdate(value);
  if (!hash(registryId) || registryId === ZERO_CANON_DIGEST || v.token !== p.token) throw Error("Registry/project differs");
  return { domain: { name: "Fortune Project Character", version: "1", chainId: 97, verifyingContract: p.factory, salt: registryId },
    primaryType: "CharacterUpdate" as const,
    types: { CharacterUpdate: [ { name: "origin", type: "string" }, { name: "token", type: "address" },
      { name: "revision", type: "uint256" }, { name: "previousDigest", type: "bytes32" },
      { name: "issuedAtMs", type: "uint256" }, { name: "expiresAtMs", type: "uint256" },
      ...Object.keys(CHARACTER_FIELDS).map(name => ({ name, type: "string" })),
    ] }, message: { origin: CANON_ORIGIN, token: p.token, revision: BigInt(v.revision), previousDigest: v.previousDigest as Hex,
      issuedAtMs: BigInt(v.issuedAtMs), expiresAtMs: BigInt(v.expiresAtMs), ...v.fields } };
}
const ABI = parseAbi(["function launches(uint256) view returns(address,address,address,address,address,address,address,bytes32,bytes32,uint64)"]);
async function verify(clients: readonly [PublicClient, PublicClient], policy: CanonPolicy, registryId: Hex,
  update: CanonUpdate, signature: Hex, now: () => number = Date.now) {
  const p = canonPolicy(policy), v = canonUpdate(update), typed = canonTypedData(p, registryId, v), start = now();
  const time = () => { const n = now(); if (!Number.isSafeInteger(n) || n < start || n < v.issuedAtMs || n >= v.expiresAtMs || n - start > 20000) throw Error("Authorization expired or clock changed"); return n; };
  time();
  // EOA-only, canonical low-s 65-byte signatures. No ERC-1271, delegation or counterfactual fallback.
  if (typeof signature !== "string" || !/^0x[0-9a-fA-F]{128}(1b|1c)$/.test(signature)
    || BigInt(`0x${signature.slice(66,130)}`) > 0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0n) throw Error("Unsupported signature");
  if (clients.length !== 2 || clients[0] === clients[1]) throw Error("Two distinct read clients required");
  const recovered = (await recoverTypedDataAddress({ ...typed, signature })).toLowerCase();
  const heads = await Promise.all(clients.map(c => c.getBlockNumber({ cacheTime: 0 })));
  if (heads.some(h => typeof h !== "bigint" || h < 20n) || (heads[0] > heads[1] ? heads[0]-heads[1] : heads[1]-heads[0]) > 10n) throw Error("Provider heads unavailable");
  const blockNumber = (heads[0] < heads[1] ? heads[0] : heads[1]) - 20n;
  const results = await Promise.all(clients.map(async c => {
    if (await c.getChainId() !== 97) throw Error("Wrong chain");
    const block = await c.getBlock({ blockNumber });
    if (block.number !== blockNumber || !hash(block.hash) || block.hash === ZERO_CANON_DIGEST || typeof block.timestamp !== "bigint"
      || block.timestamp * 1000n > BigInt(time()+5000) || BigInt(time()) - block.timestamp*1000n > 120000n) throw Error("Stale block");
    const code = await c.getCode({ address: p.factory, blockNumber });
    if (!code || code === "0x" || keccak256(code) !== p.factoryCodeHash) throw Error("Factory code differs");
    const row = await c.readContract({ address: p.factory, abi: ABI, functionName: "launches", args: [BigInt(p.launchIndex)], blockNumber });
    if (!Array.isArray(row) || row.length !== 10 || row[1].toLowerCase() !== p.token || !address(row[0].toLowerCase())
      || row[0].toLowerCase() !== recovered || row[9] === 0n) throw Error("Factory creator differs");
    const creatorCode = await c.getCode({ address: row[0], blockNumber });
    if (creatorCode && creatorCode !== "0x") throw Error("Contract/delegated creators unsupported");
    if ((await c.getBlock({ blockNumber })).hash !== block.hash || await c.getChainId() !== 97) throw Error("Snapshot changed");
    return { creator: recovered, blockNumber: blockNumber.toString(), blockHash: block.hash, factoryCodeHash: p.factoryCodeHash };
  }));
  if (JSON.stringify(results[0]) !== JSON.stringify(results[1])) throw Error("Provider observations differ");
  return Object.freeze({ ...results[0], digest: hashTypedData(typed), observedAtMs: time(), kind: "eoa-factory-rpc-observation" as const });
}

/** A wall-clock deadline also rejects hung injected clients; outstanding reads are never writes. */
export async function verifyCreatorCanon(...args: Parameters<typeof verify>) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([verify(...args), new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(Error("Authorization observation timed out")), 20000);
  })]); } finally { clearTimeout(timer); }
}
