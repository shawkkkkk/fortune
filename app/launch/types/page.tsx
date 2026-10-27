import Link from "next/link";
import "../catalog.css";
import { launchCatalog } from "@/lib/launch-catalog";
import { FORTUNE_NETWORK, FORTUNE_NETWORK_CONFIGURED } from "@/lib/fortune-network";
import { CUSTOM_PAIRS } from "@/lib/custom-pairs";
import { STOCK_REWARDS } from "@/lib/stock-rewards";

export default function LaunchTypesPage() {
  const presets = launchCatalog({ chainId: FORTUNE_NETWORK.chainId, standardConfigured: FORTUNE_NETWORK_CONFIGURED, customFactory: CUSTOM_PAIRS.factory, stockFactory: STOCK_REWARDS.factory });
  return <main className="page launchPage">
    <section className="pageHeading launchHeading"><div><span className="eyebrow">FORTUNE · LAUNCH TYPES</span><h1>What will you launch?</h1><p>Choose how your token trades, where its fees go, and who runs it.</p></div><img className="launchHeadingArt" src="/fortune-cat-cutout-400.webp" alt="Fortune lucky cat" width="170" height="170" /></section>
    <div className="registryNotice"><strong>TESTNET BUILDERS &amp; PLANNED ENGINES</strong><span>Builder access is not deployment verification. Every transaction still requires its existing live checks. No new mainnet engine is enabled here.</span></div>
    <div className="launchCatalogGrid">{presets.map(p => <article className="formCard launchCatalogCard" key={p.id}>
      <span className="eyebrow">{p.state === "builder" ? "TESTNET BUILDER" : p.state === "unconfigured" ? "CONFIGURATION REQUIRED" : "IN DEVELOPMENT"}</span>
      <h2>{p.name}</h2><p>{p.purpose}</p><p className="fieldHint">{p.reason}</p>
      {p.href ? <Link className="secondaryCta" href={p.href}>{p.action} →</Link> : <span className="fieldHint">Launch unavailable</span>}
    </article>)}</div>
    <p className="fieldHint">Features combine only when the exact engine supports them. Social routing and trading rules belong to the custom-pair beta; Stock Rewards does not enable arbitrary reward baskets.</p>
  </main>;
}
