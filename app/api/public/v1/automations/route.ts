import { automations } from "@/data/mock";
import { apiOk } from "@/lib/public-api";

export const revalidate = 10;

export async function GET() {
  return apiOk(
    {
      automations,
      executionModel: {
        vaults: "purpose-locked",
        adapters: "protocol-approved",
        arbitraryKeeperDestination: false,
      },
    },
    {
      cacheSeconds: 10,
      staleSeconds: 30,
      meta: {
        dataMode: "demo",
        productionSource:
          "FortuneAutomationVault events and onchain balances",
      },
    }
  );
}
