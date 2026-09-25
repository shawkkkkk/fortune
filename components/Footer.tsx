"use client";

import Link from "next/link";
import FortuneLogo from "@/components/FortuneLogo";
import { useLanguage } from "@/components/LanguageProvider";
import { FortuneCoin } from "@/components/Ornaments";
import { FORTUNE_NETWORK } from "@/lib/fortune-network";

export default function Footer() {
  const { language } = useLanguage();
  const zh = language === "zh";

  return (
    <footer className="siteFooter">
      <div className="siteFooterInner">
        <div className="siteFooterBrand">
          <FortuneLogo size="sm" />
          <p>
            {FORTUNE_NETWORK.isMainnet
              ? zh
                ? "Fortune 已配置在 BNB Smart Chain 主网。所有交易都会使用真实资产。"
                : "Fortune is configured on BNB Smart Chain mainnet. Transactions use real assets."
              : zh
                ? "BSC 测试网上的公开 Alpha。仅限无价值测试资产，主网尚未开放。"
                : "Public alpha on BSC Testnet. Valueless test assets only; mainnet is not enabled."}
          </p>
          <span className="siteFooterMotto">
            <FortuneCoin />
            {zh ? "好运，自己创造。" : "Make your own luck."}
          </span>
        </div>

        <nav className="siteFooterLinks" aria-label={zh ? "页脚" : "Footer"}>
          <div>
            <h2>{zh ? "产品" : "Product"}</h2>
            <Link href="/explore">{zh ? "探索" : "Explore"}</Link>
            <Link href="/launch">
              {zh ? "发行" : "Launch"}
            </Link>
            {FORTUNE_NETWORK.isTestnet ? <Link href="/testnet">{zh ? "测试网实验室" : "Testnet lab"}</Link> : null}
          </div>
          <div>
            <h2>{zh ? "公开证明" : "Proof"}</h2>
            <Link href="/burns">{zh ? "销毁" : "Burns"}</Link>
            <Link href="/rewards">{zh ? "奖励" : "Rewards"}</Link>
            <Link href="/stats">{zh ? "数据" : "Stats"}</Link>
            <Link href="/status">{zh ? "系统状态" : "Status"}</Link>
          </div>
          <div>
            <h2>{zh ? "构建" : "Build"}</h2>
            <Link href="/docs">{zh ? "文档" : "Docs"}</Link>
            <Link href="/developers">{zh ? "开发者 API" : "API"}</Link>
            <a
              href={
                FORTUNE_NETWORK.contracts.factory
                  ? FORTUNE_NETWORK.explorerUrl + "/address/" + FORTUNE_NETWORK.contracts.factory
                  : FORTUNE_NETWORK.explorerUrl
              }
              target="_blank"
              rel="noreferrer"
            >
              BscScan ↗
            </a>
            <a
              href="https://github.com/shawkkkkk/fortune/issues/new?template=testnet-bug.yml"
              target="_blank"
              rel="noreferrer"
            >
              {zh ? "报告问题 ↗" : "Report a bug ↗"}
            </a>
          </div>
        </nav>
      </div>

      <div className="siteFooterBottom">
        <span>
          Fortune · {FORTUNE_NETWORK.chainName} · Chain {FORTUNE_NETWORK.chainId}
        </span>
        <span>
          {FORTUNE_NETWORK.isMainnet
            ? zh
              ? "真实资产网络 · 请在签名前检查所有交易"
              : "Real-value network · review every transaction before signing"
            : zh
              ? "预审计软件 · 请勿使用真实资金"
              : "Pre-audit software · do not use real funds"}
        </span>
      </div>
    </footer>
  );
}
