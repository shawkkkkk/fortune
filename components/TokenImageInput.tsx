"use client";

import { useEffect, useRef, useState } from "react";
import { createWalletClient, custom, type EIP1193Provider } from "viem";
import { IMAGE_TYPES, MAX_IMAGE_BYTES, publicMetadataUrl, uploadMessage } from "@/lib/creator-metadata";

export default function TokenImageInput({ value, onChange, onBusy, disabled = false }: {
  value: string; onChange: (value: string) => void; onBusy: (busy: boolean) => void; disabled?: boolean;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const lock = useRef(false);
  const input = useRef<HTMLInputElement>(null);
  let hostedPreview = "";
  try { const clean = publicMetadataUrl("Image", value, true); hostedPreview = clean.startsWith("ipfs://") ? `https://ipfs.io/ipfs/${clean.slice(7)}` : clean; } catch { /* Do not load invalid or incomplete URLs. */ }
  useEffect(() => { if (value) setFile(null); }, [value]);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/uploads/image", { cache: "no-store" }).then((r) => r.json()).then((body) => {
      if (!cancelled) setEnabled(body?.data?.enabled === true);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);
  useEffect(() => {
    if (!file) { setPreview(""); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function choose(next: File | null) {
    if (disabled || lock.current || !next) return;
    setMessage("");
    if (!IMAGE_TYPES.includes(next.type as (typeof IMAGE_TYPES)[number]) || !next.size || next.size > MAX_IMAGE_BYTES) {
      setMessage("Choose PNG, JPEG or WebP up to 2 MiB."); return;
    }
    setFile(next);
    onChange(""); // A local preview must never masquerade as a hosted image.
  }

  async function upload() {
    if (disabled || !file || lock.current) return;
    lock.current = true; setBusy(true); onBusy(true); setMessage("");
    try {
      const ethereum = (window as Window & { ethereum?: EIP1193Provider }).ethereum;
      if (!ethereum) throw new Error("Connect an EVM wallet to authorize image storage. No funds are transferred.");
      const wallet = createWalletClient({ transport: custom(ethereum) });
      const [address] = await wallet.requestAddresses();
      if (!address) throw new Error("Wallet did not return an account.");
      const bytes = await file.arrayBuffer();
      const digest = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map((n) => n.toString(16).padStart(2, "0")).join("");
      const issuedAt = Date.now();
      const signature = await wallet.signMessage({ account: address, message: uploadMessage(window.location.origin, address, digest, issuedAt) });
      const form = new FormData();
      form.set("file", file); form.set("address", address); form.set("issuedAt", String(issuedAt)); form.set("signature", signature);
      const response = await fetch("/api/uploads/image", { method: "POST", body: form, signal: AbortSignal.timeout(45_000) });
      const body = await response.json();
      if (!response.ok || typeof body?.data?.uri !== "string") throw new Error(body?.error?.message || "Image upload failed. No launch was submitted.");
      onChange(body.data.uri); setFile(null);
      if (input.current) input.current.value = "";
      setMessage("Image uploaded to IPFS. Save a copy of the URI; availability depends on continued pinning.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Image upload failed."); }
    finally { lock.current = false; setBusy(false); onBusy(false); }
  }

  return <div className="creatorImageInput">
    <label className="imageDropzone" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); choose(e.dataTransfer.files[0] || null); }}>
      {preview || hostedPreview ? <img src={preview || hostedPreview} alt="Selected token image preview" width={96} height={96} referrerPolicy="no-referrer" /> : <span className="uploadGlyph" aria-hidden="true">↑</span>}
      <strong>Choose an image file</strong><span>Drop a square PNG, JPEG or WebP · up to 2 MiB</span>
      <input ref={input} aria-label="Token image file" type="file" accept={IMAGE_TYPES.join(",")} disabled={busy || disabled} onChange={(e) => choose(e.target.files?.[0] || null)} />
    </label>
    {file ? <div className="creatorToolbar"><span translate="no">{file.name}</span><button type="button" className="secondaryCta" disabled={!enabled || busy} onClick={() => void upload()}>{busy ? "Uploading…" : "Upload image"}</button><button type="button" className="secondaryCta" disabled={busy} onClick={() => { setFile(null); if (input.current) input.current.value = ""; }}>Remove file</button></div> : null}
    {!enabled ? <p className="fieldHint">File preview is available. Upload hosting is not connected yet; use a public image URL or IPFS URI to launch.</p> : <p className="fieldHint">Uploading publishes your image to IPFS. A wallet message authorizes storage only; it cannot spend funds. Keep your own pinned copy.</p>}
    <label>Image URL or IPFS URI<input value={value} maxLength={512} onChange={(e) => { onChange(e.target.value); setFile(null); }} placeholder="https://… or ipfs://…" /></label>
    <p className="fieldHint">Fortune records the URI at launch. HTTP-hosted content can change; an IPFS CID fixes the content but still needs hosting.</p>
    {message ? <p role="status" className="fieldHint">{message}</p> : null}
  </div>;
}
