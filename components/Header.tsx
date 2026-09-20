"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useLanguage } from "@/components/LanguageProvider";
import FortuneLogo from "@/components/FortuneLogo";
import { PUBLIC_TESTNET } from "@/lib/public-testnet";

type InjectedEthereum = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (event: string, listener: (...args: unknown[]) => void) => void;
  removeListener?: (
    event: string,
    listener: (...args: unknown[]) => void
  ) => void;
};

declare global {
  interface Window {
    ethereum?: InjectedEthereum;
  }
}

const links = [
  ["/", "Overview"],
  ["/testnet", "Public Alpha"],
  ["/status", "Status"],
  ["/developers", "API"],
] as const;

function short(address: string) {
  return address.slice(0, 6) + "…" + address.slice(-4);
}

async function switchToTestnet(ethereum: InjectedEthereum) {
  try {
    await ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: PUBLIC_TESTNET.chainHex }],
    });
  } catch (error) {
    const code =
      typeof error === "object" &&
      error &&
      "code" in error
        ? Number((error as { code?: number }).code)
        : 0;

    if (code !== 4902) throw error;

    await ethereum.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: PUBLIC_TESTNET.chainHex,
          chainName: PUBLIC_TESTNET.chainName,
          nativeCurrency: {
            name: "Test BNB",
            symbol: PUBLIC_TESTNET.nativeSymbol,
            decimals: 18,
          },
          rpcUrls: [PUBLIC_TESTNET.rpcUrl],
          blockExplorerUrls: [PUBLIC_TESTNET.explorerUrl],
        },
      ],
    });
  }
}

export default function Header() {
  const pathname = usePathname();
  const [account, setAccount] = useState("");
  const [chainId, setChainId] = useState("");
  const [connecting, setConnecting] = useState(false);
  const { language, setLanguage } = useLanguage();

  useEffect(() => {
    const ethereum = window.ethereum;
    if (!ethereum) return;

    const sync = async () => {
      const [accounts, chain] = await Promise.all([
        ethereum.request({ method: "eth_accounts" }),
        ethereum.request({ method: "eth_chainId" }),
      ]);
      const list = accounts as string[];
      setAccount(list?.[0] || "");
      setChainId(typeof chain === "string" ? chain : "");
    };

    const handleAccounts = (...args: unknown[]) => {
      const list = Array.isArray(args[0]) ? (args[0] as string[]) : [];
      setAccount(list[0] || "");
    };

    const handleChain = (...args: unknown[]) => {
      setChainId(typeof args[0] === "string" ? args[0] : "");
    };

    void sync();
    ethereum.on?.("accountsChanged", handleAccounts);
    ethereum.on?.("chainChanged", handleChain);

    return () => {
      ethereum.removeListener?.("accountsChanged", handleAccounts);
      ethereum.removeListener?.("chainChanged", handleChain);
    };
  }, []);

  async function connect() {
    const ethereum = window.ethereum;
    if (!ethereum) {
      window.alert(
        language === "zh"
          ? "请安装 MetaMask 或其他兼容 BSC 的 EVM 钱包。"
          : "Install MetaMask or another BSC-compatible EVM wallet."
      );
      return;
    }

    setConnecting(true);
    try {
      const accounts = (await ethereum.request({
        method: "eth_requestAccounts",
      })) as string[];

      let chain = (await ethereum.request({
        method: "eth_chainId",
      })) as string;

      if (chain !== PUBLIC_TESTNET.chainHex) {
        await switchToTestnet(ethereum);
        chain = (await ethereum.request({
          method: "eth_chainId",
        })) as string;
      }

      setAccount(accounts?.[0] || "");
      setChainId(chain);
    } finally {
      setConnecting(false);
    }
  }

  const onTestnet = chainId === PUBLIC_TESTNET.chainHex;

  return (
    <>
      <div className="networkBar">
        <span
          className={
            "networkDot " +
            (account && !onTestnet ? "networkWarn" : "")
          }
        />
        {account
          ? onTestnet
            ? "BSC Testnet wallet connected"
            : "Wallet connected · switch to BSC Testnet"
          : "Fortune · public BSC Testnet alpha"}
        <span className="networkNote">
          Test assets only · no real funds
        </span>
      </div>

      <header className="siteHeader">
        <FortuneLogo size="sm" />

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
          <div
            className="languageSwitch"
            role="group"
            aria-label="Language"
          >
            <button
              className={
                language === "en" ? "languageActive" : ""
              }
              onClick={() => setLanguage("en")}
              aria-pressed={language === "en"}
            >
              EN
            </button>
            <button
              className={
                language === "zh" ? "languageActive" : ""
              }
              onClick={() => setLanguage("zh")}
              aria-pressed={language === "zh"}
            >
              中文
            </button>
          </div>

          <button
            className="walletButton"
            onClick={() => void connect()}
            disabled={connecting}
          >
            {connecting
              ? "Connecting…"
              : account && !onTestnet
                ? "Switch testnet"
                : account
                  ? short(account)
                  : "Connect wallet"}
          </button>
        </div>
      </header>
    </>
  );
}
