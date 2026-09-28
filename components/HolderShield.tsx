"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { formatUnits } from "viem";
import type { HolderView } from "@/lib/holder-index";
import { formatAge, formatAmount, formatShare as percent, shortAddress } from "@/lib/market-format";

type HoldersData = { enabled: false } | { enabled: true; token: string; creator: string; view: HolderView | null };

// Shares at or above these read as worth a second look; the page states facts, not verdicts.
const NOTABLE_TOP = 0.5;
const NOTABLE_EARLY = 0.1;

/**
 * Who holds a launch, from Fortune's holder index: the holder count, the top
 * ten, and what the first 15 seconds of buyers took and still hold. Renders
 * nothing when the index is off or does not cover this launch.
 */
export default function HolderShield({ token, pairs, zh = false }: { token: string; pairs: Array<{ address: string; symbol: string }>; zh?: boolean }) {
  const [data, setData] = useState<HoldersData | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/public/v1/holders/${token}`, { cache: "no-store" });
      const body = (await response.json()) as { data?: HoldersData };
      if (response.ok && body.data) setData(body.data);
    } catch {
      // Keep the last view; the next refresh tries again.
    }
  }, [token]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 60_000);
    return () => window.clearInterval(timer);
  }, [load]);

  if (!data?.enabled || !data.view) return null;
  const view = data.view;
  if (view.status !== "tracked") {
    if (view.status === "untracked" || view.status === "pending") return null;
    return (
      <section className="panel holderShield" aria-label={zh ? "持有人" : "Holders"}>
        <span className="eyebrow">HOLDER SHIELD</span>
        <h2>Who holds it</h2>
        <p className="fieldHint">Holder data for this launch is paused: the index is missing part of its transfer history. It returns once the addresses it knows add up to the whole supply again.</p>
      </section>
    );
  }

  const creator = data.creator.toLowerCase();
  const shield = view.shield;
  const symbols = new Map(pairs.map((pair) => [pair.address.toLowerCase(), pair.symbol]));
  const taxText = shield?.tax
    .filter((row) => BigInt(row.amount) > 0n)
    .map((row) => `${formatAmount(Number(formatUnits(BigInt(row.amount), 18)))} ${symbols.get(row.asset) ?? shortAddress(row.asset)}`)
    .join(" + ");

  return (
    <section className="panel holderShield" aria-label={zh ? "持有人" : "Holders"}>
      <span className="eyebrow">HOLDER SHIELD</span>
      <h2>Who holds it</h2>
      <div className="metricsGrid four">
        <div className="metric">
          <span>Holders</span>
          <strong translate="no">{view.holders.toLocaleString("en-US")}</strong>
          <small>Wallets with any balance</small>
        </div>
        <div className="metric" data-notable={view.topShare !== null && view.topShare >= NOTABLE_TOP || undefined}>
          <span>Top 10 hold</span>
          <strong translate="no">{view.topShare === null ? "—" : percent(view.topShare)}</strong>
          <small>Of total supply</small>
        </div>
        <div className="metric">
          <span>First 15 seconds</span>
          <strong translate="no">{shield?.share == null ? "—" : percent(shield.share)}</strong>
          <small translate="no">{shield
            ? (zh ? `${shield.buys} 笔买入 · ${shield.wallets} 个钱包` : `${shield.buys} buys · ${shield.wallets} wallets`)
            : (zh ? "开盘窗口内没有买入" : "No buys in the opening window")}</small>
        </div>
        <div className="metric" data-notable={shield?.holdingShare != null && shield.holdingShare >= NOTABLE_EARLY || undefined}>
          <span>Early buyers hold now</span>
          <strong translate="no">{shield?.holdingShare == null ? "—" : percent(shield.holdingShare)}</strong>
          <small translate="no">{shield
            ? (zh ? `${shield.checked} 个钱包中 ${shield.stillHolding} 个仍持有` : `${shield.stillHolding} of ${shield.checked} wallets still hold`)
            : "—"}</small>
        </div>
      </div>

      {view.top.length ? (
        <ol className="holderTop">
          {view.top.map((row, index) => (
            <li key={row.address}>
              <span className="holderRank" translate="no">{index + 1}</span>
              <Link className="profileLink" href={`/profile/${row.address}`} translate="no">{shortAddress(row.address)}</Link>
              <span className="holderTags">
                {row.address === creator ? <span className="holderTag">Creator</span> : null}
                {row.early ? <span className="holderTag holderTagEarly">First 15 s</span> : null}
              </span>
              <strong translate="no">{row.share === null ? "—" : percent(BigInt(row.balance) > 0n ? Math.max(row.share, 1e-9) : 0)}</strong>
            </li>
          ))}
        </ol>
      ) : null}

      {shield && shield.taxedBuys > 0 ? (
        <p className="fieldHint" translate="no">{zh
          ? `${shield.taxedBuys} 笔买入支付了防狙击税${taxText ? `（共 ${taxText}），进入本次发行的流动性金库` : ""}。`
          : `${shield.taxedBuys} ${shield.taxedBuys === 1 ? "buy" : "buys"} paid the Launch Shield tax${taxText ? ` (${taxText} in total, kept by this launch's liquidity vault)` : ""}.`}</p>
      ) : null}
      <p className="fieldHint" translate="no">{zh
        ? `统计自发行以来的每一笔转账，已确认至区块 ${view.indexedTo}${view.updatedAt ? `（${formatAge(view.updatedAt, true)}更新）` : ""}。曲线、官方池、Fortune 金库和销毁地址虽然持有代币，但不是持有人，因此不计入。`
        : `Every transfer since launch, confirmed to block ${view.indexedTo}${view.updatedAt ? ` (updated ${formatAge(view.updatedAt)})` : ""}. The curve, official pools, Fortune vaults and burn addresses hold tokens but are not holders, so they are left out.`}</p>
      {view.reconciledAt ? (
        <p className="fieldHint" translate="no">{zh
          ? `由于日志历史存在缺口，余额已在区块 ${view.reconciledAt} 按链上数据重建，并与总供应量完全吻合。`
          : `Balances were rebuilt from the chain at block ${view.reconciledAt} after a gap in the log history, and matched the total supply exactly.`}</p>
      ) : null}
    </section>
  );
}
