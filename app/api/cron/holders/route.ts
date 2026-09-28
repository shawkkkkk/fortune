import { timingSafeEqual } from "node:crypto";
import { advanceIfDue } from "@/lib/holder-runtime";
import { holderStore } from "@/lib/holder-store";
import { apiError, apiOk } from "@/lib/public-api";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Vercel Cron (or any scheduler) sends `Authorization: Bearer $CRON_SECRET`. */
function authorized(request: Request, secret = process.env.CRON_SECRET) {
  if (!secret || secret.length < 16) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(request.headers.get("authorization") || "");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** Moves the holder index toward the confirmed head. */
export async function GET(request: Request) {
  if (!authorized(request)) return apiError("forbidden", "Missing or wrong cron secret.", 401);
  const store = holderStore();
  if (!store) return apiOk({ enabled: false as const }, { cacheSeconds: 0 });
  const run = await advanceIfDue(store, 45_000, true);
  return apiOk({ enabled: true as const, run }, { cacheSeconds: 0 });
}
