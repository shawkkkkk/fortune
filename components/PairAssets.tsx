import { FORTUNE_NETWORK } from "@/lib/fortune-network";
import { assetCoinStyle, assetColor, formatAmount, formatPrice, formatUsd, shortAddress } from "@/lib/market-format";

export type PairAssetView = {
  address: string;
  symbol: string;
  name: string;
  priceUsd: number | null;
  weightBps: number | null;
  reserve: string | null;
  reserveUsd: number | null;
  pool: { address: string; dex: "pancake-v3" | "pancake-v2"; feeTier: number | null; liquidityUsd: number | null } | null;
};

function Coin({ symbol, size = "md" }: { symbol: string; size?: "sm" | "md" }) {
  return (
    <span className={"pairCoin pairCoin-" + size} style={assetCoinStyle(symbol)} aria-hidden="true">
      {symbol.replace(/^W(?=BNB)/, "").slice(0, size === "sm" ? 1 : 2)}
    </span>
  );
}

/** Compact stack for Explore cards: which assets a launch trades against. */
export function PairChips({ pairs, zh = false }: { pairs: Array<Pick<PairAssetView, "address" | "symbol">>; zh?: boolean }) {
  if (!pairs.length) return null;
  return (
    <div className="pairChips" translate="no" aria-label={(zh ? "配对资产：" : "Paired with ") + pairs.map((pair) => pair.symbol).join(", ")}>
      <span className="pairChipStack" aria-hidden="true">
        {pairs.slice(0, 5).map((pair) => <Coin key={pair.address} symbol={pair.symbol} size="sm" />)}
      </span>
      <span className="pairChipLabel" translate="no">{pairs.map((pair) => pair.symbol).join(" · ")}</span>
    </div>
  );
}

function dexLabel(pool: NonNullable<PairAssetView["pool"]>) {
  const fee = pool.feeTier !== null ? " · " + (pool.feeTier / 10_000).toString() + "%" : "";
  return (pool.dex === "pancake-v3" ? "Pancake V3" : "Pancake V2") + fee;
}

/** Full breakdown for token and market pages. */
export function PairAssetsPanel({ pairs, graduated, zh = false }: { pairs: PairAssetView[]; graduated: boolean; zh?: boolean }) {
  const weighted = pairs.every((pair) => pair.weightBps !== null) && pairs.length > 0;
  return (
    <section className="panel pairPanel">
      <span className="eyebrow">PAIR ASSETS</span>
      {pairs.length === 1 ? <h2>Paired with one asset</h2> : <h2 translate="no">{zh ? `与 ${pairs.length} 种资产配对` : `Paired with ${pairs.length} assets`}</h2>}
      <p className="pairPanelLead">
        {graduated
          ? "Each pair asset now trades in its own official Pancake pool, holding Fortune's permanently locked liquidity."
          : "Buyers pay in these assets on the Fortune curve. At graduation each one gets its own Pancake pool."}
      </p>

      {weighted && pairs.length > 1 ? (
        <div className="pairWeightBar" role="img" aria-label={(zh ? "毕业权重：" : "Graduation weights: ") + pairs.map((pair) => `${pair.symbol} ${(pair.weightBps! / 100).toFixed(1)}%`).join(", ")}>
          {pairs.map((pair) => (
            <span key={pair.address} style={{ width: pair.weightBps! / 100 + "%", background: assetColor(pair.symbol) }} />
          ))}
        </div>
      ) : null}

      <ul className="pairList">
        {pairs.map((pair) => (
          <li key={pair.address}>
            <Coin symbol={pair.symbol} />
            <div className="pairIdentity">
              <strong translate="no">{pair.symbol}</strong>
              <span translate="no">{pair.name}</span>
              <a href={`${FORTUNE_NETWORK.explorerUrl}/token/${pair.address}`} target="_blank" rel="noreferrer" className="pairAddress" translate="no">
                {shortAddress(pair.address)} ↗
              </a>
            </div>
            <dl className="pairFacts">
              {pair.weightBps !== null ? (
                <div><dt>Graduation weight</dt><dd>{(pair.weightBps / 100).toFixed(pair.weightBps % 100 ? 1 : 0)}%</dd></div>
              ) : null}
              <div><dt>Asset price</dt><dd>{formatPrice(pair.priceUsd)}</dd></div>
              {pair.pool ? (
                <div>
                  <dt>{dexLabel(pair.pool)}</dt>
                  <dd>
                    <a href={`${FORTUNE_NETWORK.explorerUrl}/address/${pair.pool.address}`} target="_blank" rel="noreferrer" translate="no">
                      {formatUsd(pair.pool.liquidityUsd)} {zh ? "流动性" : "liquidity"} ↗
                    </a>
                  </dd>
                </div>
              ) : pair.reserve !== null ? (
                <div><dt>Curve reserve</dt><dd translate="no">{formatAmount(Number(pair.reserve))} {pair.symbol}{pair.reserveUsd !== null ? ` · ${formatUsd(pair.reserveUsd)}` : ""}</dd></div>
              ) : null}
            </dl>
          </li>
        ))}
      </ul>

      <p className="pairRewardsNote">
        Pair-asset holder rewards are in development (Burn + Rewards v2). Standard launches do not pay holder rewards.
      </p>
    </section>
  );
}
