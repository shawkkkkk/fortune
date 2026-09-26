"use client";

import { useState } from "react";

/** A launch's image, falling back to its ticker monogram when the image is missing or fails to load. */
export default function TokenLogo({ src, symbol, size = 64, className = "assetLogo" }: { src: string | null; symbol: string; size?: number; className?: string }) {
  const [failed, setFailed] = useState(false);
  const usable = src && /^https:\/\//.test(src) && !failed;
  if (!usable) {
    return <span className="tokenAvatar assetMonogram" aria-hidden="true" translate="no">{symbol.slice(0, 2)}</span>;
  }
  return <img className={className} src={src} alt="" width={size} height={size} onError={() => setFailed(true)} />;
}
