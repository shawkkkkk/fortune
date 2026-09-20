"use client";

import Link from "next/link";
import FortuneLogo from "@/components/FortuneLogo";
import { useLanguage } from "@/components/LanguageProvider";
import { PUBLIC_TESTNET } from "@/lib/public-testnet";

export default function Footer() {
  const { language } = useLanguage();
  const zh = language === "zh";

  return (
    <footer className="siteFooter">
      <div className="siteFooterInner">
        <div className="siteFooterBrand">
          <FortuneLogo size="sm" />
          <p>
            {zh
              ? "BSC 测试网上的公开 Alpha。仅限无价值测试资产，主网尚未开放。"
              : "Public alpha on BSC Testnet. Valueless test assets only; mainnet is not enabled."}
          </p>
        </div>

        <div className="siteFooterLinks">
          <Link href="/testnet">{zh ? "公开 Alpha" : "Public Alpha"}</Link>
          <Link href="/status">{zh ? "系统状态" : "Status"}</Link>
          <Link href="/developers">{zh ? "开发者 API" : "Developer API"}</Link>
          <a
            href={
              PUBLIC_TESTNET.explorerUrl +
              "/address/" +
              PUBLIC_TESTNET.contracts.factory
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
        <span>Fortune · BSC Testnet · Chain 97</span>
        <span>
          {zh
            ? "预审计软件 · 请勿使用真实资金"
            : "Pre-audit software · do not use real funds"}
        </span>
      </div>
    </footer>
  );
}
