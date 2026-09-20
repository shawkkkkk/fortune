import { apiError } from "@/lib/public-api";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;

  return apiError(
    "dependency_unavailable",
    "Canonical charts are disabled until curve, GraduationAnchor, official Pancake pool, and Swap events are backed by the public indexer.",
    503,
    { id, indexerReady: false }
  );
}
