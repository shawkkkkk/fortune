import { apiOk } from "@/lib/public-api";
import { readXMoneyPayoutStatus } from "@/lib/xmoney-payout-server";

export const revalidate = 3600;

export async function GET() {
  return apiOk(readXMoneyPayoutStatus(), {
    cacheSeconds: 3600,
    staleSeconds: 86400,
    meta: {
      note: "Capability status only. Receipt controls accept provider order evidence server-side and never accept raw receipt links here. This endpoint cannot register a payee, prepare a transaction, sign, broadcast or prove X Money enrollment.",
    },
  });
}
