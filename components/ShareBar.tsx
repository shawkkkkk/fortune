"use client";

import { useEffect, useState } from "react";

/** Share a Fortune page on X or Telegram, copy its link, or use the device share sheet. */
export default function ShareBar({ path, text, label = "Share" }: { path: string; text: string; label?: string }) {
  const [url, setUrl] = useState(path);
  const [copied, setCopied] = useState(false);
  const [native, setNative] = useState(false);

  useEffect(() => {
    setUrl(new URL(path, window.location.origin).toString());
    setNative(typeof navigator.share === "function");
  }, [path]);

  const encoded = encodeURIComponent(url);
  const message = encodeURIComponent(text);
  return (
    <div className="shareBar" role="group" aria-label={label}>
      <a className="secondaryCta" href={`https://x.com/intent/post?text=${message}&url=${encoded}`} target="_blank" rel="noopener noreferrer">Post on X ↗</a>
      <a className="secondaryCta" href={`https://t.me/share/url?url=${encoded}&text=${message}`} target="_blank" rel="noopener noreferrer">Telegram ↗</a>
      <button
        type="button"
        className="secondaryCta"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(url);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 2_000);
          } catch { setCopied(false); }
        }}
      >
        {copied ? "Link copied" : "Copy link"}
      </button>
      {native ? (
        <button type="button" className="secondaryCta" onClick={() => { void navigator.share({ title: text, text, url }).catch(() => {}); }}>
          Share…
        </button>
      ) : null}
    </div>
  );
}
