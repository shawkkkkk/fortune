import Link from "next/link";
import { formatAmount, formatHours, formatShare as percent, shortAddress } from "@/lib/market-format";

export type CreatorView = {
  address: string;
  launches: number | null;
  phases: { curve: number; ready: number; graduated: number; rescued: number } | null;
  holdsShare: number | null;
  flow: {
    sent: number;
    received: number;
    sentShare: number | null;
    transfersOut: number;
    coverage: { fromTimestamp: number; toTimestamp: number; complete: boolean };
  } | null;
};

// Shares at or above these read as worth a second look; the page states facts, not verdicts.
const NOTABLE_HOLDING = 0.1;
const NOTABLE_OUTFLOW = 0.01;

/** The creator's record across Fortune, what they hold now, and what has left their wallet. */
export default function CreatorCheck({ creator, symbol, zh = false }: { creator: CreatorView; symbol: string; zh?: boolean }) {
  const launches = creator.launches;
  const phases = creator.phases;
  const rate = launches && phases ? Math.round((phases.graduated / launches) * 100) : null;
  const flow = creator.flow;
  const span = flow ? (flow.coverage.complete ? null : formatHours(flow.coverage.toTimestamp - flow.coverage.fromTimestamp, zh)) : null;

  return (
    <section className="panel creatorCheck" aria-label={zh ? "创建者检查" : "Creator check"}>
      <span className="eyebrow">CREATOR CHECK</span>
      <h2>Know who launched it</h2>
      <p className="creatorCheckWho">
        <Link className="profileLink" href={`/profile/${creator.address}`} translate="no">{shortAddress(creator.address)}</Link>
      </p>
      <div className="metricsGrid four">
        <div className="metric">
          <span>Launches on Fortune</span>
          <strong translate="no">{launches ?? "—"}</strong>
          <small translate="no">
            {launches === null || !phases
              ? (zh ? "暂时无法读取" : "Unavailable right now")
              : launches === 1
                ? (zh ? "首次发行" : "First launch")
                : zh
                  ? `已毕业 ${phases.graduated} · 已救援 ${phases.rescued}`
                  : `${phases.graduated} graduated · ${phases.rescued} rescued`}
          </small>
        </div>
        <div className="metric">
          <span>Graduation rate</span>
          <strong translate="no">{rate === null ? "—" : `${rate}%`}</strong>
          <small>Across all their launches</small>
        </div>
        <div className="metric" data-notable={creator.holdsShare !== null && creator.holdsShare >= NOTABLE_HOLDING || undefined}>
          <span>Holds now</span>
          <strong translate="no">{creator.holdsShare === null ? "—" : percent(creator.holdsShare)}</strong>
          <small>Of total supply</small>
        </div>
        <div className="metric" data-notable={flow?.sentShare != null && flow.sentShare >= NOTABLE_OUTFLOW || undefined}>
          <span>Moved out</span>
          <strong translate="no">{flow?.sentShare == null ? "—" : percent(flow.sentShare)}</strong>
          <small translate="no">
            {!flow
              ? (zh ? "转账记录暂不可用" : "Transfer history unavailable")
              : span === null
                ? (zh ? `自发行以来 · ${formatAmount(flow.sent)} ${symbol}` : `Since launch · ${formatAmount(flow.sent)} ${symbol}`)
                : (zh ? `最近 ${span} · ${formatAmount(flow.sent)} ${symbol}` : `Last ${span} · ${formatAmount(flow.sent)} ${symbol}`)}
          </small>
        </div>
      </div>
      <p className="fieldHint">Moved out counts every transfer of this token out of the creator&apos;s wallet: sales on the curve, sales on PancakeSwap and plain transfers. An address is public onchain data, not a verified identity.</p>
      {span !== null ? (
        <p className="fieldHint" translate="no">{zh
          ? `当前日志服务只保留最近 ${span} 的记录，因此更早的转出无法计入。`
          : `The current log provider keeps the last ${span} only, so earlier transfers out are not counted.`}</p>
      ) : null}
    </section>
  );
}
