import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Fortune lucky cat — Meme coins, paired with the BNB economy";

export default async function OpenGraphImage() {
  const artwork = await readFile(join(process.cwd(), "public", "fortune-cat-scene.jpg"));
  const source = `data:image/jpeg;base64,${artwork.toString("base64")}`;

  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", background: "#b80d15", padding: 14, fontFamily: "sans-serif" }}>
      <div style={{ display: "flex", flex: 1, alignItems: "center", background: "#fffaf2", border: "3px solid #e3b25f", borderRadius: 26, padding: "40px 44px", color: "#221515" }}>
        <div style={{ display: "flex", width: 610, height: "100%", flexDirection: "column", justifyContent: "center", gap: 22 }}>
          <div style={{ display: "flex", fontSize: 36, fontWeight: 800, color: "#d8141d", letterSpacing: -1 }}>fortune</div>
          <div style={{ display: "flex", flexDirection: "column", fontSize: 62, fontWeight: 800, lineHeight: 1.04, letterSpacing: -2 }}>
            <span>Meme coins,</span>
            <span style={{ color: "#d8141d" }}>paired with the BNB economy.</span>
          </div>
          <div style={{ display: "flex", fontSize: 24, color: "#85581b" }}>No dumping · Holders get paid · Pair with anything</div>
        </div>
        {/* @next/next/no-img-element: static image bytes are embedded in the social card. */}
        <img src={source} alt="Fortune 3D lucky cat" width={440} height={440} style={{ objectFit: "cover", borderRadius: 220, border: "6px solid #e3b25f", marginLeft: 20 }} />
      </div>
    </div>,
    size
  );
}
