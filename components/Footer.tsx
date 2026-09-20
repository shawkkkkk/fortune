"use client";

import Link from "next/link";
import FortuneLogo from "@/components/FortuneLogo";
import { useLanguage } from "@/components/LanguageProvider";
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
        </div>

        <div className="siteFooterLinks">
          <Link href="/markets">{zh ? "市场" : "Markets"}</Link>
          <Link href={FORTUNE_NETWORK.isMainnet ? "/launch" : "/testnet"}>
            {FORTUNE_NETWORK.isMainnet
              ? zh ? "发行" : "Launch"
              : zh ? "公开 Alpha" : "Public Alpha"}
          </Link>
          <Link href="/status">{zh ? "系统状态" : "Status"}</Link>
          <Link href="/developers">{zh ? "开发者 API" : "Developer API"}</Link>
          <a
            href={
              FORTUNE_NETWORK.explorerUrl +
              "/address/" +
              FORTUNE_NETWORK.contracts.factory
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
