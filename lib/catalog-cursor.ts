export function encodeCatalogCursor(offset: number, blockNumber: bigint) {
  return Buffer.from(JSON.stringify({ offset, block: blockNumber.toString() }), "utf8").toString("base64url");
}

export function decodeCatalogCursor(raw: string | null) {
  if (!raw) return { offset: 0, blockNumber: undefined };
  try {
    if (raw.length > 200 || !/^[A-Za-z0-9_-]+$/.test(raw)) throw new Error();
    const value = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    if (!Number.isSafeInteger(value.offset) || value.offset < 0 || value.offset > 10_000 || typeof value.block !== "string" || !/^\d{1,20}$/.test(value.block)) throw new Error();
    return { offset: value.offset as number, blockNumber: BigInt(value.block) };
  } catch { throw new Error("Invalid catalog cursor. Start from the first page."); }
}
