import { hashTypedData, recoverTypedDataAddress, type Address, type Hex } from "viem";
import { canonPolicy, canonTypedData, canonUpdate, type CanonPolicy } from "@/lib/creator-canon-authorization";
import { characterDraft, type CharacterFields } from "@/lib/creator-character";

const reviews = new WeakMap<object, ReturnType<typeof canonTypedData>>();
const literal = (v: unknown): string => JSON.stringify(v, (_, x) => typeof x === "bigint" ? x.toString() : x);
function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  if (v && typeof v === "object") return `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`).join(",")}}`;
  return literal(v);
}
function freeze<T>(v: T): T { if (v && typeof v === "object") { Object.values(v).forEach(freeze); Object.freeze(v); } return v; }
/** Trusted policy/registry pins must come from the operator, never the imported request. */
export function reviewCanonSigningRequest(raw: string, policy: CanonPolicy, registryId: Hex, fields: CharacterFields) {
  if (typeof raw !== "string" || new TextEncoder().encode(raw).length > 40960) throw Error("Signing request exceeds 40 KiB");
  const input = JSON.parse(raw);
  if (!input || Object.keys(input).sort().join() !== "typedData,update") throw Error("Exact registry preparation required");
  const p = canonPolicy(policy), update = canonUpdate(input.update);
  const expected = characterDraft(p.token, fields);
  if (canonical(update.fields) !== canonical(expected.fields)) throw Error("Reviewed character fields differ");
  const typedData = canonTypedData(p, registryId, update);
  if (canonical(input.typedData) !== canonical(JSON.parse(literal(typedData)))) throw Error("Typed data differs from the fixed character schema");
  const review = freeze({ update, digest: hashTypedData(typedData), registryId,
    policy: p, currentAuthorization: null, executionAuthorized: false as const });
  reviews.set(review, freeze(typedData));
  return review;
}
type Review = ReturnType<typeof reviewCanonSigningRequest>;
type Wallet = {
  getAddresses(): Promise<readonly Address[]>;
  getChainId(): Promise<number>;
  signTypedData(request: ReturnType<typeof canonTypedData> & { account: Address }): Promise<Hex>;
};
/** No default activation, network switch, alternate signing method, retry or storage write. */
export async function signReviewedCanon(wallet: Wallet, review: Review,
  { enabled = false, reviewedDigest, expectedAccount }: { enabled?: boolean; reviewedDigest: Hex; expectedAccount: Address },
  now: () => number = Date.now) {
  const typedData = reviews.get(review);
  if (!enabled || !typedData || reviewedDigest !== review.digest || !/^0x[0-9a-f]{40}$/i.test(expectedAccount)) throw Error("Explicit reviewed signing required");
  const start = now(); let last = start, ended = false;
  const check = () => {
    const n = now();
    if (ended || !Number.isSafeInteger(start) || start < 1 || !Number.isSafeInteger(n) || n < last ||
      n < review.update.issuedAtMs || n >= review.update.expiresAtMs) throw Error("Signing review expired or clock changed");
    last = n;
  };
  check();
  const identity = async () => {
    check(); const accounts = await wallet.getAddresses(); check();
    if (accounts.length !== 1 || accounts[0].toLowerCase() !== expectedAccount.toLowerCase()) throw Error("Wallet account changed");
    const chain = await wallet.getChainId(); check(); if (chain !== 97) throw Error("BSC Testnet wallet required");
  };
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const deadline = new Promise<never>((_, reject) => { timer = setTimeout(() => { ended = true; reject(Error("Signing review expired")); }, review.update.expiresAtMs - start); });
    const work = async () => {
      await identity(); check();
      const signature = await wallet.signTypedData({ ...structuredClone(typedData), account: expectedAccount }); check();
      if (!/^0x[0-9a-fA-F]{128}(1b|1c)$/.test(signature) || BigInt(`0x${signature.slice(66, 130)}`) > 0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0n) throw Error("Unsupported EOA signature");
      const recovered = await recoverTypedDataAddress({ ...typedData, signature }); check();
      if (recovered.toLowerCase() !== expectedAccount.toLowerCase()) throw Error("Signature wallet differs");
      await identity(); check();
      // No token policy, signature or prose is sent anywhere by this adapter.
      return freeze({ update: structuredClone(review.update), signature });
    };
    return await Promise.race([work(), deadline]);
  } finally { ended = true; clearTimeout(timer); }
}
