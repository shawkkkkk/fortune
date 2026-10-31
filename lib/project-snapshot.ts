import { readProjectApi } from "@/lib/project-api-read";
import { projectCanon, projectToken } from "@/lib/project-canon";

function object(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== "object" || Array.isArray(v)) throw Error("Invalid snapshot");
  return v as Record<string, unknown>;
}
function decimal(v: unknown) {
  if (typeof v !== "string" || !/^(0|[1-9][0-9]{0,77})(\.[0-9]{1,18})?$/.test(v)) throw Error("Invalid decimal");
  const [whole, fraction = ""] = v.split(".");
  if (BigInt(whole + fraction.padEnd(18, "0")) > (1n << 256n) - 1n) throw Error("Decimal overflow");
  return v;
}

/** A single API-provided block context, never a quote or independent RPC proof. */
export function projectSnapshot(value: unknown, token: string, now = Date.now()) {
  const envelope = object(value), data = object(envelope.data), m = object(data.market);
  const canon = projectCanon({ data: data.metadata, meta: envelope.meta }, token, now);
  const p = canon.provenance;
  if (projectToken(m.token) !== canon.token || projectToken(m.factory) !== p.factory || projectToken(m.creator) !== p.creator ||
      m.blockNumber !== p.blockNumber || typeof m.blockHash !== "string" || m.blockHash.toLowerCase() !== p.blockHash ||
      !Number.isInteger(m.phase) || ![0, 1, 2, 3].includes(m.phase as number)) throw Error("Snapshot binding mismatch");
  const phase = m.phase as number;
  if (phase >= 2 && m.curveReferencePriceUsd !== null) throw Error("Retired curve price must be unavailable");
  const price = phase <= 1 ? decimal(m.curveReferencePriceUsd) : null, reserve = decimal(m.curveReserveUsd), target = decimal(m.graduationTargetUsd);
  return { schemaVersion: 1, canon,
    market: { curve: projectToken(m.curve), phase, status: ["Curve", "GraduationReady", "Pancake", "Rescued"][phase],
      totalSupply: decimal(m.totalSupply), tokenDecimals: 18,
      curveAccounting: { referencePriceUsd: phase <= 1 ? price : null, reserveUsd: reserve, graduationTargetUsd: target },
      marketCapUsd: null, volume24hUsd: null, holderCount: null, tradeQuote: null,
      provenance: { chainId: 97, token: canon.token, factory: p.factory, creator: p.creator, blockNumber: p.blockNumber, blockHash: p.blockHash } },
    limitations: [...canon.limitations,
      "Curve reference price is not an executable quote or a graduated pool price. It is unavailable after graduation/rescue.",
      "Curve-accounted USD reserve is not treasury balance, LP TVL or a cash payout. USD fields use contract/oracle accounting, not independent valuation.",
      "Supply uses Standard's 18 decimals. Volume, holders, market cap, treasury and quotes are not inferred; no trading or spending authority."],
  };
}

export async function readProjectSnapshot(token: string, options: { fetch?: typeof fetch; now?: () => number } = {}) {
  token = projectToken(token);
  return readProjectApi(`https://fortunepad.fun/api/public/v1/tokens/${token}/project`, 30000, options,
    (value, now) => projectSnapshot(value, token, now));
}
