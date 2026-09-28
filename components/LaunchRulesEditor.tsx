"use client";

import { useEffect, useState } from "react";
import { createPublicClient, http, isAddress, parseAbi, type Address } from "viem";
import { bsc, bscTestnet } from "viem/chains";
import { FORTUNE_NETWORK } from "@/lib/fortune-network";
import { RULE_PRESETS, emptyRulesForm, type LaunchRulesForm } from "@/lib/launch-rules";

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
  // Presets combine; pressing an applied one clears just its settings.
  const presetOn = (preset: Partial<LaunchRulesForm>) => (Object.keys(preset) as (keyof LaunchRulesForm)[]).every((key) => form[key] === preset[key]);
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
  const field = (key: keyof LaunchRulesForm, label: string, placeholder: string, hint?: string) => (
    <label>
      <span>{label}</span>
      <input value={String(form[key])} inputMode="decimal" placeholder={zh && placeholder === "off" ? "关闭" : placeholder} onChange={(event) => set({ [key]: event.target.value } as Partial<LaunchRulesForm>)} autoComplete="off" />
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
              {field("vestingWindowSeconds", "Buys in the first · seconds", "off", "Up to 1 day. Your own first buy counts.")}
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
          <details className="launchRulesMore" open={Boolean(form.exempt)}>
            <summary>Exempt wallets</summary>
            <label>
              <span>Up to 10, shown publicly</span>
              <textarea value={form.exempt} rows={2} placeholder={zh ? "0x…，金库、空投或团队钱包" : "0x… treasury, airdrop or team wallets"} onChange={(event) => set({ exempt: event.target.value })} spellCheck={false} />
            </label>
            <p className="fieldHint">Exempt wallets can exceed the wallet and buy caps, send and receive under curve-only, and buy during access windows. Sell caps, cooldowns and vesting still apply to them.</p>
          </details>
          {error ? <p className="fieldError" role="alert">{error}</p> : null}
        </>
      ) : null}
    </fieldset>
  );
}
