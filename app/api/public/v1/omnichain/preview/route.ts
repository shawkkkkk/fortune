import { createHash } from "node:crypto";
import { apiError, apiOk } from "@/lib/public-api";
import { planOmnichain } from "@/lib/omnichain-plan";

export async function POST(request: Request) {
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") return apiError("invalid_request", "Use application/json.", 415);
  const reader = request.body?.getReader();
  if (!reader) return apiError("invalid_request", "A JSON body is required.", 400);
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 8192) { await reader.cancel(); return apiError("invalid_request", "Plan exceeds 8192 bytes.", 413); }
      chunks.push(value);
    }
  } catch { return apiError("invalid_request", "Could not read plan.", 400); }
  finally { reader.releaseLock(); }
  let plan: ReturnType<typeof planOmnichain>;
  try {
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    plan = planOmnichain(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)));
  } catch { return apiError("invalid_request", "Invalid token identity, supply or testnet allocations. Use two or three distinct supported testnets including chain 97, with positive whole-token allocations equal to globalSupply.", 400); }
  return apiOk({ ...plan, planId: "omni_plan_" + createHash("sha256").update(JSON.stringify(plan)).digest("hex") }, { meta: { note: "Static supply plan only. planId is not a signed authorization, quote, deployment job or onchain manifest hash." } });
}
