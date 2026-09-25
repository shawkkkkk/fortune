"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useLanguage } from "@/components/LanguageProvider";
import FortuneLogo from "@/components/FortuneLogo";
import { FortuneCoin } from "@/components/Ornaments";
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
  ["/launch", "Launch"],
  ["/burns", "Burns"],
  ["/rewards", "Rewards"],
  ["/stats", "Stats"],
  ["/docs", "Docs"],
  ["/search", "Search"],
] as const;

// Desktop pill: the logo is the home link, the rest sit either side of the seal.
const pillLinks = links.filter(([href]) => href !== "/");
const leftLinks = pillLinks.slice(0, 4);
const rightLinks = pillLinks.slice(4);

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

function ThemeIcon({ theme }: { theme: "light" | "dark" }) {
  return theme === "light" ? (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M20.5 14.3A8.5 8.5 0 0 1 9.7 3.5a8.5 8.5 0 1 0 10.8 10.8Z" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="4.2" />
      <path d="M12 2.5v2.2M12 19.3v2.2M4.6 4.6l1.6 1.6M17.8 17.8l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.6 19.4l1.6-1.6M17.8 6.2l1.6-1.6" />
    </svg>
  );
}

export default function Header() {
  const pathname = usePathname();
  const [account, setAccount] = useState("");
  const [chainId, setChainId] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  // The home hero is dark, so the floating header switches to white-on-glass
  // while the hero sits underneath it.
  const [overHero, setOverHero] = useState(() => pathname === "/");
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

  useEffect(() => {
    const hero = document.getElementById("fortune-hero");
    if (!hero || typeof IntersectionObserver === "undefined") {
      setOverHero(false);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => setOverHero(entry.isIntersecting),
      { rootMargin: "0px 0px -90% 0px" }
    );
    observer.observe(hero);
    return () => observer.disconnect();
  }, [pathname]);

  useEffect(() => {
    if (!menuOpen) return;

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [menuOpen]);

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

  const themeToggle = (
    <button
      className="themeToggle"
      type="button"
      onClick={toggleTheme}
      aria-label={theme === "light" ? "Dark mode" : "Light mode"}
      title={theme === "light" ? "Dark mode" : "Light mode"}
    >
      <ThemeIcon theme={theme} />
    </button>
  );

  const languageSwitch = (
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
  );

  const navLink = ([href, label]: (typeof links)[number]) => (
    <Link
      key={href}
      href={href}
      className={pathname === href ? "navActive" : ""}
      aria-current={pathname === href ? "page" : undefined}
    >
      {label}
    </Link>
  );

  return (
    <>
      <header
        className={
          "siteHeader" +
          (overHero && !menuOpen ? " isOverHero" : "") +
          (menuOpen ? " isMenuOpen" : "")
        }
      >
        <div className="siteHeaderInner">
          <FortuneLogo size="sm" />

          <nav className="navLinks navPill liquid-glass" aria-label="Primary">
            {leftLinks.map(navLink)}
            <FortuneCoin className="navSeal" />
            {rightLinks.map(navLink)}
          </nav>

          <div className="headerActions">
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
            <button
              type="button"
              className="menuToggle liquid-glass"
              aria-expanded={menuOpen}
              aria-controls="fortune-mobile-menu"
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              onClick={() => setMenuOpen((open) => !open)}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                {menuOpen ? (
                  <path d="M6 6l12 12M18 6L6 18" />
                ) : (
                  <path d="M4 7h16M4 12h16M4 17h16" />
                )}
              </svg>
            </button>
          </div>
        </div>

        <div
          id="fortune-mobile-menu"
          className="mobileMenu"
          hidden={!menuOpen}
        >
          <nav className="mobileMenuLinks" aria-label="Mobile">
            {links.map(([href, label]) => (
              <Link
                key={href}
                href={href}
                className={pathname === href ? "navActive" : ""}
                aria-current={pathname === href ? "page" : undefined}
                onClick={() => setMenuOpen(false)}
              >
                {label}
              </Link>
            ))}
            {account ? (
              <Link
                href={"/profile/" + account}
                className={pathname === "/profile/" + account ? "navActive" : ""}
                onClick={() => setMenuOpen(false)}
              >
                Profile
              </Link>
            ) : null}
          </nav>
          <div className="mobileMenuControls">
            {languageSwitch}
            {themeToggle}
          </div>
        </div>
      </header>

      <div className="networkBar">
        <span className="networkStatus">
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
          {account ? <Link href={"/profile/" + account} className="networkProfile">Profile</Link> : null}
        </span>
        <span className="networkNote">
          {FORTUNE_NETWORK.isMainnet
            ? "Real-value network · review every transaction"
            : "Test assets only · no real funds"}
        </span>
        <div className="networkTools">
          <nav className="networkLinks" aria-label="System">
            <Link href="/status">Status</Link>
            <Link href="/docs">Docs</Link>
            <Link href="/developers">API</Link>
          </nav>
          <div className="networkPrefs">
            {languageSwitch}
            {themeToggle}
          </div>
        </div>
      </div>
    </>
  );
}
