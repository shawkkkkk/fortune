import { apiError } from "@/lib/public-api";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;

  return apiError(
    "dependency_unavailable",
    "The Fortune public token indexer is not live yet. Use the BscScan links returned by /testnet for tokens created in the beta.",
    503,
    { id, indexerReady: false }
  );
}
