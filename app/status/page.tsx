"use client";

import { useCallback, useEffect, useState } from "react";
import { useLanguage } from "@/components/LanguageProvider";
import { FORTUNE_NETWORK } from "@/lib/fortune-network";

type BasicStatus = {
  ready: boolean;
  degraded: boolean;
  timestamp?: string;
  rpc?: { configured: number; healthy: number };
};

type Check = {
  id: string;
  label: string;
  status: "pass" | "warn" | "fail";
  detail: string;
};

type FullStatus = {
  data?: {
    ready: boolean;
    degraded: boolean;
    score: {
      passed: number;
      warnings: number;
      failed: number;
      total: number;
    };
    checks: Check[];
    chainId: number;
  };
};

const zhLabels: Record<string, string> = {
  chain: "BNB Chain 配置",
  rpc: "BSC RPC 健康状态",
  redundancy: "RPC 故障切换",
  factory: "Fortune 标准工厂字节码",
  "tax-factory": "Fortune 税费代币工厂字节码",
  registry: "资产注册表字节码",
  "pool-registry": "池注册表字节码",
  adapter: "V3 毕业适配器字节码",
  locker: "V3 永久 LP 锁仓",
  "tax-adapter": "V2 税费代币毕业适配器",
  "tax-locker": "V2 永久 LP 锁仓",
  "pancake-factory": "Pancake V3 工厂",
  "position-manager": "Pancake V3 仓位管理器",
  "pancake-v2-router": "Pancake V2 路由器",
  "pancake-v2-factory": "Pancake V2 工厂",
  "launch-shield": "Launch Shield",
  "atomic-graduation": "原子化毕业",
  recovery: "毕业恢复机制",
  "chart-anchor": "图表连续性锚点",
  "transaction-recovery": "交易恢复机制",
  "mainnet-release-approval": "主网发布批准",
  "governance-owner": "治理所有权",
  "primary-quote": "正式版主要计价资产",
  "launch-activation": "主网发行激活",
};

