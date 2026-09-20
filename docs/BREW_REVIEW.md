# Brew review -> Fortune decisions

This note records engineering lessons taken from Brew's current BNB Chain launchpad documentation.

## What Brew gets right

- BNB-native PancakeSwap integration.
- A simple creator flow with optional first purchase.
- Permanent custody of launch LP positions.
- Pairing against BNB, USDT and compatible BSC tokens.
- Quote refresh before execution.
- Fixed-supply launch tokens with no post-launch mint.
- Multi-pair support, including a V2 path that records incremental pool completion.
- A one-way option to route creator economics toward holder-oriented buyback/burn behavior.

## What Fortune keeps different

### Curve first, pool later

Brew creates the PancakeSwap V3 pool at launch. Fortune deliberately starts on the shared Basket Curve and creates external pools only at graduation.

That gives Fortune one canonical price during price discovery and keeps bad destination-pool configuration out of the launch transaction.

### 1-5 assets share one market

Brew multi-pair launches create separate pools. Fortune's selected reserve assets all advance one canonical curve and one graduation threshold.

### Pair compatibility is capability based

Brew permits compatible BSC assets but warns that fee-on-transfer and rebasing tokens are unsupported.

Fortune treats compatibility as explicit capabilities:
- quote;
- reward;
- graduation.

A custom address goes through code/metadata/decimal inspection and still requires registry, oracle, transfer-accounting, liquidity and graduation approval before reserve custody.

### Decimal pinning

Fortune stores the quote token's decimals when the asset is approved and rejects later decimal drift. Curve economics never rely on a frontend hardcoding quote-token decimals.

### Final-buy partial fill

The last curve buy is clamped to the remaining graduation target and excess quote is refunded atomically. This avoids a tiny prior transaction causing the final buyer to overfund or unexpectedly revert.

### Graduation recovery

Fortune has:
- graduation preflight;
- atomic adapter execution;
- observable failure/retry telemetry;
- canonical graduation price anchor;
- permissionless reserve rescue after a seven-day stuck-graduation delay.

### Permanent LP custody

`FortunePermanentLiquidityLocker` is intended for graduation LP-position NFTs. Approved graduation adapters may deposit positions, but the locker intentionally exposes no withdrawal/transfer function. Fees can be harvested permissionlessly only to the position's fixed registered fee recipient.

### Creator fee surrender

Brew supports permanently redirecting creator economics toward holders.

Fortune keeps initial Fee Matrix terms immutable but allows a strictly one-way reduction in creator extraction: the creator can permanently surrender their existing creator share to the purpose-locked holder-reward vault. It can never be reversed.

### Stock/RWA specialization

Fortune adds stock-token discovery, NASDAQ Penny Stocks, China Stocks, Stock Floor and experimental Pre-IPO reference markets rather than treating all stock-linked assets as generic custom tokens.

### Reliability state

Fortune distinguishes:
- curve active;
- graduation ready;
- preflight failed;
- graduation retrying;
- pool created;
- liquidity verified;
- price continuity checked;
- indexing;
- trading live;
- rescued.

A pool address alone is not considered a healthy launch.

## Production rule

Do not copy a competitor contract address or assume a PancakeSwap deployment from documentation. Production adapters must use freshly verified BNB Chain/PancakeSwap deployments and independent review before mainnet.
