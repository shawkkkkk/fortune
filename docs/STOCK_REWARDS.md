# Stock Rewards (testnet beta)

A launch paired with one to five tokenized stocks, whose holders earn every one
of them. It is Fortune's answer to LESGO's Burn + Rewards mode, built for
several stocks at once and paid on-chain without a keeper. It is **unaudited**
and **BSC Testnet only**: the factory refuses to deploy on chain 56.

Contracts, tests and the deploy runbook live in
[`contracts-stock-rewards/`](../contracts-stock-rewards/README.md). Nothing in
`contracts/src` changed, so the Standard mainnet candidate and its fingerprint
are untouched.

## What holders get

Every stock the token contract receives is paid to holders, pro rata to
balance:

- the holder share (0.25–2.5%) of every curve trade, in the stock that trade used;
- the creator's share as well, if the creator hands it to holders (one-way);
- after graduation, the stock side of every PancakeSwap fee from the launch's locked pools;
- graduation dust, and anything else sent to the token.

The launch-token side of pool fees, and any launch tokens sent to the token
contract, are burned. Holders claim all stocks in one transaction whenever they
like.

## Design decisions

- **Streaming over six hours.** New funds stream to holders over six hours rather than landing at once, so buying just before a large payment (such as a fee collection) and selling right after earns almost nothing. This rules out flash-loan farming of accumulated pool fees, the classic attack on claim-based dividend tokens.
- **Fixed baskets only.** Each stock has a fixed share of the target, at least 10%. The Standard curve's adaptive mode is not offered. There, a few cents of one stock left in the reserve rounds its graduation weight to zero, and the frozen adapter then refuses to graduate. Fixed shares also guarantee a pool, and so rewards, for every stock.
- **Pool price range.** The frozen adapter only prices pools whose two amounts are within 2^64 of each other. Low-decimal or high-priced stocks therefore need a higher target, and the factory's preflight checks it with a 4× margin (`POOL_PRICE_RANGE`). All testnet stocks have 18 decimals.
- **Launch Shield tax to the protocol.** The opening 99% → 0 tax goes to the protocol, not holders, because the first holders are the snipers who paid it.
- **Fixed graduation fee tier.** The pool fee tier is fixed per launch (0.25% or 1%) and enforced at graduation, so a keeper cannot graduate into a low-fee pool that starves holders.
- **No owner power over launches.** The owner can only pause new launches and choose the protocol fee recipient for future launches.

## Website

| Where | What |
| --- | --- |
| `/launch/stock-rewards` | Launch form. Pick one to five stocks (Stocks and Penny stocks tabs, read from the registry), their shares, the target, the holder fee, the creator fee and the pool fee tier. A preflight mirrors the factory's checks, including the pool price range. |
| `/stock-rewards/{curve}` | Market page. Shows the basket with each stock's share and lifetime rewards. Trades with any stock whose share is not full, using exact quotes from the curve. Has a live rewards panel with one-click claim of every stock, plus starting new streams, pool-fee collection, graduation, rescue and the creator's one-way hand-off of their fee to holders. |
| `/rewards` | Every Stock Rewards token the connected wallet holds, with what it can claim in each. Also a public ledger of what each launch has paid its holders, read from the token contracts. |
| `/markets` | Explore board of Stock Rewards launches. |
| `/docs#stock-rewards` | How it works. |

Public API, all read live from BSC Testnet:

- `GET /api/public/v1/stock-rewards`: launches, newest first.
- `GET /api/public/v1/stock-rewards/stocks`: registry stocks with prices.
- `GET /api/public/v1/stock-rewards/{curve}`: one launch. Includes per-stock reserves, targets, prices, reward streams, pools and uncollected pool fees.

Graduation and pool-fee collection run inside the factory's try/catch. A wallet gas estimate would therefore settle on a limit at which the inner work runs out of gas and is caught. The site instead sends a fixed limit (`lib/graduation-gas.ts`), requires the simulated result to show success, and reads the curve afterwards. Every other call adds 30,000 gas per stock for the token's once-per-block release.

A browser rehearsal on a BSC Testnet fork covered the full path through the real pages: launch with a large cap and a penny stock, buys with each, rewards streaming and claimed in both stocks, both shares filled, graduation into two PancakeSwap V3 pools, a real swap, pool fees collected and claimed, Explore, `/rewards`, and Chinese, dark and mobile views (axe-clean, no overflow).

## Owner actions to go live on testnet

1. Run **Stock Rewards Beta Testnet Deploy + Drill** (Actions tab), typing `DEPLOY_STOCK_REWARDS_BETA`. It needs the existing `FORTUNE_TESTNET_PRIVATE_KEY` and `BSC_TESTNET_RPC_URL` secrets and about 0.1 tBNB. It deploys the registry, eight faucet test stocks (five large caps, three penny stocks) and the contracts. It then runs a real launch, graduation, swap, fee collection and claim.
2. Set `NEXT_PUBLIC_FORTUNE_STOCK_REWARDS_FACTORY_ADDRESS` in Vercel to the factory address in the run summary, and redeploy.

## Known limits

- **Testnet prices.** Test stock prices come from an owner-set test oracle. A mainnet version needs real stock tokens and real stock oracles, including feeds that stay fresh through weekends.
- **A stock that rallies alone.** If one stock rallies enough to fill the whole target before anyone pays with another, graduation fails. The seven-day rescue then returns everyone's stocks.
- **Gas.** The first transfer of the token in each block pays about 16,000 gas per stock with an active stream. Front-ends that estimate gas with tight margins can fail on four- or five-stock tokens. The website adds headroom.
