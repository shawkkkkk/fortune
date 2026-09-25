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
    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", background: "#fff9f7", padding: 52, color: "#261418", fontFamily: "sans-serif" }}>
      <div style={{ display: "flex", width: 590, height: "100%", flexDirection: "column", justifyContent: "center", gap: 22 }}>
        <div style={{ display: "flex", fontSize: 34, fontWeight: 800, color: "#e1262f" }}>fortune</div>
        <div style={{ display: "flex", fontSize: 64, fontWeight: 800, lineHeight: 1.05, letterSpacing: -2 }}>Meme coins, paired with the BNB economy.</div>
        <div style={{ display: "flex", fontSize: 23, color: "#75565a" }}>No dumping · Holders get paid · Pair with anything</div>
      </div>
      {/* @next/next/no-img-element: static image bytes are embedded in the social card. */}
      <img src={source} alt="Fortune 3D lucky cat" width={495} height={495} style={{ objectFit: "cover", borderRadius: 28, marginLeft: 18 }} />
    </div>,
    size
  );
}
