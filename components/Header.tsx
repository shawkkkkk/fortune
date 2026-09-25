"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useLanguage } from "@/components/LanguageProvider";
import FortuneLogo from "@/components/FortuneLogo";
import { useTheme } from "@/components/ThemeProvider";
import { FORTUNE_NETWORK } from "@/lib/fortune-network";

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
  ["/", "Home"],
  ["/explore", "Explore"],
  [
    FORTUNE_NETWORK.isMainnet ? "/launch" : "/testnet",
    "Launch",
  ],
  ["/burns", "Burns"],
  ["/rewards", "Rewards"],
  ["/stats", "Stats"],
  ["/docs", "Docs"],
] as const;

function short(address: string) {
  return address.slice(0, 6) + "…" + address.slice(-4);
}

async function switchToNetwork(ethereum: InjectedEthereum) {
  try {
    await ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: FORTUNE_NETWORK.chainHex }],
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
          chainId: FORTUNE_NETWORK.chainHex,
          chainName: FORTUNE_NETWORK.chainName,
          nativeCurrency: {
            name: FORTUNE_NETWORK.isMainnet ? "BNB" : "Test BNB",
            symbol: FORTUNE_NETWORK.nativeSymbol,
            decimals: 18,
          },
          rpcUrls: [FORTUNE_NETWORK.publicRpcUrl],
          blockExplorerUrls: [FORTUNE_NETWORK.explorerUrl],
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
  const { theme, toggleTheme } = useTheme();

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

      if (chain !== FORTUNE_NETWORK.chainHex) {
        await switchToNetwork(ethereum);
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

  const onNetwork = chainId === FORTUNE_NETWORK.chainHex;

  return (
    <>
      <div className="networkBar">
        <span
          className={
            "networkDot " +
            (account && !onNetwork ? "networkWarn" : "")
          }
        />
        {account
          ? onNetwork
            ? FORTUNE_NETWORK.isMainnet
              ? "BNB Smart Chain wallet connected"
              : "BSC Testnet wallet connected"
            : "Wallet connected · switch network"
          : FORTUNE_NETWORK.isMainnet
            ? "Fortune · BNB Smart Chain"
            : "Fortune · public BSC Testnet alpha"}
        <span className="networkNote">
          {FORTUNE_NETWORK.isMainnet
            ? "Real-value network · review every transaction"
            : "Test assets only · no real funds"}
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
          <button
            className="themeToggle"
            type="button"
            onClick={toggleTheme}
            aria-label={theme === "light" ? "Dark mode" : "Light mode"}
            title={theme === "light" ? "Dark mode" : "Light mode"}
          >
            <span aria-hidden="true">{theme === "light" ? "☾" : "☀"}</span>
          </button>

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
              : account && !onNetwork
                ? "Switch network"
                : account
                  ? short(account)
                  : "Connect wallet"}
          </button>
        </div>
      </header>
    </>
  );
}
