"use client";

import { useState } from "react";
import { useLanguage } from "@/components/LanguageProvider";
import { resolveAccount, useResolvedName } from "@/components/SocialAccountName";
import {
  SOCIAL_FEE_RULES,
  SOCIAL_PLATFORMS,
  canonicalAccount,
  platformLabel,
  socialPlatform,
  type FeeShareInput,
  type SocialPlatform,
} from "@/lib/social-fees";

/** "self" is the wallet that signs the launch; "wallet" is any other address; anything else is a platform key. */
export type FeeSplitRow = { id: number; kind: string; value: string; percent: string };

let nextRowId = 1;

export function feeSplitRow(kind = "self", percent = "100", value = ""): FeeSplitRow {
  nextRowId += 1;
  return { id: nextRowId, kind, value, percent };
}

/** Rows as buildFeeShares expects them, with "self" resolved to the launching wallet. */
export function feeSplitInputs(rows: FeeSplitRow[], self: string): FeeShareInput[] {
  return rows.map((row) => {
    if (row.kind === "self") return { kind: "wallet", wallet: self, percent: row.percent };
    if (row.kind === "wallet") return { kind: "wallet", wallet: row.value, percent: row.percent };
    return { kind: "social", platform: socialPlatform(row.kind)?.id ?? 0, account: row.value, percent: row.percent };
  });
}

/** Platform options, global first, then Chinese platforms. */
export function PlatformOptions({ zh }: { zh: boolean }) {
  return (
    <>
      <optgroup label={zh ? "全球" : "Global"}>
        {SOCIAL_PLATFORMS.filter((item) => item.region === "global").map((item) => (
          <option key={item.key} value={item.key}>{platformLabel(item, zh)}</option>
        ))}
      </optgroup>
      <optgroup label={zh ? "中国平台" : "China"}>
        {SOCIAL_PLATFORMS.filter((item) => item.region === "china").map((item) => (
          <option key={item.key} value={item.key}>{zh ? item.labelZh : `${item.label} · ${item.labelZh}`}</option>
        ))}
      </optgroup>
    </>
  );
}

function ResolvedName({ platform, value }: { platform: SocialPlatform | null; value: string }) {
  const parsed = platform?.resolvable ? canonicalAccount(platform.key, value) : null;
  const name = useResolvedName(platform, parsed?.ok ? parsed.account : "");
  if (!name) return null;
  return <span className="feeSplitResolved" translate="no">✓ {name}</span>;
}

function evenly(count: number) {
  const base = Math.floor(10_000 / count);
  return Array.from({ length: count }, (_, index) => {
    const bps = index === 0 ? 10_000 - base * (count - 1) : base;
    return (bps / 100).toFixed(2).replace(/\.?0+$/, "");
  });
}

