"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { FORTUNE_NETWORK } from "@/lib/fortune-network";

type Launch = {
  id: string;
  mode: "standard" | "tax";
  creator: string;
  token: string;
  curve: string;
  name: string;
  symbol: string;
  status: "Curve" | "GraduationReady" | "Pancake" | "Rescued";
  currentPriceUsd: string;
  reserveUsd: string;
  graduationUsd: string;
  graduationProgress: number;
  totalSupply: string;
  quoteAssets: string[];
  createdAt: number;
};

type LaunchResponse = {
  data?: {
    items: Launch[];
    totalOnchain: number;
    chainId: number;
  };
  error?: {
    message?: string;
  };
};

function money(value: string) {
  const number = Number(value);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: number >= 1_000_000 ? "compact" : "standard",
    maximumFractionDigits: number < 1 ? 8 : 2,
  }).format(Number.isFinite(number) ? number : 0);
}

function short(value: string) {
  return value.slice(0, 6) + "…" + value.slice(-4);
}

function statusLabel(status: Launch["status"]) {
  if (status === "GraduationReady") return "Ready to graduate";
  if (status === "Pancake") return "Pancake V3";
  return status;
}

export default function MarketsPage() {
  const [launches, setLaunches] = useState<Launch[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    try {
      setError("");
      const response = await fetch(
        "/api/public/v1/launches?limit=25",
        { cache: "no-store" }
      );
      const body = (await response.json()) as LaunchResponse;

      if (!response.ok || !body.data) {
        throw new Error(
          body.error?.message || "Could not load Fortune markets."
        );
      }

      setLaunches(body.data.items || []);
      setTotal(body.data.totalOnchain || 0);
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "Could not load Fortune markets."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 12_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  return (
    <main className="page">
      <section className="pageHeading">
        <div>
          <span className="eyebrow">LIVE ONCHAIN MARKETS</span>
          <h1>Fortune launches</h1>
          <p>
            Every market below is read directly from the configured Fortune
            factory, token, and curve contracts. No demo listings.
          </p>
        </div>

        <div className="heroActions">
          <button
            className="secondaryCta"
            onClick={() => void refresh()}
            disabled={loading}
          >
            {loading ? "Refreshing…" : "Refresh"}
          </button>
          <Link
            href={FORTUNE_NETWORK.isMainnet ? "/launch" : "/testnet"}
            className="primaryCta"
          >
            {FORTUNE_NETWORK.isMainnet
              ? "Launch token →"
              : "Create test launch →"}
          </Link>
        </div>
      </section>

      <section className="registryNotice">
        <strong>
          {FORTUNE_NETWORK.isMainnet
            ? "BNB CHAIN MAINNET"
            : "BSC TESTNET"}
        </strong>
        <span>
          {total} onchain Fortune launch{total === 1 ? "" : "es"} found on
          chain {FORTUNE_NETWORK.chainId}.
        </span>
      </section>

      {error ? (
        <section className="registryNotice statusError">
          <strong>MARKET READ FAILED</strong>
          <span>{error}</span>
        </section>
      ) : null}

      {!loading && launches.length === 0 && !error ? (
        <section className="panel">
          <div className="emptyPanel">
            <strong>No launches on this deployment yet.</strong>
            <span>
              The first confirmed Fortune launch will appear here directly from
              the factory.
            </span>
          </div>
        </section>
      ) : (
        <div className="launchGrid">
          {launches.map((launch) => (
            <Link
              href={
                "/market/" +
                launch.curve +
                (launch.mode === "tax" ? "?mode=tax" : "")
              }
              className="launchCard"
              key={launch.curve}
            >
              <div className="launchCardTop">
                <div className="tokenAvatar">
                  {launch.symbol.slice(0, 2)}
                </div>
                <div>
                  <div className="tokenTitle">
                    <strong>{launch.name}</strong>
                    <span>{launch.symbol}</span>
                  </div>
                  <div className="mutedSmall">
                    by {short(launch.creator)} · {launch.mode === "tax" ? "tax" : "standard"} · {launch.id}
                  </div>
                </div>
                <span
                  className={
                    "statusPill " +
                    (launch.status === "Pancake"
                      ? "statusGraduated"
                      : launch.status === "GraduationReady"
                        ? "statusGraduating"
                        : "")
                  }
                >
                  {statusLabel(launch.status)}
                </span>
              </div>

              <div className="marketStats">
                <div>
                  <span>Curve price</span>
                  <strong>{money(launch.currentPriceUsd)}</strong>
                </div>
                <div>
                  <span>Reserve</span>
                  <strong>{money(launch.reserveUsd)}</strong>
                </div>
                <div>
                  <span>Quote markets</span>
                  <strong>{launch.quoteAssets.length}</strong>
                </div>
              </div>

              <div className="progressHeader">
                <span>Graduation</span>
                <strong>
                  {launch.graduationProgress.toFixed(2)}%
                </strong>
              </div>
              <div className="progressTrack">
                <span
                  style={{
                    width:
                      Math.min(100, launch.graduationProgress) + "%",
                  }}
                />
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
