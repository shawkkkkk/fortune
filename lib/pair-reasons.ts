// Plain-language reasons and issuer-control notes for pair assets. Shared by
// the pair picker (client) and the asset pages (server).

export const REASON_TEXT: Record<string, string> = {
  MAINNET_ONLY: "Lives on BNB Smart Chain mainnet. This testnet alpha pairs only with its own valueless test assets.",
  NOT_IN_ACTIVE_REGISTRY: "Not approved in Fortune's onchain Asset Registry.",
  RWA_OUT_OF_SCOPE_V1: "Tokenized stocks, funds, commodities and pre-IPO tokens are outside the mainnet v1 asset policy.",
  REBASING_NEEDS_WRAPPER: "Balances follow a share multiplier. Fortune needs a non-rebasing wrapper before pairing.",
  STANDARD_MAINNET_WBNB_ONLY: "Standard launches on mainnet v1 pair with WBNB only.",
  EXTERNAL_PERP_REFERENCE: "An external perpetual market, not a BEP-20 token. Shown as a price reference.",
  NOT_ON_BNB_CHAIN: "Not deployed on BNB Chain. Shown as a price reference.",
  ASSET_INACTIVE: "The registry has this asset switched off.",
  ORACLE_UNHEALTHY: "Its price oracle is stale or unhealthy right now.",
  QUOTE_DISABLED: "Not enabled as a payment asset.",
  GRADUATION_DISABLED: "Not enabled for graduation pools.",
  UNSUPPORTED_CHAIN: "Unsupported network.",
};

/** What each issuer control means for a holder, in one line. */
export const CONTROL_TEXT: Record<"upgradeable" | "pausable" | "rebasing", { on: string; off: string }> = {
  upgradeable: {
    on: "Upgradeable: the issuer can replace the contract's code behind a proxy.",
    off: "Not upgradeable: the contract's code is fixed.",
  },
  pausable: {
    on: "Pausable: the issuer can stop all transfers.",
    off: "No pause switch found.",
  },
  rebasing: {
    on: "Rebasing: balances follow a share multiplier, for example after splits or dividends.",
    off: "Fixed balances: no share multiplier.",
  },
};

/**
 * Whether an asset's price follows US exchange hours: tokenized stocks and
 * ETFs, and commodity tokens that wrap a listed ETF. Physical-gold tokens
 * (Tether, Matrixdock) and pre-IPO claims do not.
 */
export function tracksUsSession(asset: { kind: string; provider: string | null }) {
  return asset.kind === "stock" || asset.kind === "etf" || (asset.kind === "commodity" && asset.provider !== "Tether" && asset.provider !== "Matrixdock");
}
