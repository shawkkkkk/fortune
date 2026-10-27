/** Presentation only. A configured builder still requires live factory preflight. */
export type CatalogContext = { chainId: number; standardConfigured: boolean; customFactory?: string | null; stockFactory?: string | null };
export type LaunchPreset = { id: string; name: string; purpose: string; state: "builder" | "unconfigured" | "planned"; reason: string; href?: string; action?: string };

function nonzeroAddress(value?: string | null) {
  return typeof value === "string" && /^0x[0-9a-fA-F]{40}$/.test(value) && !/^0x0{40}$/i.test(value);
}

export function launchCatalog(context: CatalogContext): LaunchPreset[] {
  const testnet = context.chainId === 97;
  const standard = testnet && context.standardConfigured;
  const custom = testnet && nonzeroAddress(context.customFactory);
  const stock = testnet && nonzeroAddress(context.stockFactory);
  return [
    { id: "standard", name: "Standard", purpose: "A fixed-supply token with a curve and locked graduation liquidity.", state: standard ? "builder" : "unconfigured", reason: standard ? "Testnet builder. Live registry and factory checks still apply." : "Testnet configuration required. Use the existing Standard form for independently gated mainnet readiness.", href: "/launch", action: "Open Standard form" },
    { id: "custom-pair", name: "Custom Pair", purpose: "Choose a compatible BEP-20 pair and inspect its transfer behavior.", state: custom ? "builder" : "unconfigured", reason: custom ? "Unaudited testnet beta. Pair inspection and factory preflight are required." : "A BSC Testnet custom-pair factory and deployment drill are required.", href: "/launch/custom", action: "Inspect beta builder" },
    { id: "burn-rewards", name: "Burn + Rewards", purpose: "Burn token-side fees; account for holder rewards separately in the pair asset.", state: "planned", reason: "Isolated v2 prototype. Integrated hook, factory, settlement and lifecycle verification are unfinished." },
    { id: "basket-rewards", name: "Basket Rewards", purpose: "Pay holders multiple approved assets, starting with the Stock Rewards beta.", state: stock ? "builder" : "unconfigured", reason: stock ? "Stock Rewards beta only. This is not arbitrary-asset basket support." : "The isolated Stock Rewards testnet factory and lifecycle drill are required.", href: "/launch/stock-rewards", action: "Inspect Stock Rewards builder" },
    { id: "protected", name: "Protected Launch", purpose: "Choose disclosed launch-period trading limits.", state: "unconfigured", reason: "Rules are part of the custom-pair beta. Deployment capabilities must be checked there; expanded rules remain a separate review.", href: "/launch/custom", action: "Inspect rules in beta builder" },
    { id: "social", name: "Social Fees", purpose: "Route creator allocations to wallet splits or verified social recipients.", state: "unconfigured", reason: "Requires the custom-pair beta, social vault, attestor and claim drills. It is not a Standard feature.", href: "/launch/custom", action: "Inspect fee routing in beta builder" },
    { id: "assisted", name: "AI Assisted", purpose: "Draft and research with an assistant while reviewing and signing actions yourself.", state: "planned", reason: "Assistant tools and transaction-review integration are not implemented." },
    { id: "agent", name: "Autonomous Agent", purpose: "Operate a project within explicitly enforced treasury permissions.", state: "planned", reason: "Needs a separate execution engine, onchain limits, monitoring and audit." },
    { id: "liquidity", name: "Managed Liquidity", purpose: "Operate a funded, bounded liquidity strategy with public execution receipts.", state: "planned", reason: "Strategy execution and risk controls are not implemented. No volume or price guarantee." },
    { id: "omnichain", name: "Omnichain", purpose: "Plan one global token supply across multiple chains.", state: "planned", reason: "Supply planner only. No deployed token, messaging route, payment or bridge is enabled.", href: "/launch/omnichain", action: "Open supply planner" },
  ];
}
