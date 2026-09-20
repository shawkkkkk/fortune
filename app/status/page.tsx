"use client";

import { useCallback, useEffect, useState } from "react";
import { useLanguage } from "@/components/LanguageProvider";
import { PUBLIC_TESTNET } from "@/lib/public-testnet";

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
  factory: "Fortune 工厂字节码",
  registry: "资产注册表字节码",
  adapter: "毕业适配器字节码",
  locker: "永久 LP 锁仓",
  "pancake-factory": "Pancake V3 工厂",
  "position-manager": "Pancake 仓位管理器",
  "launch-shield": "Launch Shield",
  "atomic-graduation": "原子化毕业",
  recovery: "毕业恢复机制",
  "chart-anchor": "图表连续性锚点",
  "transaction-recovery": "交易恢复机制",
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
            {zh ? "FORTUNE 公开 ALPHA" : "FORTUNE PUBLIC ALPHA"}
          </span>
          <h1>{zh ? "系统状态" : "System status"}</h1>
          <p>
            {zh
              ? "此页面直接检查 Fortune 的 BSC 测试网 RPC、核心合约和 Pancake V3 依赖。"
              : "This page directly checks Fortune's BSC Testnet RPC, core contracts, and Pancake V3 dependencies."}
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
            <strong>BSC Testnet · 97</strong>
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
              [zh ? "工厂" : "Factory", PUBLIC_TESTNET.contracts.factory],
              [zh ? "资产注册表" : "Registry", PUBLIC_TESTNET.contracts.registry],
              [zh ? "毕业适配器" : "Graduation adapter", PUBLIC_TESTNET.contracts.graduationAdapter],
              [zh ? "永久 LP 锁仓" : "Permanent LP locker", PUBLIC_TESTNET.contracts.liquidityLocker],
            ].map(([label, address]) => (
              <div key={label}>
                <span>{label}</span>
                <a
                  href={PUBLIC_TESTNET.explorerUrl + "/address/" + address}
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
