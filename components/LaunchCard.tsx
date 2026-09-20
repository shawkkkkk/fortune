import Link from "next/link";
import type { FortuneLaunch } from "@/lib/types";

function money(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: value >= 1_000_000 ? "compact" : "standard",
    maximumFractionDigits: value >= 1_000_000 ? 2 : 0,
  }).format(value);
}

export default function LaunchCard({ launch }: { launch: FortuneLaunch }) {
  return (
    <Link href={`/token/${launch.id}`} className="launchCard">
      <div className="launchCardTop">
        <div className="tokenAvatar">{launch.symbol.slice(0, 2)}</div>
        <div>
          <div className="tokenTitle">
            <strong>{launch.name}</strong>
            <span>{launch.symbol}</span>
          </div>
          <div className="mutedSmall">by {launch.creator} · {launch.launchedAt}</div>
        </div>
        <span className={`statusPill status${launch.status}`}>{launch.status}</span>
      </div>

      <p className="launchDescription">{launch.description}</p>

      <div className="basketLine">
        {launch.quoteAssets.map((asset) => (
          <span key={asset} className="assetChip">{asset}</span>
        ))}
        <span className="poolCount">{launch.quoteAssets.length} market{launch.quoteAssets.length === 1 ? "" : "s"}</span>
      </div>

      <div className="marketStats">
        <div><span>Market cap</span><strong>{money(launch.marketCap)}</strong></div>
        <div><span>24h volume</span><strong>{money(launch.volume24h)}</strong></div>
        <div><span>Reward</span><strong>{launch.rewardAsset || "None"}</strong></div>
      </div>

      <div className="progressHeader">
        <span>Graduation</span>
        <strong>{launch.graduationProgress}%</strong>
      </div>
      <div className="progressTrack">
        <span style={{ width: `${launch.graduationProgress}%` }} />
      </div>
    </Link>
  );
}
