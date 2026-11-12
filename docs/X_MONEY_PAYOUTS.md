# X Money creator payouts

Status: isolated adapter and public preview; disabled by default. M04/M08/P20/P24 slice. Updated 2026-11-12.

Fortune pins `@zkp2p/cash@0.8.0` for an optional creator-fee offramp from
canonical Base USDC to USD delivered through X Money. The provider uses the
creator-fee owner as the maker: Base USDC is deposited into the protocol, a
matched buyer sends USD, and a verified payment proof releases the USDC. The
live oracle rate binds when a buyer signals an intent; an estimate is not a
locked USD quote.

This adapter does **not** make the current BSC social-fee vault claimless. That
vault still credits pair-token balances to an identity and only its bound wallet
can claim. Collecting/claiming those balances, converting or bridging them into
canonical Base USDC, and operating the custody wallet are separate steps that
need an approved custody design, exact asset route, accounting and recovery
evidence. The X Money adapter begins only after a specific amount of canonical
Base USDC is confirmed and reconciled on Base.

## Integrated surface

- `GET /api/public/v1/xmoney/status` exposes the pinned provider capability,
  destination asset, environment and whether server-side unsigned preparation
  is enabled. It does not contact a wallet or create an order.
- `POST /api/public/v1/xmoney/preview` canonicalizes the X handle, amount,
  Base settlement transaction and requested checks into a stable plan. Caller
  assertions are not evidence, and `transactionReady` is always `false`.
- `lib/xmoney-payout-server.ts` is the only preparation boundary. When enabled,
  it calls the provider's `prepare()` path and returns unsigned Base
  transactions. It does not sign, broadcast or retry them. The function requires
  a second operator authorization object whose approved cap, settlement hash,
  custody policy and recipient-screening references match the plan.
- The same server adapter exposes X Money receipt-inbox connection preparation,
  connection status, prepared-order finalization and order reads. These are not
  public write endpoints.
- `reconcileXMoneyReceipt()` marks a Fortune receipt verified only when the
  provider reports an X Money/USD payout, the whole order is delivered, no funds
  were returned, and every released fill has verified USD, payment-id and time
  evidence.

## Required checks before preparation

1. Fortune's existing X ownership proof is current and pins the permanent X id.
2. The creator confirms X Money is enabled. A valid X handle alone does not prove
   enrollment or eligibility.
3. The optional hosted receipt connection is active so later USD receipt
   evidence can be checked without mailbox credentials entering Fortune.
4. Live recipient screening and regional eligibility pass.
5. The BSC fee liability was collected and converted under an approved custody
   policy, with the exact Base USDC settlement transaction reconciled.
6. A current owner/operator authorization names the amount cap and recovery path.

The provider currently reports that the matched buyer appears as the sender and
that Fortune can be named in the X Money note. This is an operational assumption
from the owner's provider conversation, not an end-to-end result. Verify the
actual sender, note and receipt fields in preproduction before a live canary.

## Configuration

| Variable | Default | Meaning |
| --- | --- | --- |
| `FORTUNE_XMONEY_ENVIRONMENT` | `preproduction` | `staging`, `preproduction` or `production` provider contracts/services. |
| `FORTUNE_XMONEY_PREPARE_ENABLED` | off | Allows the server-only function to prepare unsigned Base transactions. It does not expose a public prepare endpoint. |
| `FORTUNE_XMONEY_PRODUCTION_CANARY_ENABLED` | off | Additional production-only gate. It still requires the per-order approval object and cap. |

No provider API key or wallet key is added here. If either becomes necessary,
provision it only in managed server storage and update the threat model first.

## Failure and retry rules

- Persist the Base settlement evidence before preparation and persist the
  provider `depositId` immediately after the confirmed create-deposit receipt is
  finalized.
- A missing transaction hash or unknown receipt is uncertain, not failed. Read
  chain and provider order state before retrying; never create a second order
  merely because an HTTP call timed out.
- An unmatched order is recovered with the provider's state-aware withdrawal
  path. Never call escrow internals directly.
- Indexer lag immediately after a confirmed deposit is not proof that the order
  disappeared. Keep the confirmed chain receipt and retry the read.
- Partial fills remain liabilities until the remaining deposit is filled or
  withdrawn. Receipt totals are derived from provider fill evidence, not from
  Fortune's own USD estimate.

## Still blocked

- approved custody and signer policy for collecting BSC social-fee liabilities;
- audited BSC-token to Base-USDC conversion/bridge route and loss accounting;
- durable private payout ledger with idempotency, restart, reorg and partial-fill
  recovery;
- preproduction end-to-end receipt showing actual USD arrival in an enrolled X
  Money account;
- privacy/terms/legal review and incident/withdrawal operations;
- independent security review and explicit production-canary authorization.

Until those are complete, this is real SDK integration and an unsigned
preparation boundary—not a live automatic payout service.
