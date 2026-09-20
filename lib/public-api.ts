import { NextResponse } from "next/server";

export const FORTUNE_API_VERSION = "v1";

export type FortuneApiErrorCode =
  | "invalid_request"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "rate_limited"
  | "dependency_unavailable"
  | "protocol_not_configured"
  | "preflight_failed"
  | "internal";

export function apiOk<T>(
  data: T,
  options?: {
    status?: number;
    cacheSeconds?: number;
    staleSeconds?: number;
    meta?: Record<string, unknown>;
  }
) {
  const cacheSeconds = options?.cacheSeconds ?? 0;
  const staleSeconds = options?.staleSeconds ?? 0;

  return NextResponse.json(
    {
      data,
      meta: {
        apiVersion: FORTUNE_API_VERSION,
        timestamp: new Date().toISOString(),
        ...(options?.meta || {}),
      },
    },
    {
      status: options?.status ?? 200,
      headers: {
        "X-Fortune-API-Version": FORTUNE_API_VERSION,
        "Cache-Control":
          cacheSeconds > 0
            ? `public, s-maxage=${cacheSeconds}, stale-while-revalidate=${staleSeconds}`
            : "no-store",
      },
    }
  );
}

export function apiError(
  code: FortuneApiErrorCode,
  message: string,
  status: number,
  details?: Record<string, unknown>
) {
  return NextResponse.json(
    {
      error: {
        code,
        message,
        ...(details ? { details } : {}),
      },
      meta: {
        apiVersion: FORTUNE_API_VERSION,
        timestamp: new Date().toISOString(),
      },
    },
    {
      status,
      headers: {
        "X-Fortune-API-Version": FORTUNE_API_VERSION,
        "Cache-Control": "no-store",
      },
    }
  );
}

export function parseLimit(
  value: string | null,
  fallback = 25,
  max = 100
) {
  const parsed = Number(value ?? fallback);
  if (!Number.isInteger(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, max);
}

export function encodeCursor(offset: number) {
  return Buffer.from(String(offset), "utf8").toString("base64url");
}

export function decodeCursor(cursor: string | null) {
  if (!cursor) return 0;

  try {
    const value = Number(
      Buffer.from(cursor, "base64url").toString("utf8")
    );
    return Number.isInteger(value) && value >= 0 ? value : 0;
  } catch {
    return 0;
  }
}

export function paginate<T>(
  rows: T[],
  cursor: string | null,
  limit: number
) {
  const offset = decodeCursor(cursor);
  const items = rows.slice(offset, offset + limit);
  const nextOffset = offset + items.length;

  return {
    items,
    page: {
      limit,
      nextCursor:
        nextOffset < rows.length
          ? encodeCursor(nextOffset)
          : null,
      hasMore: nextOffset < rows.length,
      total: rows.length,
    },
  };
}

export function normalizeAddress(value: string | null) {
  if (!value) return null;
  const trimmed = value.trim();
  return /^0x[a-fA-F0-9]{40}$/.test(trimmed)
    ? trimmed
    : null;
}
