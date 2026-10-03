"use client";

import { useEffect, useState } from "react";
import { createPublicClient, http, isAddress, parseAbi, type Address } from "viem";
import { bsc, bscTestnet } from "viem/chains";
import { FORTUNE_NETWORK } from "@/lib/fortune-network";
import { RULE_PRESETS, emptyRulesForm, formatDuration, marketCapMultiple, walletVestLength, type CapLevelForm, type LaunchRulesForm } from "@/lib/launch-rules";

const ERC20 = parseAbi(["function decimals() view returns (uint8)", "function symbol() view returns (string)"]);

export type GateTokenState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; decimals: number; symbol: string }
  | { status: "error" };

/** Decimals and symbol of the holder-gate token, read once it is a valid address. */
export function useGateToken(address: string): GateTokenState {
  const [state, setState] = useState<GateTokenState>({ status: "idle" });
  useEffect(() => {
    const value = address.trim();
    if (!isAddress(value)) {
      setState({ status: "idle" });
      return undefined;
    }
    let live = true;
    setState({ status: "loading" });
    const client = createPublicClient({ chain: FORTUNE_NETWORK.chainId === 56 ? bsc : bscTestnet, transport: http(FORTUNE_NETWORK.publicRpcUrl) });
    Promise.all([
      client.readContract({ address: value as Address, abi: ERC20, functionName: "decimals" }),
      client.readContract({ address: value as Address, abi: ERC20, functionName: "symbol" }).catch(() => "TOKEN"),
    ])
      .then(([decimals, symbol]) => live && setState({ status: "ready", decimals: Number(decimals), symbol: String(symbol).slice(0, 16) }))
      .catch(() => live && setState({ status: "error" }));
    return () => {
      live = false;
    };
  }, [address]);
  return state;
}

