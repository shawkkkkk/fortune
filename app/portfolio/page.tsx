"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getAddress, isAddress } from "viem";
import HoldingsPanel from "@/components/HoldingsPanel";
import { useLanguage } from "@/components/LanguageProvider";
import { FORTUNE_NETWORK } from "@/lib/fortune-network";
import { shortAddress } from "@/lib/market-format";

function readQueryAddress() {
  const value = new URLSearchParams(window.location.search).get("address")?.trim() || "";
  return isAddress(value) ? getAddress(value) : null;
}

function setQueryAddress(address: string | null) {
  const url = new URL(window.location.href);
  if (address) url.searchParams.set("address", address);
  else url.searchParams.delete("address");
  window.history.replaceState(null, "", url);
}

export default function PortfolioPage() {
  const { language } = useLanguage();
  const zh = language === "zh";
  const [wallet, setWallet] = useState<string | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [draft, setDraft] = useState("");
  const [draftError, setDraftError] = useState("");
  const [connectError, setConnectError] = useState("");

  useEffect(() => {
    setViewing(readQueryAddress());
    const ethereum = window.ethereum;
    if (!ethereum) { setReady(true); return; }
    const apply = (accounts: unknown) => {
      const first = Array.isArray(accounts) && typeof accounts[0] === "string" && isAddress(accounts[0]) ? getAddress(accounts[0]) : null;
      setWallet(first);
    };
    // eth_accounts never prompts: it only reports a wallet that already connected to Fortune.
    ethereum.request({ method: "eth_accounts" }).then(apply, () => undefined).finally(() => setReady(true));
    ethereum.on?.("accountsChanged", apply);
    return () => ethereum.removeListener?.("accountsChanged", apply);
  }, []);

  const address = viewing || wallet;
  const self = Boolean(address && wallet && address === wallet);

  async function connect() {
    setConnectError("");
    const ethereum = window.ethereum;
    if (!ethereum) { setConnectError("No browser wallet found. Paste an address instead."); return; }
    try {
      const accounts = await ethereum.request({ method: "eth_requestAccounts" });
      const first = Array.isArray(accounts) && typeof accounts[0] === "string" && isAddress(accounts[0]) ? getAddress(accounts[0]) : null;
      setWallet(first);
      setViewing(null);
      setQueryAddress(null);
    } catch {
      setConnectError("The wallet did not connect.");
    }
  }

  function view(event: React.FormEvent) {
    event.preventDefault();
    const value = draft.trim();
    if (!isAddress(value)) { setDraftError("Enter a 0x address with 40 hex characters."); return; }
    setDraftError("");
    setViewing(getAddress(value));
    setQueryAddress(getAddress(value));
    setDraft("");
  }

  return (
    <main className="page narrowPage portfolioPage">
      <section className="pageHeading">
        <div>
          <span className="eyebrow" translate="no">{zh ? `投资组合 · 链 ${FORTUNE_NETWORK.chainId}` : `PORTFOLIO · CHAIN ${FORTUNE_NETWORK.chainId}`}</span>
          <h1>{address ? (self ? "Your Fortune bag." : "Wallet holdings.") : "See every Fortune token in a wallet."}</h1>
          <p>Balances are read straight from BNB Chain for every Fortune launch, then valued at live curve or pool prices. Nothing is stored, and any address can be looked up.</p>
        </div>
        {address ? (
          <div className="tokenHeadingActions">
            <Link className="secondaryCta" href={`/profile/${address}`}>Launches by this address →</Link>
          </div>
        ) : null}
      </section>

      {address ? (
        <div className="portfolioViewing">
          <span translate="no">{self ? (zh ? "已连接钱包 " : "Connected wallet ") : (zh ? "正在查看 " : "Viewing ")}<code>{shortAddress(address)}</code></span>
          {viewing && wallet && viewing !== wallet ? (
            <button type="button" className="linkButton" onClick={() => { setViewing(null); setQueryAddress(null); }}>Show my wallet</button>
          ) : null}
          <a href={`${FORTUNE_NETWORK.explorerUrl}/address/${address}`} target="_blank" rel="noreferrer">BscScan ↗</a>
        </div>
      ) : null}

      {address ? <HoldingsPanel address={address} self={self} /> : null}

      {ready && !address ? (
        <section className="panel portfolioConnect">
          <div>
            <h2>Connect a wallet</h2>
            <p>Fortune only reads your address. Connecting never asks for a signature or spends anything.</p>
            <button type="button" className="primaryCta" onClick={connect}>Connect wallet</button>
            {connectError ? <p className="fieldError" role="alert">{connectError}</p> : null}
          </div>
          <form onSubmit={view} noValidate>
            <h2>Or look up any address</h2>
            <label className="fieldGrid">
              Wallet address
              <input className="marketSearch" value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="0x…" autoComplete="off" spellCheck={false} aria-invalid={Boolean(draftError)} aria-describedby={draftError ? "portfolio-address-error" : undefined} />
            </label>
            {draftError ? <p className="fieldError" id="portfolio-address-error" role="alert">{draftError}</p> : null}
            <button type="submit" className="secondaryCta">View holdings</button>
          </form>
        </section>
      ) : null}

      {address ? (
        <form className="portfolioLookup" onSubmit={view} noValidate>
          <label className="fieldGrid">
            Look up another address
            <input className="marketSearch" value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="0x…" autoComplete="off" spellCheck={false} aria-invalid={Boolean(draftError)} aria-describedby={draftError ? "portfolio-lookup-error" : undefined} />
          </label>
          <button type="submit" className="secondaryCta">View</button>
          {draftError ? <p className="fieldError" id="portfolio-lookup-error" role="alert">{draftError}</p> : null}
        </form>
      ) : null}
    </main>
  );
}
