"use client";
import { useEffect, useState } from "react";
import type { readTokenMetadata } from "@/lib/token-metadata";

export default function TokenProjectProfile({ token }: { token: string }) {
  const [data, setData] = useState<Awaited<ReturnType<typeof readTokenMetadata>> | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const controller = new AbortController(); setData(null); setFailed(false);
    fetch(`/api/public/v1/tokens/${token}/metadata`, { signal: controller.signal }).then(async (r) => {
      const body = await r.json(); if (!r.ok || !body?.data?.provenance) throw new Error("unavailable");
      if (!controller.signal.aborted) setData(body.data);
    }).catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => controller.abort();
  }, [token]);
  const links = data ? [["Website", data.external_url], ["X", data.extensions.twitter], ["Telegram", data.extensions.telegram], ["GitHub", data.extensions.github], ["YouTube", data.extensions.youtube], ["DeBox", data.extensions.debox]].filter(([, href]) => href) : [];
  return <section className="panel tokenProjectProfile"><h2>About this project</h2>
    {!data ? <p role="status">{failed ? "Project metadata could not be verified from the onchain registry." : "Loading onchain project metadata…"}</p> : <>
      {data.image ? <img width={96} height={96} alt={`${data.symbol} token artwork`} referrerPolicy="no-referrer" src={data.image.startsWith("ipfs://") ? `https://ipfs.io/ipfs/${data.image.slice(7)}` : data.image} /> : null}
      <p className="projectDescription" translate="no">{data.description || "—"}</p>
      <div className="heroActions">{links.map(([label, href]) => <a key={label} href={href} target="_blank" rel="nofollow noopener noreferrer" className="secondaryCta">{label} ↗</a>)}</div>
      <p className="fieldHint">Creator-provided content and external links are not endorsed by Fortune.</p>
      <p className="fieldHint">{data.provenance.frozen ? "Metadata fields are frozen onchain. External website and image hosting may still change." : "Creator-editable metadata. Check the current onchain revision."}</p>
      <a className="profileLink" href={`/api/public/v1/tokens/${token}/metadata`} target="_blank" rel="noreferrer">View metadata and block evidence ↗</a>
    </>}
  </section>;
}
