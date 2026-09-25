import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default async function AppleIcon() {
  const artwork = await readFile(join(process.cwd(), "public", "fortune-cat-scene.jpg"));
  return new ImageResponse(<img src={`data:image/jpeg;base64,${artwork.toString("base64")}`} alt="Fortune lucky cat" width={180} height={180} style={{ borderRadius: 35 }} />, size);
}
