// Shared by the browser form and tests. These are Solidity byte limits, not
// JavaScript character limits (important for Chinese names and emoji).
export const METADATA_LIMITS = { name: 64, symbol: 16, description: 4096, uri: 512 } as const;
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
export const MAX_METADATA_BYTES = 32 * 1024;
export const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
export const metadataKeys = ["name", "symbol", "description", "imageURI", "website", "xProfile", "telegram", "github", "youtube", "debox"] as const;
export type CreatorMetadata = Record<(typeof metadataKeys)[number], string>;
export const emptyMetadata = Object.fromEntries(metadataKeys.map((key) => [key, ""])) as CreatorMetadata;

export function byteLength(value: string) { return new TextEncoder().encode(value).length; }

export function boundedText(label: string, value: unknown, max: number) {
  if (typeof value !== "string") throw new Error(`${label} must be text.`);
  const clean = value.trim();
  if (byteLength(clean) > max) throw new Error(`${label} must be ${max} UTF-8 bytes or fewer.`);
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(clean)) throw new Error(`${label} contains unsupported control characters.`);
  return clean;
}

export function isIpfsCid(value: string) {
  return /^Qm[1-9A-HJ-NP-Za-km-z]{44}$/.test(value) || /^bafy[a-z2-7]{20,110}$/.test(value);
}

export function publicMetadataUrl(label: string, value: string, allowIpfs = false) {
  const clean = boundedText(label, value, METADATA_LIMITS.uri);
  if (!clean) return "";
  if (/\s|\\/.test(clean)) throw new Error(`${label} cannot contain spaces or backslashes.`);
  if (allowIpfs && clean.startsWith("ipfs://")) {
    const parts = clean.slice(7).split("/");
    if (!isIpfsCid(parts[0]) || parts.slice(1).some((part) => !/^[a-zA-Z0-9_.-]+$/.test(part) || part === "." || part === "..")) {
      throw new Error(`${label} must contain a valid IPFS CID and path.`);
    }
    return clean;
  }
  let url: URL;
  try { url = new URL(clean); } catch { throw new Error(`${label} must be a public HTTPS URL${allowIpfs ? " or ipfs:// URI" : ""}.`); }
  const host = url.hostname.toLowerCase().replace(/\.+$/, "");
  // No local network targets, embedded credentials or non-web protocols.
  if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || url.port ||
      !host.includes(".") || host.includes(":") || /^[\d.]+$/.test(host) ||
      /(^|\.)(localhost|local|internal|test|invalid|example)$/.test(host)) {
    throw new Error(`${label} must use a public web host without credentials or a custom port.`);
  }
  return clean;
}

export function validateCreatorMetadata(value: CreatorMetadata, required = true): CreatorMetadata {
  const name = boundedText("Token name", value.name, METADATA_LIMITS.name);
  const symbol = boundedText("Ticker", value.symbol, METADATA_LIMITS.symbol);
  const imageURI = publicMetadataUrl("Image", value.imageURI, true);
  if (required && (!name || !symbol || !imageURI)) throw new Error("Enter a name, ticker and public image before reviewing.");
  return {
    name, symbol, imageURI,
    description: boundedText("Description", value.description, METADATA_LIMITS.description),
    website: publicMetadataUrl("Website", value.website),
    xProfile: publicMetadataUrl("X / Twitter", value.xProfile),
    telegram: publicMetadataUrl("Telegram", value.telegram),
    github: publicMetadataUrl("GitHub", value.github),
    youtube: publicMetadataUrl("YouTube", value.youtube),
    debox: publicMetadataUrl("DeBox", value.debox),
  };
}

export function parseMetadataDocument(value: unknown): CreatorMetadata {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Metadata must be a JSON object.");
  const data = value as Record<string, unknown>;
  const ext = data.extensions && typeof data.extensions === "object" && !Array.isArray(data.extensions)
    ? data.extensions as Record<string, unknown> : {};
  const result = { ...emptyMetadata };
  const aliases: Record<string, unknown> = {
    imageURI: data.imageURI ?? data.image,
    website: data.website ?? data.external_url ?? ext.website,
    xProfile: data.xProfile ?? data.twitter ?? ext.twitter,
    telegram: data.telegram ?? ext.telegram,
  };
  for (const key of metadataKeys) {
    const field = aliases[key] ?? data[key] ?? "";
    if (typeof field !== "string") throw new Error(`Metadata ${key} must be text.`);
    result[key] = field;
  }
  // Unknown fields (including economic parameters) are never imported.
  return validateCreatorMetadata(result, true);
}

export function metadataFetchUrl(value: string) {
  const clean = publicMetadataUrl("Metadata URI", value, true);
  if (!clean) throw new Error("Enter a metadata URI.");
  if (clean.startsWith("ipfs://")) return `https://ipfs.io/ipfs/${clean.slice(7)}`;
  if (!clean.startsWith("https://")) throw new Error("Metadata import requires HTTPS or IPFS.");
  return clean;
}

export async function readLimitedBytes(response: Response | Request, limit: number) {
  const declared = response.headers.get("content-length");
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > limit)) throw new Error("Content exceeds the allowed size.");
  if (!response.body) throw new Error("Content is empty.");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) throw new Error("Content exceeds the allowed size.");
      chunks.push(value);
    }
  } catch (error) { await reader.cancel().catch(() => {}); throw error; }
  finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}

export async function importMetadataUri(value: string): Promise<CreatorMetadata> {
  // Browser fetch only: never proxy arbitrary URLs through the server. Hosts
  // must permit CORS. No credentials, redirects, HTML or unbounded response.
  const response = await fetch(metadataFetchUrl(value), {
    credentials: "omit", redirect: "error", cache: "no-store",
    referrerPolicy: "no-referrer", signal: AbortSignal.timeout(10_000),
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error("Metadata could not be loaded. Check the public URL and CORS settings.");
  return parseMetadataDocument(JSON.parse(new TextDecoder().decode(await readLimitedBytes(response, MAX_METADATA_BYTES))));
}

export function uploadMessage(origin: string, address: string, digest: string, issuedAt: number) {
  return ["Fortune image upload", `Origin: ${origin}`, `Wallet: ${address.toLowerCase()}`,
    `SHA-256: ${digest}`, `Issued at: ${issuedAt}`, "Expires after: 5 minutes",
    "Authorize only this public image upload. No transaction, token approval or funds transfer."].join("\n");
}
