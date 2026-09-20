"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  ["/", "Explore"],
  ["/launch", "Launch"],
  ["/forum", "Forum"],
  ["/analytics", "Analytics"],
  ["/automations", "Automations"],
  ["/portfolio", "Portfolio"],
] as const;

export default function Header() {
  const pathname = usePathname();

  return (
    <>
      <div className="networkBar">
        <span className="networkDot" />
        BNB Smart Chain · testnet-first
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
          <button className="walletButton">Connect wallet</button>
        </div>
      </header>
    </>
  );
}