export default function FeeSplitEditor({
  rows,
  onChange,
  error,
  errorRow,
  disabled,
}: {
  rows: FeeSplitRow[];
  onChange: (rows: FeeSplitRow[]) => void;
  error: string;
  errorRow?: number;
  disabled?: boolean;
}) {
  const { language } = useLanguage();
  const zh = language === "zh";
  const [lookups, setLookups] = useState<Record<number, { text: string; error: boolean } | null>>({});
  const total = rows.reduce((sum, row) => sum + (Number(row.percent) || 0), 0);
  const update = (id: number, patch: Partial<FeeSplitRow>) => onChange(rows.map((row) => (row.id === id ? { ...row, ...patch } : row)));

  // Weibo and Bilibili links or custom domains, and WeChat article links, are
  // turned into the account id on Fortune's server.
  async function resolve(row: FeeSplitRow) {
    const platform = socialPlatform(row.kind);
    if (!platform?.resolvable || !row.value.trim()) return;
    const parsed = canonicalAccount(platform.key, row.value);
    if (parsed.ok || !parsed.resolvable) return;
    setLookups((current) => ({ ...current, [row.id]: { text: zh ? "查询中…" : "Looking up…", error: false } }));
    try {
      const resolved = await resolveAccount(platform.key, row.value);
      onChange(rows.map((item) => (item.id === row.id ? { ...item, value: resolved.account } : item)));
      setLookups((current) => ({ ...current, [row.id]: null }));
    } catch (error) {
      const text = error instanceof Error ? error.message : "That account could not be looked up.";
      setLookups((current) => ({ ...current, [row.id]: { text, error: true } }));
    }
  }

  return (
    <div className="feeSplit">
      <div className="feeSplitHead">
        <strong>Who receives the creator fee</strong>
        <span>{`Your wallet, other wallets or social accounts. Up to ${SOCIAL_FEE_RULES.maxShares} recipients, at least 1% each.`}</span>
      </div>
      <ul className="feeSplitRows">
        {rows.map((row, index) => {
          const platform = socialPlatform(row.kind);
          return (
            <li key={row.id} className={"feeSplitRow" + (errorRow === index ? " feeSplitRowError" : "")}>
              <div className="feeSplitKind">
                <select aria-label={zh ? `接收方 ${index + 1}` : `Recipient ${index + 1}`} value={row.kind} disabled={disabled} onChange={(event) => update(row.id, { kind: event.target.value, value: "" })}>
                  <option value="self" disabled={rows.some((other) => other.kind === "self" && other.id !== row.id)}>Your wallet</option>
                  <option value="wallet">Another wallet</option>
                  <PlatformOptions zh={zh} />
                </select>
              </div>
              {row.kind === "self" ? (
                <span className="feeSplitSelf">The wallet that signs the launch</span>
              ) : (
                <div className="feeSplitValue">
                  {platform?.prefix ? <span className="feeSplitPrefix" aria-hidden="true">{platform.prefix}</span> : null}
                  <input
                    aria-label={zh
                      ? `接收方 ${index + 1} ${platform ? platform.label : "钱包地址"}`
                      : `Recipient ${index + 1} ${platform ? `${platform.label} ${platform.placeholder}` : "wallet address"}`}
                    value={row.value}
                    disabled={disabled}
                    onChange={(event) => update(row.id, { value: platform?.prefix === "@" ? event.target.value.replace(/^@+/, "") : event.target.value })}
                    onBlur={() => void resolve(row)}
                    placeholder={platform ? platform.placeholder : "0x…"}
                    maxLength={platform ? 300 : 42}
                    autoComplete="off"
                    spellCheck={false}
                    aria-invalid={errorRow === index}
                  />
                </div>
              )}
              <div className="feeSplitPercent">
                <input
                  aria-label={zh ? `接收方 ${index + 1} 的份额（百分比）` : `Share for recipient ${index + 1}, percent`}
                  value={row.percent}
                  disabled={disabled}
                  inputMode="decimal"
                  maxLength={6}
                  onChange={(event) => update(row.id, { percent: event.target.value })}
                />
                <span aria-hidden="true">%</span>
              </div>
              <button
                type="button"
                className="feeSplitRemove"
                aria-label={zh ? `移除接收方 ${index + 1}` : `Remove recipient ${index + 1}`}
                disabled={disabled || rows.length === 1}
                onClick={() => onChange(rows.filter((other) => other.id !== row.id))}
              >
                ×
              </button>
              {lookups[row.id] ? (
                <span className={"feeSplitResolved" + (lookups[row.id]?.error ? " feeSplitLookupError" : "")} role="status">{lookups[row.id]?.text}</span>
              ) : (
                <ResolvedName platform={platform} value={row.value} />
              )}
            </li>
          );
        })}
      </ul>
      <div className="feeSplitActions">
        <button
          type="button"
          className="secondaryCta"
          disabled={disabled || rows.length >= SOCIAL_FEE_RULES.maxShares}
          onClick={() => onChange([...rows, feeSplitRow("x", "0")])}
        >
          + Add recipient
        </button>
        <button
          type="button"
          className="linkButton"
          disabled={disabled || rows.length < 2}
          onClick={() => {
            const shares = evenly(rows.length);
            onChange(rows.map((row, index) => ({ ...row, percent: shares[index] })));
          }}
        >
          Split evenly
        </button>
        <span className={"feeSplitTotal" + (Math.abs(total - 100) < 1e-9 ? " feeSplitTotalOk" : "")} translate="no">
          {Math.round(total * 100) / 100}% / 100%
        </span>
      </div>
      {error ? <p className="fieldError" role="alert">{error}</p> : null}
      <p className="fieldHint">
        Social accounts claim on Fortune after proving they own the account; until then their share waits in the fee vault. Naming an account does not mean its owner endorses the token. The split is fixed at launch.
      </p>
    </div>
  );
}