export default function StatusPage() {
  const { language } = useLanguage();
  const zh = language === "zh";
  const [basic, setBasic] = useState<BasicStatus | null>(null);
  const [full, setFull] = useState<FullStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const [basicResponse, fullResponse] = await Promise.all([
        fetch("/api/ready", { cache: "no-store" }),
        fetch("/api/public/v1/readiness", { cache: "no-store" }),
      ]);

      const basicJson = (await basicResponse.json()) as BasicStatus;
      const fullJson = (await fullResponse.json()) as FullStatus;

      setBasic(basicJson);
      setFull(fullJson);
      setCheckedAt(new Date());
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "Status request failed."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 30_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const fullData = full?.data;
  const operational = Boolean(basic?.ready && fullData?.ready);
  const degraded = Boolean(
    operational && (basic?.degraded || fullData?.degraded)
  );

  return (
    <main className="page narrowPage">
      <section className="pageHeading">
        <div>
          <span className="eyebrow">
            {FORTUNE_NETWORK.isMainnet
              ? zh ? "FORTUNE 正式网络" : "FORTUNE PRODUCTION"
              : zh ? "FORTUNE 公开 ALPHA" : "FORTUNE PUBLIC ALPHA"}
          </span>
          <h1>{zh ? "系统状态" : "System status"}</h1>
          <p>
            {zh
              ? FORTUNE_NETWORK.isMainnet
                ? "此页面直接检查 Fortune 的 BNB Smart Chain 主网 RPC、核心合约和 Pancake V3 依赖。"
                : "此页面直接检查 Fortune 的 BSC 测试网 RPC、核心合约和 Pancake V3 依赖。"
              : FORTUNE_NETWORK.isMainnet
                ? "This page directly checks Fortune's BNB Smart Chain mainnet RPC, core contracts, and Pancake V3 dependencies."
                : "This page directly checks Fortune's BSC Testnet RPC, standard + tax-token contracts, and Pancake V3/V2 dependencies."}
          </p>
        </div>

        <button
          className="secondaryCta"
          onClick={() => void refresh()}
          disabled={loading}
        >
          {loading
            ? zh
              ? "检查中…"
              : "Checking…"
            : zh
              ? "刷新状态"
              : "Refresh status"}
        </button>
      </section>

      <section className="statusHero">
        <div>
          <span
            className={
              "statusDot " +
              (operational
                ? degraded
                  ? "statusDotWarn"
                  : "statusDotPass"
                : "statusDotFail")
            }
          />
          <div>
            <span className="eyebrow">
              {zh ? "当前状态" : "CURRENT STATUS"}
            </span>
            <h2>
              {error
                ? zh
                  ? "无法读取状态"
                  : "Status unavailable"
                : !basic || !fullData
                  ? zh
                    ? "正在检查"
                    : "Checking"
                  : operational
                    ? degraded
                      ? zh
                        ? "运行中 · 部分降级"
                        : "Operational · degraded"
                      : zh
                        ? "全部正常"
                        : "All systems operational"
                    : zh
                      ? "需要处理"
                      : "Attention required"}
            </h2>
          </div>
        </div>

        <div className="statusHeroMeta">
          <span>
            {zh ? "网络" : "Network"}
            <strong>{FORTUNE_NETWORK.chainName} · {FORTUNE_NETWORK.chainId}</strong>
          </span>
          <span>
            RPC
            <strong>
              {basic?.rpc
                ? basic.rpc.healthy + "/" + basic.rpc.configured
                : "—"}
            </strong>
          </span>
          <span>
            {zh ? "检查时间" : "Last checked"}
            <strong>
              {checkedAt ? checkedAt.toLocaleTimeString() : "—"}
            </strong>
          </span>
        </div>
      </section>

      {error ? (
        <section className="registryNotice statusError">
          <strong>{zh ? "状态检查失败" : "STATUS CHECK FAILED"}</strong>
          <span>{error}</span>
        </section>
      ) : null}

      <section className="panel">
        <div className="panelTitle">
          <div>
            <span className="eyebrow">
              {zh ? "实时就绪检查" : "LIVE READINESS"}
            </span>
            <h2>
              {fullData
                ? fullData.score.passed +
                  "/" +
                  fullData.score.total +
                  (zh ? " 项通过" : " checks passing")
                : zh
                  ? "正在读取…"
                  : "Loading…"}
            </h2>
          </div>
          {fullData ? (
            <span>
              {fullData.score.warnings} {zh ? "警告" : "warnings"} ·{" "}
              {fullData.score.failed} {zh ? "失败" : "failed"}
            </span>
          ) : null}
        </div>

        <div className="statusChecks">
          {(fullData?.checks || []).map((check) => (
            <article className="statusCheck" key={check.id}>
              <span
                className={
                  "statusCheckBadge statusCheck-" + check.status
                }
              >
                {check.status === "pass"
                  ? zh
                    ? "通过"
                    : "PASS"
                  : check.status === "warn"
                    ? zh
                      ? "警告"
                      : "WARN"
                    : zh
                      ? "失败"
                      : "FAIL"}
              </span>
              <div>
                <strong>
                  {zh ? zhLabels[check.id] || check.label : check.label}
                </strong>
                <p>{check.detail}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="twoColumn contentSection">
        <div className="panel">
          <span className="eyebrow">
            {zh ? "发布证据" : "RELEASE EVIDENCE"}
          </span>
          <div className="statRows">
            <div><span>Foundry</span><strong>39 / 39</strong></div>
            <div><span>{zh ? "模糊测试" : "Fuzz runs"}</span><strong>1,000</strong></div>
            <div><span>{zh ? "网页请求" : "HTTP requests"}</span><strong>7,500 / 7,500</strong></div>
            <div><span>{zh ? "真实毕业" : "Real graduations"}</span><strong>3 / 3</strong></div>
            <div><span>500 {zh ? "并发 p95" : "concurrent p95"}</span><strong>935 ms</strong></div>
          </div>
        </div>

        <div className="panel">
          <span className="eyebrow">
            {zh ? "公开合约" : "PUBLIC CONTRACTS"}
          </span>
          <div className="statRows">
            {[
              [zh ? "标准工厂" : "Standard factory", FORTUNE_NETWORK.contracts.factory],
              [zh ? "税费代币工厂" : "Tax-token factory", FORTUNE_NETWORK.contracts.taxFactory],
              [zh ? "资产注册表" : "Asset registry", FORTUNE_NETWORK.contracts.registry],
              [zh ? "池注册表" : "Pool registry", FORTUNE_NETWORK.contracts.poolRegistry],
              [zh ? "V3 毕业适配器" : "V3 graduation adapter", FORTUNE_NETWORK.contracts.graduationAdapter],
              [zh ? "V3 永久 LP 锁仓" : "V3 permanent LP locker", FORTUNE_NETWORK.contracts.liquidityLocker],
              [zh ? "V2 税费适配器" : "Tax V2 graduation adapter", FORTUNE_NETWORK.contracts.taxGraduationAdapter],
              [zh ? "V2 永久 LP 锁仓" : "Tax V2 permanent LP locker", FORTUNE_NETWORK.contracts.taxLiquidityLocker],
            ].map(([label, address]) => (
              <div key={label}>
                <span>{label}</span>
                <a
                  href={FORTUNE_NETWORK.explorerUrl + "/address/" + address}
                  target="_blank"
                  rel="noreferrer"
                >
                  <strong>View ↗</strong>
                </a>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
