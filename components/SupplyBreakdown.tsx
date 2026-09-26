import { formatAmount, formatShare as percent } from "@/lib/market-format";

export type SupplyView = {
  total: number;
  slices: Array<{ key: "curve" | "pools" | "creator" | "vaults" | "burned" | "holders"; amount: number; share: number }>;
};

const LABELS: Record<SupplyView["slices"][number]["key"], [string, string]> = {
  curve: ["Unsold on the curve", "曲线上未售出"],
  pools: ["Locked in Pancake pools", "锁定在 Pancake 池中"],
  creator: ["Creator wallet", "创建者钱包"],
  vaults: ["Fortune vaults", "Fortune 金库"],
  burned: ["Burned", "已销毁"],
  holders: ["Everyone else", "其他所有地址"],
};



/** Where the supply sits right now, from balances read at the market snapshot block. */
export default function SupplyBreakdown({ supply, zh = false }: { supply: SupplyView; zh?: boolean }) {
  // The creator's share is always shown, even at zero; vault and burn rows that round to nothing are hidden.
  const rows = supply.slices.filter((slice) => slice.share > 0 || slice.key === "creator" || slice.key === "holders");
  const label = (key: SupplyView["slices"][number]["key"]) => LABELS[key][zh ? 1 : 0];
  return (
    <section className="panel supplyPanel">
      <span className="eyebrow">SUPPLY</span>
      <h2>Where the supply sits</h2>
      <div className="supplyBar" role="img" aria-label={rows.map((slice) => `${label(slice.key)} ${percent(slice.share)}`).join(", ")}>
        {supply.slices.filter((slice) => slice.share > 0).map((slice) => (
          <span key={slice.key} className={"supplySlice supplySlice-" + slice.key} style={{ width: `${Math.max(slice.share * 100, 0.6)}%` }} />
        ))}
      </div>
      <ul className="supplyLegend">
        {rows.map((slice) => (
          <li key={slice.key}>
            <i className={"supplySlice supplySlice-" + slice.key} aria-hidden="true" />
            <span translate="no">{label(slice.key)}</span>
            <strong translate="no">{percent(slice.share)}</strong>
            <small translate="no">{formatAmount(slice.amount)}</small>
          </li>
        ))}
      </ul>
      <p className="fieldHint">Balances of the curve, the creator, Fortune&apos;s vaults, the official pools and burn addresses, read onchain at the same block. Everyone else covers every other wallet and contract.</p>
    </section>
  );
}
