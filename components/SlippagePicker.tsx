"use client";

import { useCallback, useEffect, useState } from "react";
import { useLanguage } from "@/components/LanguageProvider";
import { DEFAULT_SLIPPAGE_BPS, MAX_SLIPPAGE_BPS, SLIPPAGE_PRESETS_BPS, formatBps, parseSlippagePercent } from "@/lib/trade-math";

const STORAGE_KEY = "fortune-slippage-bps";

/** The trader's slippage tolerance in bps, remembered in this browser. */
export function useSlippage(): [number, (bps: number) => void] {
  const [bps, setBps] = useState(DEFAULT_SLIPPAGE_BPS);
  useEffect(() => {
    try {
      const stored = Number(window.localStorage.getItem(STORAGE_KEY));
      if (stored > 0 && stored <= MAX_SLIPPAGE_BPS) setBps(stored);
    } catch {
      // Storage can be unavailable (private windows); the default applies.
    }
  }, []);
  const update = useCallback((next: number) => {
    setBps(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, String(next));
    } catch {
      // The choice still applies to this page.
    }
  }, []);
  return [bps, update];
}

export default function SlippagePicker({ value, onChange }: { value: number; onChange: (bps: number) => void }) {
  const { language } = useLanguage();
  const zh = language === "zh";
  const [custom, setCustom] = useState("");
  const preset = (SLIPPAGE_PRESETS_BPS as readonly number[]).includes(value) && !custom;
  return (
    <div className="slippageRow" role="group" aria-label={zh ? "滑点" : "Slippage"}>
      <span className="mutedSmall">{zh ? "滑点" : "Slippage"}</span>
      {SLIPPAGE_PRESETS_BPS.map((bps) => (
        <button key={bps} type="button" aria-pressed={preset && value === bps} onClick={() => { setCustom(""); onChange(bps); }}>{formatBps(bps)}</button>
      ))}
      <input
        aria-label={zh ? "自定义滑点，百分比" : "Custom slippage, percent"}
        value={custom || (!preset ? String(value / 100) : "")}
        placeholder={zh ? "自定义" : "Custom"}
        inputMode="decimal"
        onChange={(event) => {
          setCustom(event.target.value);
          const parsed = parseSlippagePercent(event.target.value);
          if (parsed !== null) onChange(parsed);
        }}
      />
    </div>
  );
}
