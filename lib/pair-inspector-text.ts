// Plain-language explanations for pair-inspector findings. Client-safe.

export const FINDING_TEXT: Record<string, { title: string; detail: string }> = {
  NO_CONTRACT: { title: "Not a token contract", detail: "There is no contract code at this address on this network." },
  NOT_ERC20: { title: "Not a readable BEP-20", detail: "decimals() or totalSupply() did not answer, so a curve cannot price it." },
  DECIMALS_UNSUPPORTED: { title: "Too many decimals", detail: "Custom pairs support up to 36 decimals." },
  TRANSFER_REVERTS: {
    title: "Transfers fail",
    detail: "At least one transfer the curve needs reverted: the token may be paused, restricted to approved wallets, or block contracts.",
  },
  NOTHING_ARRIVES: { title: "Nothing arrives", detail: "A transfer went through but the recipient received nothing (a 100% tax)." },
  TAX_ON_TOP: {
    title: "Tax charged on top",
    detail: "The sender loses more than it sends. The curve can only absorb this from fees, so sells stop once fees run out.",
  },
  BUY_TAX: { title: "Tax when buying", detail: "Part of what a buyer sends never reaches the curve. Only what arrives buys tokens." },
  SELL_TAX: { title: "Tax when selling", detail: "Sellers receive less than the curve pays out. Slippage limits use what actually arrives." },
  POOL_TAX: { title: "Tax at graduation", detail: "The pool receives less than the curve sends. The pool is seeded at the curve price for what arrived." },
  TAX_OVER_25: { title: "Very high tax", detail: "More than 25% disappears on a transfer. Every trade loses that much in both directions." },
  UPGRADEABLE: { title: "Upgradeable contract", detail: "Its code can be replaced by an admin, so any behaviour here can change later." },
  PAUSABLE: { title: "Can be paused", detail: "An admin can stop transfers. Trading and graduation stop too; rescue opens after seven days." },
  BLACKLIST: { title: "Blacklist functions", detail: "An admin can block addresses, including a curve or its pool." },
  FEE_CHANGEABLE: { title: "Tax can change", detail: "An admin function can change the transfer tax after you launch." },
  TRANSFER_LIMITS: { title: "Transaction or wallet limits", detail: "Max-transaction or max-wallet rules can block large buys or the pool at graduation." },
  REBASING: { title: "Rebasing balances", detail: "Balances can grow or shrink on their own. Growth becomes pool liquidity; shrinkage hits fees first." },
  MINTABLE: { title: "Mintable", detail: "New supply can be minted by an authorised account." },
  HAS_OWNER: { title: "Has an owner", detail: "An owner address is set. Check what it can do on BscScan." },
  NO_HOLDER_FOUND: { title: "Transfers not simulated", detail: "No balance could be found to simulate with. Connect a wallet that holds this token and check again." },
  SIMULATED_FROM_POOL: {
    title: "Simulated from a DEX pool",
    detail: "The only balance found was in a DEX pool, where some tokens apply their own trading tax.",
  },
  SIMULATION_UNAVAILABLE: { title: "Simulation unavailable", detail: "The network did not answer the transfer simulation. Try again in a minute." },
};

export const CONTROL_LABELS: Record<string, string> = {
  pause: "Pause switch",
  blacklist: "Blacklist",
  feeChange: "Changeable tax",
  limits: "Tx or wallet limits",
  rebasing: "Rebasing",
  mint: "Mint function",
};

export const VERDICT_TEXT = {
  clear: { label: "Works as a custom pair", detail: "No transfer tax measured and no issuer controls found in its bytecode." },
  caution: { label: "Works, with warnings", detail: "The curve handles this token, but read every warning before launching." },
  unsupported: { label: "Not supported", detail: "A custom-pair curve could not trade this token safely." },
} as const;

export function formatTaxBps(bps: number | null | undefined) {
  if (bps === null || bps === undefined) return "—";
  if (bps === 0) return "0%";
  return (bps / 100).toFixed(bps % 100 === 0 ? 0 : 2) + "%";
}
