/** Read-only ord index attestation. Never Rune validation, custody or bridge backing. */
const U128 = (1n << 128n) - 1n, U64 = (1n << 64n) - 1n, U32 = (1n << 32n) - 1n;
const object = (v: unknown): Record<string, unknown> => {
  if (!v || typeof v !== "object" || Array.isArray(v)) throw Error("Invalid rune index object");
  return v as Record<string, unknown>;
};
const uint = (v: unknown, max = U128) => {
  if (typeof v !== "bigint" || v < 0n || v > max) throw Error("Invalid rune index integer");
  return v.toString();
};
export function runeIndexId(value: unknown) {
  if (typeof value !== "string" || !/^(0|[1-9][0-9]{0,19}):(0|[1-9][0-9]{0,9})$/.test(value)) throw Error("Invalid Rune ID");
  const [block, tx] = value.split(":").map(BigInt);
  if (block > U64 || tx > U32 || (block === 0n && tx !== 0n)) throw Error("Invalid Rune ID");
  return value;
}
function exactJson(text: string) {
  // JSON numeric lexemes, not already-rounded IEEE doubles. Unsupported runtimes fail closed.
  return JSON.parse(text, (_key: string, value: unknown, context?: { source?: string }) => {
    if (typeof value !== "number") return value;
    const source = context?.source;
    if (!source || !/^(0|[1-9][0-9]{0,38})$/.test(source)) throw Error("Exact unsigned JSON integers required");
    const result = BigInt(source);
    if (result > U128) throw Error("Rune index integer overflow");
    return result;
  });
}
export function runeIndexObservation(text: string, requestedId: string, observedAtMs = Date.now()) {
  requestedId = runeIndexId(requestedId);
  if (!Number.isSafeInteger(observedAtMs) || observedAtMs < 0 || Buffer.byteLength(text, "utf8") > 32768) throw Error("Invalid rune observation");
  const data = object(exactJson(text)), entry = object(data.entry);
  if (runeIndexId(data.id) !== requestedId || uint(entry.block, U64) !== requestedId.split(":")[0]) throw Error("Rune ID binding mismatch");
  if (typeof entry.etching !== "string" || !/^[0-9a-f]{64}$/.test(entry.etching)) throw Error("Invalid etching transaction label");
  if (typeof entry.spaced_rune !== "string" || !/^[A-Z]+(?:•[A-Z]+)*$/.test(entry.spaced_rune)) throw Error("Invalid rune name");
  const letters = entry.spaced_rune.replaceAll("•", "");
  if (letters.length > 28) throw Error("Rune name overflow");
  let name = 0n;
  for (let i = 0; i < letters.length; i++) { name = name * 26n + BigInt(letters.charCodeAt(i) - 65); if (i < letters.length - 1) name++; }
  if (name > U128) throw Error("Rune name overflow");
  if (typeof entry.turbo !== "boolean" || typeof data.mintable !== "boolean") throw Error("Invalid rune index flags");
  const symbol = entry.symbol;
  if (symbol !== null && (typeof symbol !== "string" || [...symbol].length !== 1 || /[\u0000-\u001f\u007f-\u009f\ud800-\udfff]/u.test(symbol))) throw Error("Invalid rune symbol");
  const pair = (v: unknown) => {
    if (!Array.isArray(v) || v.length !== 2) throw Error("Invalid rune terms");
    return v.map(n => n === null ? null : uint(n, U64));
  };
  const terms = entry.terms === null ? null : (() => {
    const t = object(entry.terms);
    return { amount: t.amount === null ? null : uint(t.amount), cap: t.cap === null ? null : uint(t.cap), height: pair(t.height), offset: pair(t.offset) };
  })();
  return {
    schemaVersion: 1, kind: "ord-rune-index-attestation", observedAtMs,
    source: { url: `https://ordinals.com/rune/${requestedId}`, configuredNetwork: "bitcoin-mainnet", indexHeight: null, blockHash: null, confirmations: null },
    rune: { id: requestedId, block: uint(entry.block, U64), etchingTransactionLabel: entry.etching, spacedName: entry.spaced_rune,
      divisibility: uint(entry.divisibility, 38n), number: uint(entry.number, U64), premine: uint(entry.premine), mints: uint(entry.mints), burned: uint(entry.burned),
      symbol, terms, timestamp: uint(entry.timestamp, U64), turbo: entry.turbo, indexReportedMintable: data.mintable },
    totalSupply: null, marketPrice: null, holderCount: null, backing: null,
    independentProvidersVerified: false, networkVerified: false, etchingTransactionVerified: false, runestoneVerified: false,
    finalityVerified: false, custodyVerified: false, bridgeBackingVerified: false, executionAuthorized: false, fullBitcoinRunesReadiness: false,
    limitations: ["One remote index attestation, not independent Bitcoin RPC, transaction inclusion, Rune protocol validation or finality.",
      "Network is a fixed-origin configuration label, not independently verified. No index height/hash is supplied by this response.",
      "Timestamp is the index's historical etching label; observation time does not certify source freshness. Mintable is an index report, not execution approval.",
      "Counts are raw index integers; no supply/backing, eligible asset, price, holder, etching, wallet, custody or bridge claim follows. Names/symbols are untrusted data."],
  };
}
export async function readRuneIndex(id: string, options: { fetch?: typeof fetch; now?: () => number } = {}) {
  id = runeIndexId(id);
  const now = options.now ?? Date.now;
  let last = now(), finished = false;
  if (!Number.isSafeInteger(last) || last < 0) throw Error("Invalid rune observation clock");
  const started = last, controller = new AbortController();
  const check = () => { const time = now(); if (finished || !Number.isSafeInteger(time) || time < last || time - started >= 10000) throw Error("Rune observation ended"); last = time; return time; };
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  const cancel = () => { try { void reader?.cancel().catch(() => {}); } catch {} };
  let timeout: ReturnType<typeof setTimeout>;
  const deadline = new Promise<never>((_resolve, reject) => { timeout = setTimeout(() => { finished = true; reject(Error("Rune observation timed out")); controller.abort(); cancel(); }, 10000); });
  const work = async () => {
    check();
    const response = await (options.fetch ?? fetch)(`https://ordinals.com/rune/${id}`, { method: "GET", redirect: "error", credentials: "omit", cache: "no-store", signal: controller.signal, headers: { Accept: "application/json" } });
    check();
    if (response.status !== 200 || !/^application\/json(?:\s*;|$)/i.test(response.headers.get("content-type") ?? "")) throw Error("Rune index unavailable");
    const declared = response.headers.get("content-length");
    if (declared && (!/^\d+$/.test(declared) || Number(declared) > 32768)) throw Error("Rune index response too large");
    if (!response.body) throw Error("Empty rune index response");
    reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
    while (true) { check(); const { value, done } = await reader.read(); check(); if (done) break; if (chunks.length >= 4096) throw Error("Rune index response has too many chunks"); size += value.byteLength; if (size > 32768) throw Error("Rune index response too large"); chunks.push(value); }
    const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    check(); const result = runeIndexObservation(new TextDecoder("utf-8", { fatal: true }).decode(bytes), id, check()); check(); return result;
  };
  try { return await Promise.race([work(), deadline]); }
  finally { finished = true; clearTimeout(timeout!); controller.abort(); cancel(); try { reader?.releaseLock(); } catch {} }
}
