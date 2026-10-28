"use client";

import Link from "next/link";
import { useState } from "react";
import "../launch/catalog.css";
import { CHARACTER_FIELDS, emptyCharacter, characterKey, characterDraft, restoreCharacter, announcementDraft, type CharacterFields } from "@/lib/creator-character";

export default function CreatorStudio() {
  const [token, setToken] = useState("");
  const [fields, setFields] = useState<CharacterFields>({ ...emptyCharacter });
  const [reviewed, setReviewed] = useState(false);
  const [message, setMessage] = useState("");
  const [importText, setImportText] = useState("");
  let key = "", error = "", announcement = "";
  try { key = characterKey(token); characterDraft(token, fields); } catch (e) { error = e instanceof Error ? e.message : "Invalid draft."; }
  try { announcement = announcementDraft(fields); } catch { /* Incomplete drafts are allowed. */ }
  function resetReview() { setReviewed(false); setMessage(""); }
  function storage(action: "save" | "load" | "delete") {
    resetReview();
    try {
      if (!key || (action === "save" && error)) throw Error("Check the project address and field limits.");
      if (action === "save") localStorage.setItem(key, JSON.stringify(characterDraft(token, fields)));
      if (action === "load") { const raw = localStorage.getItem(key); if (!raw) throw Error("No saved draft for this project."); setFields(restoreCharacter(raw, token).fields); }
      if (action === "delete") { localStorage.removeItem(key); setFields({ ...emptyCharacter }); }
      setMessage(action === "save" ? "Saved in this browser only." : action === "load" ? "Local draft loaded. Review again before export." : "Saved local draft deleted and fields cleared.");
    } catch { setMessage("Local storage unavailable or draft invalid. No public record changed."); }
  }
  function download(kind: "profile" | "announcement") {
    if (!reviewed || error || !key || (kind === "announcement" && !announcement)) return;
    const text = kind === "profile" ? JSON.stringify(characterDraft(token, fields), null, 2) : announcement;
    const url = URL.createObjectURL(new Blob([text], { type: kind === "profile" ? "application/json" : "text/plain" }));
    const link = document.createElement("a"); link.href = url; link.download = kind === "profile" ? `fortune-character-97-${token.toLowerCase()}.json` : "fortune-announcement-draft.txt";
    document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    setMessage("Downloaded a local draft. Nothing was posted, signed or published.");
  }
  return <main className="page narrowPage">
    <section className="pageHeading"><div><span className="eyebrow">CREATOR STUDIO · LOCAL DRAFTS</span><h1>Give your project a character.</h1><p>Keep its appearance, voice and story together. Prepare wording for your review without connecting a wallet.</p></div></section>
    <div className="registryNotice"><strong>LOCAL DRAFTS · NOT PUBLISHED</strong><span>Anyone using this browser can read saved drafts. Do not enter secrets. Drafts are unverified, not proof of creator ownership or a license grant. They do not update token metadata or the MCP reader.</span></div>
    <section className="formCard"><h2>Project and character</h2>
      <label>BSC Testnet project address<input value={token} maxLength={42} autoComplete="off" onChange={e => { setToken(e.target.value); setFields({ ...emptyCharacter }); setImportText(""); resetReview(); }} /></label>
      <p className="fieldHint">Changing the address clears unsaved fields. Load an existing draft explicitly. This address is a local label; it has not been checked against a factory.</p>
      {Object.entries(CHARACTER_FIELDS).map(([key, [label, limit]]) => <label key={key}>{label}<textarea aria-label={label} rows={key === "name" || key === "symbol" ? 1 : 3} maxLength={limit} value={fields[key as keyof CharacterFields]} onChange={e => { setFields(previous => ({ ...previous, [key]: e.target.value })); resetReview(); }} /></label>)}
      <p className="fieldHint">Unspecified fields stay empty. The identity prompt is stored as text, never executed. No AI provider or automatic image/post generation is connected.</p>
      <div className="fieldGrid"><button className="secondaryCta" disabled={!!error} onClick={() => storage("save")}>Save local draft</button><button className="secondaryCta" disabled={!key} onClick={() => storage("load")}>Load local draft</button><button className="secondaryCta" disabled={!key} onClick={() => storage("delete")}>Delete local draft</button></div>
    </section>
    <section className="formCard"><h2>Import your character draft</h2><label>Draft JSON<textarea aria-label="Draft JSON" rows={4} maxLength={32768} value={importText} onChange={e => { setImportText(e.target.value); resetReview(); }} /></label>
      <button className="secondaryCta" disabled={!key || !importText} onClick={() => { resetReview(); try { setFields(restoreCharacter(importText, token).fields); setMessage("Imported a local draft. Ownership and permissions are not verified."); } catch { setMessage("Import rejected. Check the schema, project, chain and byte limits."); } }}>Import local draft</button>
    </section>
    <section className="formCard"><h2>Review and export</h2><p>This announcement template uses only your name, ticker and description. Appearance, voice, prompts and license claims are not treated as verified facts or instructions.</p>
      <pre className="apiCode">{announcement || "Add a name and description to prepare wording."}</pre>
      {error ? <p className="fieldHint">{error}</p> : null}
      <label><input type="checkbox" checked={reviewed} onChange={e => setReviewed(e.target.checked)} /> I reviewed these local fields and announcement wording. This does not authorize a post or transaction.</label>
      <div className="fieldGrid"><button className="secondaryCta" disabled={!reviewed || !!error} onClick={() => download("profile")}>Export character JSON</button><button className="secondaryCta" disabled={!reviewed || !!error || !announcement} onClick={() => download("announcement")}>Export announcement text</button></div>
      <p role="status">{message}</p>
    </section><Link className="secondaryCta" href="/developers">Developer tools and read-only MCP →</Link>
  </main>;
}
