"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

type InjectedEthereum = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
};

declare global {
  interface Window {
    ethereum?: InjectedEthereum;
  }
}

const links = [
  ["/", "Explore"],
  ["/launch", "Launch"],
  ["/registry", "Assets"],
  ["/forum", "Forum"],
  ["/analytics", "Analytics"],
  ["/automations", "Automations"],
  ["/portfolio", "Portfolio"],
] as const;

function short(address: string) {
  return address.slice(0, 6) + "…" + address.slice(-4);
}

export default function Header() {
  const pathname = usePathname();
  const [account, setAccount] = useState("");
  const [chainId, setChainId] = useState("");
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    if (!window.ethereum) return;
    void Promise.all([
      window.ethereum.request({ method: "eth_accounts" }),
      window.ethereum.request({ method: "eth_chainId" }),
    ]).then(([accounts, chain]) => {
      const list = accounts as string[];
      if (list?.[0]) setAccount(list[0]);
      if (typeof chain === "string") setChainId(chain);
    });
  }, []);

  async function connect() {
    if (!window.ethereum) {
      window.alert("Install a BSC-compatible EVM wallet to connect.");
      return;
    }
    setConnecting(true);
    try {
      const accounts = (await window.ethereum.request({
        method: "eth_requestAccounts",
      })) as string[];
      const chain = (await window.ethereum.request({
        method: "eth_chainId",
      })) as string;
      setAccount(accounts?.[0] || "");
      setChainId(chain);
    } finally {
      setConnecting(false);
    }
  }

  const onBsc = chainId === "0x38" || chainId === "0x61";

  return (
    <>
      <div className="networkBar">
        <span className={"networkDot " + (account && !onBsc ? "networkWarn" : "")} />
        {account ? (onBsc ? "BNB Smart Chain wallet connected" : "Wallet connected · switch to BNB Chain") : "BNB Smart Chain · testnet-first"}
        <span className="networkNote">Pre-audit software — no real funds</span>
      </div>
      <header className="siteHeader">
        <Link href="/" className="logo">
          <span className="logoMark">F</span>
          <span>FORTUNE</span>
        </Link>
        <nav className="navLinks">
          {links.map(([href, label]) => (
            <Link
              key={href}
              href={href}
              className={pathname === href ? "navActive" : ""}
            >
              {label}
            </Link>
          ))}
        </nav>
        <div className="headerActions">
          <button className="iconButton" aria-label="Search">⌕</button>
          <button className="walletButton" onClick={() => void connect()} disabled={connecting}>
            {connecting ? "Connecting…" : account ? short(account) : "Connect wallet"}
          </button>
        </div>
      </header>
    </>
  );
}
