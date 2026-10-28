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
  UPGRADEABLE: { title: "Proxy target detected", detail: "Code delegates through a recognized proxy pattern or slot. This does not establish whether the target can change or who controls it." },
  PAUSABLE: { title: "Pause-related selectors detected", detail: "Known pause selectors appear in bytecode. Their availability and permission checks need review; a working pause could stop transfers." },
  BLACKLIST: { title: "Blacklist-related selectors detected", detail: "Known blacklist selectors appear in bytecode. This scan does not prove which addresses can be blocked or who can do it." },
  FEE_CHANGEABLE: { title: "Fee-related selectors detected", detail: "Known fee-setting selectors appear in bytecode. Their permissions, limits and effect on transfers need review." },
  TRANSFER_LIMITS: { title: "Limit-related selectors detected", detail: "Known transaction or wallet-limit selectors appear in bytecode. Effective limits and exemptions are not established by this scan." },
  REBASING: { title: "Share or rebase selectors detected", detail: "Known share or rebase selectors appear in bytecode. Actual balance behavior and its effect on reserves need review." },
  MINTABLE: { title: "Mint-related selectors detected", detail: "Known mint selectors appear in bytecode. This does not establish whether minting is reachable or who can authorize it." },
  HAS_OWNER: { title: "Owner address returned", detail: "An owner getter returned a nonzero address. Other roles and the address's actual powers remain unverified." },
  NO_HOLDER_FOUND: { title: "Transfers not simulated", detail: "No balance could be found to simulate with. Connect a wallet that holds this token and check again. Launch stays blocked until the simulation succeeds." },
  SIMULATED_FROM_POOL: {
    title: "Simulated from a DEX pool",
    detail: "The only balance found was in a DEX pool, where some tokens apply their own trading tax.",
  },
  SIMULATION_UNAVAILABLE: { title: "Simulation unavailable", detail: "The network did not answer the transfer simulation. Launch stays blocked; try again in a minute." },
  VERIFIED_STOCK_TOKEN: {
    title: "Verified tokenized stock",
    detail: "This is the issuer's tokenized stock contract that Fortune tracks. It gives price exposure to the listed share, not ownership, votes or dividends, and the company has not endorsed launches paired with it.",
  },
  IMITATES_STOCK_TOKEN: {
    title: "Imitates a tokenized stock",
    detail: "It copies a verified stock token's symbol, or a listed company's name together with its ticker, but it is not that issuer contract. A memecoin paired with a counterfeit stock token was used to move a real Nasdaq stock in 2026. Fortune does not pair with it.",
  },
  UNVERIFIED_STOCK_TOKEN: {
    title: "Unverified tokenized stock",
    detail: "It presents itself as a tokenized stock, but it is not one of the issuer contracts Fortune has verified. It may be an issuer token Fortune has not reviewed yet, or a counterfeit. Fortune does not pair with it.",
  },
  SHARES_STOCK_NAME: {
    title: "Shares a listed company's name or ticker",
    detail: "It is not one of the tokenized stocks Fortune has verified.",
  },
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
  clear: { label: "No issue detected in this simulation", detail: "No transfer tax measured or known control selectors detected at the reported block. Unknown controls and future behavior remain unverified." },
  caution: { label: "Simulation has warnings", detail: "Read every warning. A successful simulated transfer does not establish future compatibility or token safety." },
  unsupported: { label: "Not supported", detail: "A custom-pair curve could not trade this token safely." },
} as const;

export function formatTaxBps(bps: number | null | undefined) {
  if (bps === null || bps === undefined) return "—";
  if (bps === 0) return "0%";
  return (bps / 100).toFixed(bps % 100 === 0 ? 0 : 2) + "%";
}
