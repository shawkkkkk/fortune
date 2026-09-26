import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { isAddress, type Address } from "viem";
import { FORTUNE_NETWORK } from "@/lib/fortune-network";
import { formatPrice, formatUsd } from "@/lib/market-format";
import { readTokenSummary } from "@/lib/market-insights";
import { readTokenMetadata } from "@/lib/token-metadata";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Fortune launch share card";
export const revalidate = 300;

const IMAGE_BYTES_LIMIT = 1_500_000;

/**
 * Token artwork as a data URI, only for small PNG/JPEG files that answer quickly.
 * `url` is creator metadata already checked by publicMetadataUrl (public web host,
 * no IP literal, credentials or custom port). Only HTTPS is fetched, and redirects
 * are refused except from the IPFS gateway, so a public host cannot bounce the
 * request inward.
 */
async function artwork(url: string | null) {
  if (!url) return null;
  const ipfs = url.startsWith("ipfs://");
  const source = ipfs ? `https://ipfs.io/ipfs/${url.slice(7)}` : url;
  if (!/^https:\/\//i.test(source)) return null;
  try {
    const response = await fetch(source, { signal: AbortSignal.timeout(3_000), redirect: ipfs ? "follow" : "error" });
    const type = (response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    if (!response.ok || (type !== "image/png" && type !== "image/jpeg")) return null;
    const bytes = Buffer.from(await response.arrayBuffer());
    return bytes.length <= IMAGE_BYTES_LIMIT ? `data:${type};base64,${bytes.toString("base64")}` : null;
  } catch {
    return null;
  }
}

type CardFont = { name: string; data: ArrayBuffer; weight: 500 | 700 | 800; style: "normal" };

/** One Google Fonts family and weight, subset to the card's own text. */
async function googleFont(family: string, weight: CardFont["weight"], text: string): Promise<CardFont | null> {
  try {
    const css = await (await fetch(`https://fonts.googleapis.com/css2?family=${family.replace(/ /g, "+")}:wght@${weight}&text=${encodeURIComponent(text)}`, {
      signal: AbortSignal.timeout(3_000),
      next: { revalidate: 86_400 },
    })).text();
    const url = css.match(/src: url\((.+?)\) format\('(opentype|truetype)'\)/)?.[1];
    if (!url) return null;
    const data = await (await fetch(url, { signal: AbortSignal.timeout(3_000), next: { revalidate: 86_400 } })).arrayBuffer();
    return { name: family, data, weight, style: "normal" };
  } catch {
    return null;
  }
}

/** Fortune's own sans for the card, plus Noto Sans SC when a name needs CJK glyphs. */
async function cardFonts(text: string) {
  const needsCjk = /[^\u0000-\u024f\u2000-\u206f]/.test(text);
  const loaded = await Promise.all([
    googleFont("Plus Jakarta Sans", 800, text),
    googleFont("Plus Jakarta Sans", 500, text),
    needsCjk ? googleFont("Noto Sans SC", 700, text) : Promise.resolve(null),
  ]);
  return loaded.filter((font): font is CardFont => font !== null);
}

export default async function TokenShareImage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cat = `data:image/png;base64,${(await readFile(join(process.cwd(), "public", "fortune-cat-share.png"))).toString("base64")}`;
  const read = isAddress(id) ? await readTokenSummary(id as Address).catch(() => null) : null;
  const summary = read?.summary ?? null;
  const image = summary && summary.mode === "standard" && read
    ? await readTokenMetadata(summary.factory, summary.token, summary.creator, read.blockNumber, read.blockHash!).then((meta) => artwork(meta.image), () => null)
    : null;

  const name = summary?.name || "Fortune token";
  const symbol = summary?.symbol || "";
  const pairs = summary?.pairs.map((pair) => pair.symbol).join(" · ") || "—";
  const graduated = summary?.phase === 2;
  const progress = summary ? Math.max(0, Math.min(100, summary.graduationProgress)) : 0;
  const network = FORTUNE_NETWORK.isMainnet ? "BNB Smart Chain" : "BNB Chain testnet alpha";
  const priceText = formatPrice(summary?.priceUsd ?? null);
  const capText = formatUsd(summary?.marketCapUsd ?? null);
  const fonts = await cardFonts(`${name}${symbol}$${pairs}${priceText}${capText} PRICEMARKETCAPAIREDWITHGraduation progress%·trading on PancakeSwap with locked liquidityfortune${FORTUNE_NETWORK.isMainnet ? "BNB Smart Chain" : "BNB Chain testnet alpha"}0123456789.`);
  const family = fonts.map((font) => font.name).filter((value, index, all) => all.indexOf(value) === index).join(", ") || "sans-serif";

  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", background: "#b80d15", padding: 14, fontFamily: family }}>
      <div style={{ display: "flex", flex: 1, flexDirection: "column", justifyContent: "space-between", background: "#fffaf2", border: "3px solid #e3b25f", borderRadius: 26, padding: "40px 48px", color: "#221515", position: "relative" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 30, paddingRight: 250 }}>
          {image ? (
            <img src={image} width={150} height={150} alt="" style={{ flexShrink: 0, borderRadius: 75, objectFit: "cover", border: "5px solid #e3b25f" }} />
          ) : (
            <div style={{ display: "flex", flexShrink: 0, alignItems: "center", justifyContent: "center", width: 150, height: 150, borderRadius: 75, background: "#d8141d", color: "#fff7e8", fontSize: 58, fontWeight: 800, border: "5px solid #e3b25f" }}>
              {(symbol || "F").slice(0, 2).toUpperCase()}
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
            <div style={{ display: "flex", fontSize: name.length > 18 ? 52 : 66, fontWeight: 800, lineHeight: 1.05, letterSpacing: -2 }}>{name.slice(0, 40)}</div>
            {symbol ? <div style={{ display: "flex", fontSize: 36, fontWeight: 800, color: "#d8141d" }}>${symbol.slice(0, 16)}</div> : null}
          </div>
        </div>

        <div style={{ display: "flex", gap: 22 }}>
          {[
            ["PRICE", priceText],
            ["MARKET CAP", capText],
            ["PAIRED WITH", pairs],
          ].map(([label, value]) => (
            <div key={label} style={{ display: "flex", flexDirection: "column", gap: 4, padding: "14px 20px", border: "2px solid #ecd3a1", borderRadius: 16, background: "#ffffff", minWidth: 220 }}>
              <div style={{ display: "flex", fontSize: 19, fontWeight: 800, letterSpacing: 2, color: "#85581b" }}>{label}</div>
              <div style={{ display: "flex", fontSize: 38, fontWeight: 800 }}>{value}</div>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10, paddingRight: 250 }}>
          {graduated ? (
            <div style={{ display: "flex", fontSize: 26, fontWeight: 700, color: "#177a55" }}>Graduated · trading on PancakeSwap with locked liquidity</div>
          ) : (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 24, fontWeight: 700, color: "#4d3b3a" }}>
                <span>Graduation progress</span>
                <span>{progress.toFixed(progress >= 10 ? 0 : 1)}%</span>
              </div>
              <div style={{ display: "flex", height: 18, borderRadius: 9, background: "#f1e5da", overflow: "hidden" }}>
                <div style={{ display: "flex", width: `${Math.max(progress, 1)}%`, background: "#d8141d" }} />
              </div>
            </>
          )}
          <div style={{ display: "flex", fontSize: 22, fontWeight: 500, color: "#7b6564" }}>
            <span style={{ color: "#d8141d", fontWeight: 800, marginRight: 12 }}>fortune</span>
            <span>{network}</span>
          </div>
        </div>

        <img src={cat} width={280} height={280} alt="" style={{ position: "absolute", right: 30, bottom: 26 }} />
      </div>
    </div>,
    { ...size, fonts: fonts.length ? fonts : undefined }
  );
}
