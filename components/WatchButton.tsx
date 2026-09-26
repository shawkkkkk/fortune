"use client";

import { useLanguage } from "@/components/LanguageProvider";
import { FORTUNE_NETWORK } from "@/lib/fortune-network";
import { useWatchlist } from "@/lib/watchlist";

/** Star toggle for the browser-local watchlist. */
export default function WatchButton({ token, symbol, className = "" }: { token: string; symbol: string; className?: string }) {
  const { language } = useLanguage();
  const zh = language === "zh";
  const { has, toggle, available } = useWatchlist(FORTUNE_NETWORK.chainId);
  const watching = has(token);
  if (!available) return null;
  const label = watching
    ? (zh ? `从关注列表移除 ${symbol}` : `Remove ${symbol} from watchlist`)
    : (zh ? `将 ${symbol} 加入关注列表` : `Add ${symbol} to watchlist`);
  return (
    <button
      type="button"
      className={"watchButton" + (watching ? " watching" : "") + (className ? " " + className : "")}
      aria-pressed={watching}
      aria-label={label}
      title={label}
      translate="no"
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        toggle(token);
      }}
    >
      <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
        <path
          d="M10 1.8l2.47 5.01 5.53.8-4 3.9.94 5.5L10 14.4l-4.94 2.6.94-5.5-4-3.9 5.53-.8L10 1.8z"
          fill={watching ? "currentColor" : "none"}
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}
