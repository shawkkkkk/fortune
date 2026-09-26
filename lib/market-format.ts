// Display helpers shared by Explore, token and market pages. Client-safe.

const SUBSCRIPT = "₀₁₂₃₄₅₆₇₈₉";

/** Meme-coin prices: 4 significant digits, with DexScreener-style subscript zero runs. */
export function formatPrice(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  if (value === 0) return "$0";
  if (value >= 1) return "$" + value.toLocaleString("en-US", { maximumFractionDigits: value >= 1000 ? 0 : 4 });
  const digits = value.toFixed(20).slice(2);
  const zeros = digits.match(/^0*/)?.[0].length ?? 0;
  const significant = digits.slice(zeros, zeros + 4).replace(/0+$/, "") || "0";
  if (zeros >= 4) {
    const run = String(zeros).split("").map((d) => SUBSCRIPT[Number(d)]).join("");
    return "$0.0" + run + significant;
  }
  return "$0." + "0".repeat(zeros) + significant;
}

/** Totals such as market cap, volume and liquidity. */
export function formatUsd(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  const abs = Math.abs(value);
  if (abs >= 1000) {
    // Explicit minimum digits: Node and browser ICU disagree on the compact currency default ("$1M" vs "$1.00M").
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(value);
  }
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: abs < 10 ? 2 : 0, minimumFractionDigits: abs < 10 && abs > 0 ? 2 : 0 }).format(value);
}

export function formatAmount(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-US", { notation: value >= 100_000 ? "compact" : "standard", maximumFractionDigits: value >= 1 ? 2 : 6 }).format(value);
}

export function formatAge(timestamp: number | null | undefined, zh = false, now = Date.now() / 1000) {
  if (!timestamp) return "—";
  const seconds = Math.max(0, Math.round(now - timestamp));
  const [value, en, cn] = seconds < 60 ? [seconds, "s ago", "秒前"]
    : seconds < 3600 ? [Math.floor(seconds / 60), "m ago", "分钟前"]
      : seconds < 86_400 ? [Math.floor(seconds / 3600), "h ago", "小时前"]
        : [Math.floor(seconds / 86_400), "d ago", "天前"];
  return value + (zh ? cn : en);
}

export function formatHours(seconds: number, zh = false) {
  const hours = seconds / 3600;
  if (hours >= 48) return Math.round(hours / 24) + (zh ? " 天" : " days");
  return (hours >= 10 ? Math.round(hours) : hours.toFixed(1)) + (zh ? " 小时" : " hours");
}

export function shortAddress(value: string) {
  return value.slice(0, 6) + "…" + value.slice(-4);
}

// Recognisable colours for common BNB Chain pair assets; others get a stable palette colour.
const ASSET_COLORS: Record<string, string> = {
  BNB: "#f0b90b", WBNB: "#f0b90b", TBNB: "#f0b90b",
  USDT: "#26a17b", "BSC-USD": "#26a17b", USDC: "#2775ca", FDUSD: "#1f8a70", FUSD: "#177a55",
  BTCB: "#f7931a", ETH: "#627eea", CAKE: "#d1884f",
};
const PALETTE = ["#c8913f", "#d8141d", "#177a55", "#85581b", "#8e0a10", "#a15c07"];

export function assetColor(symbol: string) {
  const known = ASSET_COLORS[symbol.toUpperCase()];
  if (known) return known;
  let hash = 0;
  for (const char of symbol) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return PALETTE[hash % PALETTE.length];
}

function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrasts(background: string) {
  const bg = luminance(background);
  return { white: 1.05 / (bg + 0.05), ink: (bg + 0.05) / (luminance("#221515") + 0.05) };
}

/** White or ink, whichever reads better on the asset colour (WCAG contrast ratio). */
export function assetTextColor(background: string) {
  const { white, ink } = contrasts(background);
  return white >= ink ? "#ffffff" : "#221515";
}

/** Coin colours, darkened step by step until white or ink text reaches WCAG AA (4.5:1). */
export function assetCoinStyle(symbol: string) {
  let background = assetColor(symbol);
  for (let step = 0; step < 8; step++) {
    const { white, ink } = contrasts(background);
    if (Math.max(white, ink) >= 4.5) break;
    background = "#" + [1, 3, 5].map((i) => Math.round(parseInt(background.slice(i, i + 2), 16) * 0.9).toString(16).padStart(2, "0")).join("");
  }
  return { background, color: assetTextColor(background) };
}
