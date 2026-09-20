"use client";

import { useState } from "react";

export default function MetadataManagerPage() {
  const [token, setToken] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [displaySymbol, setDisplaySymbol] = useState("");
  const [description, setDescription] = useState("");
  const [imageURI, setImageURI] = useState("");
  const [website, setWebsite] = useState("");
  const [xProfile, setXProfile] = useState("");
  const [telegram, setTelegram] = useState("");

  return (
    <main className="page narrowPage">
      <section className="pageHeading">
        <div>
          <span className="eyebrow">CREATOR TOOLS</span>
          <h1>Token metadata</h1>
          <p>
            Update Fortune presentation metadata while keeping the ERC-20
            contract identity and launch economics unchanged.
          </p>
        </div>
        <span className="healthBadge">Revisioned onchain</span>
      </section>

      <section className="formCard">
        <div className="formSectionTitle">
          <span>01</span>
          <div>
            <h2>Choose your Fortune token</h2>
            <p>Only the registered launch creator can update editable metadata.</p>
          </div>
        </div>

        <label>
          Token contract
          <input
            value={token}
            onChange={(event) => setToken(event.target.value)}
            placeholder="0x..."
          />
        </label>

        <div className="metadataPolicy">
          <div>
            <span className="eyebrow">IDENTITY BOUNDARY</span>
            <strong>Contract name + symbol stay immutable</strong>
            <small>
              Fortune display metadata can change without silently changing the
              ERC-20 identity used by wallets and explorers.
            </small>
          </div>
          <span className="candidateBadge">Transparent</span>
        </div>
      </section>

      <section className="formCard">
        <div className="formSectionTitle">
          <span>02</span>
          <div>
            <h2>Edit the public profile</h2>
            <p>Each successful update becomes the next metadata revision.</p>
          </div>
        </div>

        <div className="fieldGrid">
          <label>
            Display name
            <input value={displayName} onChange={(e)=>setDisplayName(e.target.value)} />
          </label>
          <label>
            Display ticker
            <input value={displaySymbol} onChange={(e)=>setDisplaySymbol(e.target.value.toUpperCase())} />
          </label>
        </div>

        <label>
          Description
          <textarea value={description} onChange={(e)=>setDescription(e.target.value)} />
        </label>

        <label>
          Image URI
          <input value={imageURI} onChange={(e)=>setImageURI(e.target.value)} placeholder="ipfs://... or https://..." />
        </label>

        <div className="fieldGrid">
          <label>
            Website
            <input value={website} onChange={(e)=>setWebsite(e.target.value)} />
          </label>
          <label>
            X profile
            <input value={xProfile} onChange={(e)=>setXProfile(e.target.value)} />
          </label>
        </div>

        <label>
          Telegram
          <input value={telegram} onChange={(e)=>setTelegram(e.target.value)} />
        </label>

        <button className="launchButton" disabled>
          Connect deployed metadata registry to submit revision
        </button>
        <small className="launchWarning">
          The contract layer is implemented. Transaction submission is enabled
          once the BSC testnet deployment addresses are wired into the web app.
        </small>
      </section>

      <section className="formCard manifestCard">
        <div className="formSectionTitle">
          <span>03</span>
          <div>
            <h2>Freeze forever</h2>
            <p>Creators can permanently remove their own metadata update authority.</p>
          </div>
        </div>

        <div className="registryNotice">
          <strong>Irreversible</strong>
          <span>
            Freezing metadata permanently locks the current Fortune display
            profile. It cannot be undone by the creator or Fortune.
          </span>
        </div>

        <button className="secondaryCta" disabled>
          Freeze metadata permanently
        </button>
      </section>
    </main>
  );
}