/** Optional launch rules: presets plus every setting, enforced by the token until graduation. */
export default function LaunchRulesEditor({
  enabled,
  onToggle,
  form,
  onChange,
  error,
  gateSymbol,
  zh = false,
}: {
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  form: LaunchRulesForm;
  onChange: (form: LaunchRulesForm) => void;
  error: string;
  gateSymbol: string | null;
  zh?: boolean;
}) {
  const set = (patch: Partial<LaunchRulesForm>) => onChange({ ...form, ...patch });
  // Presets combine; pressing an applied one clears just its settings. A preset also clears
  // the rules that would set the same cap, so it never leaves the form in conflict.
  const presetOn = (preset: Partial<LaunchRulesForm>) =>
    (Object.keys(preset) as (keyof LaunchRulesForm)[]).every((key) => JSON.stringify(form[key]) === JSON.stringify(preset[key]));
  const togglePreset = (preset: Partial<LaunchRulesForm>) => {
    if (!presetOn(preset)) return set(preset);
    const empty = emptyRulesForm();
    set(Object.fromEntries(Object.keys(preset).map((key) => [key, empty[key as keyof LaunchRulesForm]])) as Partial<LaunchRulesForm>);
  };
  const presetProps = (preset: Partial<LaunchRulesForm>) => ({
    type: "button" as const,
    "aria-pressed": presetOn(preset),
    className: presetOn(preset) ? "selectedMode" : undefined,
    onClick: () => togglePreset(preset),
  });
  const setLevel = (index: number, patch: Partial<CapLevelForm>) =>
    set({ levels: form.levels.map((level, i) => (i === index ? { ...level, ...patch } : level)) });
  const levelProgress = (value: string) => {
    const progress = Number(value);
    return Number.isFinite(progress) && progress > 0 && progress < 100 ? progress : null;
  };
  const vestHours = (value: string) => (Number.isFinite(Number(value)) ? Number(value) * 3_600 : 0);
  const walletVestTotal = form.walletVestPeriodHours.trim() && Number(form.walletVestUnlock) > 0
    ? walletVestLength(vestHours(form.walletVestCliffHours), vestHours(form.walletVestPeriodHours), Math.round(Number(form.walletVestUnlock) * 100))
    : 0;
  const field = (key: keyof LaunchRulesForm, label: string, placeholder: string, hint?: string) => (
    <label>
      <span>{label}</span>
      <input value={String(form[key])} inputMode="decimal" placeholder={zh ? ({ off: "关闭", none: "不限", "every buy": "每笔买入" } as Record<string, string>)[placeholder] ?? placeholder : placeholder} onChange={(event) => set({ [key]: event.target.value } as Partial<LaunchRulesForm>)} autoComplete="off" />
      {hint ? <small className="fieldHint">{hint}</small> : null}
    </label>
  );

  return (
    <fieldset className="launchRulesEditor">
      <legend>Launch rules · optional</legend>
      <label className="claimLinkSaved">
        <input type="checkbox" checked={enabled} onChange={(event) => onToggle(event.target.checked)} />
        <span>Add rules to this launch</span>
      </label>
      <p className="fieldHint">The token itself enforces them on every transfer until graduation, and nobody can change them after launch: not you, not Fortune. Buyers see them before they trade.</p>
      {enabled ? (
        <>
          <div className="launchModeRow launchRulesPresets" role="group" aria-label={zh ? "预设" : "Presets"}>
            <button {...presetProps(RULE_PRESETS.fair)}>
              <strong>Fair launch</strong>
              <span>1% max wallet · 0.5% max buy · curve-only</span>
            </button>
            <button {...presetProps(RULE_PRESETS.antiDump)}>
              <strong>Anti-dump</strong>
              <span>0.25% max sell · 1 min between sells</span>
            </button>
            <button {...presetProps(RULE_PRESETS.vesting)}>
              <strong>Sniper vesting</strong>
              <span>First 60 s vest: 1 h cliff, then 24 h</span>
            </button>
          </div>
          <p className="fieldHint">{zh ? "HookedPad 式规则，同样由代币自身执行：" : "HookedPad-style rules, enforced by the token itself:"}</p>
          <div className="launchModeRow launchRulesPresets" role="group" aria-label={zh ? "HookedPad 式预设" : "HookedPad-style presets"}>
            <button {...presetProps(RULE_PRESETS.stockHours)}>
              <strong>Stock hours</strong>
              <span>Trades Mon–Fri, 9:30–4:00 New York time</span>
            </button>
            <button {...presetProps(RULE_PRESETS.whaleGuard)}>
              <strong>Whale guard</strong>
              <span>Bigger bags sell smaller pieces: 1% down to 0.1%</span>
            </button>
            <button {...presetProps(RULE_PRESETS.sliding)}>
              <strong>Sliding caps</strong>
              <span>Sell cap 1%, then 0.5% from 25% and 0.1% from 60%</span>
            </button>
            <button {...presetProps(RULE_PRESETS.slowOpen)}>
              <strong>Slow open</strong>
              <span>Max wallet 0.1%, +0.1% every 5 min</span>
            </button>
            <button {...presetProps(RULE_PRESETS.chapters)}>
              <strong>Chapters</strong>
              <span>Max wallet 1%, doubling every 1% traded</span>
            </button>
            <button {...presetProps(RULE_PRESETS.antiSniper)}>
              <strong>Anti-sniper</strong>
              <span>1 gwei gas cap for 10 min · 3 buys per block</span>
            </button>
            <button {...presetProps(RULE_PRESETS.holderVesting)}>
              <strong>Holder vesting</strong>
              <span>Each wallet: 24 h cliff, then 10% a day</span>
            </button>
          </div>
          <div className="launchRulesGrid">
            {field("maxWallet", "Max wallet · % of supply", "off", "0.5 to 10")}
            {field("maxBuy", "Max buy · % of supply", "off", "0.1 to 10")}
            {field("maxSell", "Max sell · % of supply", "off", "0.05 to 10")}
            {field("cooldownMinutes", "Wait between sells · minutes", "off", "Up to 1 day")}
          </div>
          <label className="claimLinkSaved">
            <input type="checkbox" checked={form.curveOnly} onChange={(event) => set({ curveOnly: event.target.checked })} />
            <span>Curve-only: no wallet-to-wallet transfers until graduation</span>
          </label>
          <details className="launchRulesMore" open={Boolean(form.vestingWindowSeconds)}>
            <summary>Early-buyer vesting</summary>
            <div className="launchRulesGrid">
              {field("vestingWindowSeconds", "Buys in the first · seconds", "off", "Up to 1 day, and no longer than the lock plus the unlock. Your own first buy counts.")}
              {field("vestingCliffHours", "Locked until · hours after launch", "0")}
              {field("vestingDurationHours", "Then unlocks over · hours", "0", "Cliff plus unlock: 30 days at most")}
            </div>
          </details>
          <details className="launchRulesMore" open={Boolean(form.allowlistMinutes || form.gateMinutes)}>
            <summary>Access window: an allowlist or holders first</summary>
            <div className="launchRulesGrid">
              {field("allowlistMinutes", "Allowlist only for · minutes", "off", "Up to 60")}
            </div>
            <label>
              <span>Allowlisted addresses</span>
              <textarea value={form.allowlist} rows={3} placeholder={zh ? "0x…，每行一个，最多 200 个" : "0x… one per line, up to 200"} onChange={(event) => set({ allowlist: event.target.value })} spellCheck={false} />
            </label>
            <div className="launchRulesGrid">
              <label>
                <span>Holders of token</span>
                <input value={form.gateToken} placeholder="0x…" onChange={(event) => set({ gateToken: event.target.value })} autoComplete="off" spellCheck={false} />
                {gateSymbol ? <small className="fieldHint" translate="no">{gateSymbol}</small> : null}
              </label>
              {field("gateMin", "Holding at least", "0")}
              {field("gateMinutes", "Holders only for · minutes", "off", "Up to 60")}
            </div>
            <p className="fieldHint">You, and exempt wallets, can always buy during these windows.</p>
          </details>
          <details className="launchRulesMore" open={form.marketHours}>
            <summary>Stock-market hours</summary>
            <label className="claimLinkSaved">
              <input type="checkbox" checked={form.marketHours} onChange={(event) => set({ marketHours: event.target.checked })} />
              <span>Trade on the curve only Monday to Friday, 9:30am to 4:00pm New York time</span>
            </label>
            {form.marketHours ? (
              <>
                <label className="claimLinkSaved">
                  <input type="checkbox" checked={form.marketSellsOpen} onChange={(event) => set({ marketSellsOpen: event.target.checked })} />
                  <span>Keep sells open around the clock</span>
                </label>
                <label className="claimLinkSaved">
                  <input type="checkbox" checked={form.marketIgnoreHolidays} onChange={(event) => set({ marketIgnoreHolidays: event.target.checked })} />
                  <span>Ignore stock-market holidays and early closes</span>
                </label>
              </>
            ) : null}
            <p className="fieldHint">Daylight saving time, NYSE holidays and its 1:00pm early closes are worked out onchain. Wallet-to-wallet sends always work, and nobody is exempt, you included: launch during the session if you want a first buy. The Launch Shield only covers the first seconds after launch, so consider the anti-sniper rules for the opening bell.</p>
          </details>
          <details className="launchRulesMore" open={Boolean(form.sellTierSmall || form.sellTierFloor || form.sellTierBag)}>
            <summary>Graduated sell caps</summary>
            <div className="launchRulesGrid">
              {field("sellTierSmall", "Small holders sell up to · % of supply", "off", "0.05 to 5")}
              {field("sellTierFloor", "Biggest bags sell up to · % of supply", "off", "0.01 to 1")}
              {field("sellTierBag", "Biggest bags hold · % of supply or more", "off", "0.5 to 10")}
            </div>
            <p className="fieldHint">A wallet holding up to the small holders' cap can sell all of it at once. Bigger bags get a smaller cap per sell, falling evenly to the floor. Applies to everyone, exempt wallets included.</p>
          </details>
          <details className="launchRulesMore" open={Boolean(form.levels.length || form.slideMaxBuy || form.slideMaxSell)}>
            <summary>Sliding caps</summary>
            <div className="launchRulesGrid">
              {field("slideMaxBuy", "Max buy at launch · % of supply", "none", "0.1 to 10, or empty for no cap")}
              {field("slideMaxSell", "Max sell at launch · % of supply", "none", "0.05 to 10, or empty for no cap")}
            </div>
            {form.levels.map((level, index) => {
              const progress = levelProgress(level.from);
              return (
                <div className="launchRulesGrid launchRulesLevel" key={index}>
                  <label>
                    <span>{zh ? `第 ${index + 1} 档 · 毕业进度 %` : `Level ${index + 1} · from graduation progress %`}</span>
                    <input value={level.from} inputMode="decimal" placeholder="25" onChange={(event) => setLevel(index, { from: event.target.value })} autoComplete="off" />
                    {progress ? <small className="fieldHint">{zh ? `约为开盘市值的 ${marketCapMultiple(progress * 100).toFixed(1)} 倍` : `About ${marketCapMultiple(progress * 100).toFixed(1)}× the launch market cap`}</small> : null}
                  </label>
                  <label>
                    <span>Max buy · %</span>
                    <input value={level.maxBuy} inputMode="decimal" placeholder={zh ? "不限" : "none"} onChange={(event) => setLevel(index, { maxBuy: event.target.value })} autoComplete="off" />
                  </label>
                  <label>
                    <span>Max sell · %</span>
                    <input value={level.maxSell} inputMode="decimal" placeholder={zh ? "不限" : "none"} onChange={(event) => setLevel(index, { maxSell: event.target.value })} autoComplete="off" />
                  </label>
                  <button type="button" className="linkButton" onClick={() => set({ levels: form.levels.filter((_, i) => i !== index) })}>
                    {zh ? `删除第 ${index + 1} 档` : `Remove level ${index + 1}`}
                  </button>
                </div>
              );
            })}
            {form.levels.length < 5 ? (
              <button type="button" className="secondaryCta" onClick={() => set({ levels: [...form.levels, { from: "", maxBuy: "", maxSell: "" }] })}>
                {zh ? "添加一档" : "Add a level"}
              </button>
            ) : null}
            <p className="fieldHint">Up to five levels of graduation progress where the caps change. A trade meets the caps of the level the curve stood at before it, so a big sell can't escape a level by pushing the price under it. The curve's price follows its progress, so each level is also a market cap.</p>
          </details>
          <details className="launchRulesMore" open={Boolean(form.risingStart || form.chapterStart)}>
            <summary>Rising max per wallet, or chapters</summary>
            <div className="launchRulesGrid">
              {field("risingStart", "Rising: starts at · % of supply", "off", "0.01 to 5")}
              {form.risingDoubles ? null : field("risingStep", "Rises by · % of supply", "off", "0.01 to 5")}
              {field("risingMinutes", "Every · minutes", "off", "1 to 1,440")}
            </div>
            <label className="claimLinkSaved">
              <input type="checkbox" checked={form.risingDoubles} onChange={(event) => set({ risingDoubles: event.target.checked, risingStep: "" })} />
              <span>Double the cap each time instead of adding a step</span>
            </label>
            <div className="launchRulesGrid">
              {field("chapterStart", "Chapters: starts at · % of supply", "off", "0.1 to 5")}
              {field("chapterVolume", "Doubles every · % of supply traded", "off", "0.1 to 10")}
            </div>
            <p className="fieldHint">A rising cap opens up on a timer; chapters open up as volume trades on the curve. Each replaces the fixed max wallet, so choose one of the three. Exempt wallets are not capped.</p>
          </details>
          <details className="launchRulesMore" open={Boolean(form.gasCapGwei || form.maxBuysPerBlock)}>
            <summary>Anti-sniper: gas cap and anti-bundle</summary>
            <div className="launchRulesGrid">
              {field("gasCapGwei", "Max gas price · gwei", "off", "0.1 to 100. Normal BNB Chain buys pay about 0.05 to 0.1 gwei.")}
              {field("gasCapMinutes", "For the first · minutes", "off", "1 to 1,440")}
              {field("maxBuysPerBlock", "Max buys per block", "off", "1 to 20")}
              {field("bundleMin", "Counting buys of at least · % of supply", "off", "0.01 to 1")}
            </div>
            <p className="fieldHint">The gas cap refuses buys that pay a priority gas price to jump the queue; you and exempt wallets are excepted. It can't see bribes paid to block builders in a separate transaction, so pair it with the anti-bundle limit. Smaller buys are neither counted nor refused, so dust can't fill a block's quota. Sells are never limited.</p>
          </details>
          <details className="launchRulesMore" open={Boolean(form.walletVestPeriodHours)}>
            <summary>Holder vesting: each wallet on its own clock</summary>
            <div className="launchRulesGrid">
              {field("walletVestCliffHours", "Nothing unlocks for · hours", "0", "Up to 168")}
              {field("walletVestUnlock", "Then unlocks · % each period", "off", "0.1 to 100")}
              {field("walletVestPeriodHours", "Every · hours", "off", "1 to 168")}
              {field("walletVestWindowMinutes", "Only buys in the first · minutes", "every buy", "Empty vests every buy; or 1 to 10,080")}
            </div>
            {walletVestTotal ? (
              <p className="fieldHint">{zh ? `每个钱包在最后一次锁仓买入后 ${formatDuration(walletVestTotal, true)} 内全部解锁（上限 30 天）。` : `Each wallet is fully free ${formatDuration(walletVestTotal)} after its last vesting buy (30 days at most).`}</p>
            ) : null}
            <p className="fieldHint">Each wallet's clock starts at its buy, and a later buy restarts it for what is still locked; what already unlocked stays free. Your own first buy vests too. Choose this or early-buyer vesting, not both.</p>
          </details>
          <details className="launchRulesMore" open={Boolean(form.exempt)}>
            <summary>Exempt wallets</summary>
            <label>
              <span>Up to 10, shown publicly</span>
              <textarea value={form.exempt} rows={2} placeholder={zh ? "0x…，金库、空投或团队钱包" : "0x… treasury, airdrop or team wallets"} onChange={(event) => set({ exempt: event.target.value })} spellCheck={false} />
            </label>
            <p className="fieldHint">Exempt wallets can exceed the wallet and buy caps, send and receive under curve-only, buy during access windows, and skip the gas cap and anti-bundle limit. Sell caps, cooldowns, vesting and market hours still apply to them.</p>
          </details>
          {error ? <p className="fieldError" role="alert">{error}</p> : null}
        </>
      ) : null}
    </fieldset>
  );
}
