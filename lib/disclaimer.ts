// One source for the risk language shown in the entry dialog and on /docs#disclaimer.
// Raising ENTRY_CONSENT_VERSION asks every visitor to confirm again.

export const ENTRY_CONSENT_KEY = "fortune-entry-consent";
export const ENTRY_CONSENT_VERSION = "2026-09-25";

export const RISK_POINTS = [
  {
    title: "Trading risk",
    body: "Meme coins are speculative. Prices can swing sharply, liquidity can disappear and you can lose everything you trade.",
  },
  {
    title: "Not financial advice",
    body: "Fortune provides software and onchain data, not investment advice. Listings, rankings and charts are not endorsements, and no return is promised.",
  },
  {
    title: "Your responsibility",
    body: "Check every token, approval and transaction in your wallet. Contracts can fail, scams exist and confirmed transactions cannot be reversed. Network fees apply.",
  },
] as const;

export const TESTNET_POINT = {
  title: "Public testnet alpha",
  body: "Fortune currently runs on BSC Testnet with valueless test assets. The contracts are pre-audit and mainnet is disabled.",
} as const;

export const CONSENT_RISKS = "I understand these risks and take responsibility for my own transactions.";

// Eligibility terms come from Fortune's legal review (an open mainnet release gate),
// not from copying another platform's restrictions. See docs/BREW_REVIEW.md.
export const ELIGIBILITY_NOTE = "Eligibility and jurisdiction terms will come from Fortune's legal review, which is still an open mainnet release gate. Confirming this disclaimer does not replace that review.";
