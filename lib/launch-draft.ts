import { byteLength, metadataKeys, type CreatorMetadata } from "@/lib/creator-metadata";

const economicKeys = ["totalSupply", "basePrice", "slope", "graduationTarget", "creatorPurchase", "treasury", "metadataURI"] as const;
export type LaunchDraftFields = CreatorMetadata & Record<(typeof economicKeys)[number], string> & { selectedAsset: string | null };
export type LaunchDraft = { version: 1; chainId: number; factory: string; savedAt: string; fields: LaunchDraftFields };
export function launchDraftKey(chainId: number, factory: string) { return `fortune:creator-draft:v1:${chainId}:${factory.toLowerCase()}`; }

export function makeLaunchDraft(fields: LaunchDraftFields, chainId: number, factory: string): LaunchDraft {
  const draft = { version: 1 as const, chainId, factory: factory.toLowerCase(), savedAt: new Date().toISOString(), fields };
  // Apply the same whitelist/limits on save as on restore. Incomplete fields
  // are deliberately allowed; all transaction validation happens again later.
  const checked = restoreLaunchDraft(JSON.stringify(draft), chainId, factory);
  if (!checked) throw new Error("Draft could not be saved. Check the field lengths and URLs.");
  return checked;
}

export function restoreLaunchDraft(raw: string | null, chainId: number, factory: string): LaunchDraft | null {
  if (!raw || byteLength(raw) > 24_000) return null;
  try {
    const value = JSON.parse(raw);
    if (value?.version !== 1 || value.chainId !== chainId || typeof value.factory !== "string" ||
        value.factory.toLowerCase() !== factory.toLowerCase() || typeof value.savedAt !== "string" ||
        !Number.isFinite(Date.parse(value.savedAt)) || !value.fields || typeof value.fields !== "object") return null;
    const fields = {} as LaunchDraftFields;
    for (const key of [...metadataKeys, ...economicKeys]) {
      const field = value.fields[key];
      const max = key === "description" ? 4096 : key === "name" ? 64 : key === "symbol" ? 16 : 512;
      if (typeof field !== "string" || byteLength(field) > max) return null;
      if ((key === "imageURI" || key === "metadataURI") && /^(blob:|data:|file:)/i.test(field.trim())) return null;
      fields[key] = field;
    }
    if (value.fields.selectedAsset !== null && (typeof value.fields.selectedAsset !== "string" || !/^0x[\da-f]{40}$/i.test(value.fields.selectedAsset))) return null;
    fields.selectedAsset = value.fields.selectedAsset;
    // Never restore wallet/account, mode, fees, allowances, receipt, pending
    // transaction, upload proof, release readiness or the review checkbox.
    return { version: 1, chainId, factory: factory.toLowerCase(), savedAt: value.savedAt, fields };
  } catch { return null; }
}
