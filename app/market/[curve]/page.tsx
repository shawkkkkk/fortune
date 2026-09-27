"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import {
  createPublicClient,
  encodeAbiParameters,
  formatUnits,
  http,
  isAddress,
  parseEventLogs,
  type Address,
} from "viem";
import {
  FORTUNE_NETWORK,
  FORTUNE_NETWORK_CONFIGURED,
  FORTUNE_TAX_NETWORK_CONFIGURED,
} from "@/lib/fortune-network";
import { graduationGasLimit } from "@/lib/graduation-gas";
import CurveTradePanel from "@/components/CurveTradePanel";
import FortuneLogo from "@/components/FortuneLogo";
import PoolTradePanel from "@/components/PoolTradePanel";
import RescuePanel from "@/components/RescuePanel";
import TokenMarketPanel from "@/components/TokenMarketPanel";
import { connectWallet, connectedAccount, walletChain, walletClients, walletErrorMessage } from "@/lib/wallet";

const curveAbi = [
  {
    type: "function",
    name: "launchToken",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "quoteAssetCount",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "quoteAssets",
    stateMutability: "view",
    inputs: [{ type: "uint256" }],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "phase",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint8" }],
  },
  {
    type: "function",
    name: "graduationReady",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "graduated",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "currentPriceUsd1e18",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "netReserveUsd1e18",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "graduationUsd1e18",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "currentSnipeTaxBps",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint16" }],
  },
  {
    type: "function",
    name: "launchTimestamp",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint64" }],
  },
  {
    type: "function",
    name: "graduationReadyAt",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint64" }],
  },
] as const;

const erc20Abi = [
  {
    type: "function",
    name: "name",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "string" }],
  },
  {
    type: "function",
    name: "symbol",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "string" }],
  },
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint8" }],
  },
  {
    type: "function",
    name: "totalSupply",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
] as const;

const factoryAbi = [
  {
    type: "function",
    name: "curveIndexPlusOne",
    stateMutability: "view",
    inputs: [{ name: "curve", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "finalizeGraduation",
    stateMutability: "nonpayable",
    inputs: [
      { name: "curve", type: "address" },
      { name: "data", type: "bytes" },
    ],
    outputs: [{ name: "success", type: "bool" }],
  },
  {
    type: "event",
    name: "GraduationFinalized",
    inputs: [
      { name: "curve", type: "address", indexed: true },
      { name: "adapter", type: "address", indexed: true },
    ],
  },
] as const;

type QuoteInfo = {
  address: Address;
  symbol: string;
  decimals: number;
};

type MarketState = {
  token: Address;
  name: string;
  symbol: string;
  phase: number;
  graduationReady: boolean;
  graduated: boolean;
  currentPrice: bigint;
  reserveUsd: bigint;
  graduationUsd: bigint;
  shieldTaxBps: number;
  launchTimestamp: number;
  graduationReadyAt: number;
  totalSupply: bigint;
  /** Chain time minus this device's clock, in seconds. */
  clockOffset: number;
  quotes: QuoteInfo[];
};

const publicClient = createPublicClient({
  chain: walletChain,
  transport: http(FORTUNE_NETWORK.publicRpcUrl),
});

function usd(value: bigint) {
  const number = Number(formatUnits(value, 18));
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: number < 1 ? 8 : 2,
  }).format(number);
}

function sameQuotes(a: QuoteInfo[], b: QuoteInfo[]) {
  return a.length === b.length && a.every((quote, index) =>
    quote.address.toLowerCase() === b[index].address.toLowerCase() &&
    quote.symbol === b[index].symbol &&
    quote.decimals === b[index].decimals
  );
}

function short(value: string) {
  return value.slice(0, 8) + "…" + value.slice(-6);
}

export default function MarketPage() {
  const params = useParams<{ curve: string }>();
  const searchParams = useSearchParams();
  const isTaxMarket = searchParams.get("mode") === "tax";
  const curve =
    typeof params.curve === "string" && isAddress(params.curve)
      ? (params.curve as Address)
      : null;

  const [market, setMarket] = useState<MarketState | null>(null);
  const [account, setAccount] = useState<Address | null>(null);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void connectedAccount().then((connected) => {
      if (connected) setAccount(connected);
    });
  }, []);

  const refresh = useCallback(async () => {
    const configured = isTaxMarket
      ? FORTUNE_TAX_NETWORK_CONFIGURED
      : FORTUNE_NETWORK_CONFIGURED;
    const trustedFactory = (
      isTaxMarket
        ? FORTUNE_NETWORK.contracts.taxFactory
        : FORTUNE_NETWORK.contracts.factory
    ) as Address;

    if (!curve || !configured || !isAddress(trustedFactory)) {
      setMarket(null);
      setLoading(false);
      return;
    }

    try {
      // Never render signing controls for an arbitrary contract supplied in the
      // URL. A valid market must be registered by the configured factory for
      // its exact launch type.
      const curveIndex = await publicClient.readContract({
        address: trustedFactory,
        abi: factoryAbi,
        functionName: "curveIndexPlusOne",
        args: [curve],
      });
      if (curveIndex === 0n) {
        throw new Error("This address is not a launch from Fortune's configured factory.");
      }

      const [
        token,
        phase,
        graduationReady,
        graduated,
        currentPrice,
        reserveUsd,
        graduationUsd,
        shieldTax,
        quoteCount,
        launchTimestamp,
        graduationReadyAt,
        block,
      ] = await Promise.all([
        publicClient.readContract({ address: curve, abi: curveAbi, functionName: "launchToken" }),
        publicClient.readContract({ address: curve, abi: curveAbi, functionName: "phase" }),
        publicClient.readContract({ address: curve, abi: curveAbi, functionName: "graduationReady" }),
        publicClient.readContract({ address: curve, abi: curveAbi, functionName: "graduated" }),
        publicClient.readContract({ address: curve, abi: curveAbi, functionName: "currentPriceUsd1e18" }),
        publicClient.readContract({ address: curve, abi: curveAbi, functionName: "netReserveUsd1e18" }),
        publicClient.readContract({ address: curve, abi: curveAbi, functionName: "graduationUsd1e18" }),
        publicClient.readContract({ address: curve, abi: curveAbi, functionName: "currentSnipeTaxBps" }),
        publicClient.readContract({ address: curve, abi: curveAbi, functionName: "quoteAssetCount" }),
        publicClient.readContract({ address: curve, abi: curveAbi, functionName: "launchTimestamp" }),
        publicClient.readContract({ address: curve, abi: curveAbi, functionName: "graduationReadyAt" }),
        publicClient.getBlock(),
      ]);

      const [name, symbol, totalSupply] = await Promise.all([
        publicClient.readContract({ address: token, abi: erc20Abi, functionName: "name" }),
        publicClient.readContract({ address: token, abi: erc20Abi, functionName: "symbol" }),
        publicClient.readContract({ address: token, abi: erc20Abi, functionName: "totalSupply" }),
      ]);

      const count = Math.min(Number(quoteCount), 5);
      const addresses = await Promise.all(
        Array.from({ length: count }, (_, index) =>
          publicClient.readContract({ address: curve, abi: curveAbi, functionName: "quoteAssets", args: [BigInt(index)] })
        )
      );

      const quotes = await Promise.all(
        addresses.map(async (address) => {
          const [quoteSymbol, decimals] = await Promise.all([
            publicClient.readContract({ address, abi: erc20Abi, functionName: "symbol" }),
            publicClient.readContract({ address, abi: erc20Abi, functionName: "decimals" }),
          ]);
          return { address, symbol: quoteSymbol, decimals: Number(decimals) };
        })
      );

      setMarket((previous) => ({
        token,
        name,
        symbol,
        phase: Number(phase),
        graduationReady,
        graduated,
        currentPrice,
        reserveUsd,
        graduationUsd,
        shieldTaxBps: Number(shieldTax),
        launchTimestamp: Number(launchTimestamp),
        graduationReadyAt: Number(graduationReadyAt),
        totalSupply,
        clockOffset: Number(block.timestamp) - Date.now() / 1000,
        // Keep the same array while nothing changed so the trade panels keep their quotes.
        quotes: previous && sameQuotes(previous.quotes, quotes) ? previous.quotes : quotes,
      }));
    } catch (error) {
      setMarket(null);
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not read this Fortune market."
      );
    } finally {
      setLoading(false);
    }
  }, [curve, isTaxMarket]);

  useEffect(() => {
    // Route transitions can reuse this client component. Clear the prior
    // market immediately so a failed read can never leave old signing controls
    // attached to a new curve URL.
    setMarket(null);
    setMessage("");
    setLoading(true);
  }, [curve, isTaxMarket]);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 4000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const progress = useMemo(() => {
    if (!market) return 0;
    // Once the target is reached the reserve moves on (to the pool, or back to holders).
    if (market.graduationReady || market.graduated || market.phase === 3) return 100;
    if (market.graduationUsd === 0n) return 0;
    const bps =
      (market.reserveUsd * 10_000n) / market.graduationUsd;
    return Math.min(100, Number(bps) / 100);
  }, [market]);

  const connect = useCallback(async () => {
    const next = await connectWallet();
    setAccount(next);
    return next;
  }, []);

  async function finalizeGraduation() {
    if (!curve || !market) return;
    setBusy("graduate");

    try {
      const accountAddress = account || (await connect());
      // Twenty minutes of chain time; a device clock can be off.
      const deadline =
        (await publicClient.getBlock()).timestamp + 1200n;
      const configuredFee = Number(
        process.env.NEXT_PUBLIC_PANCAKE_V3_FEE_TIER || 500
      );

      const plan = isTaxMarket
        ? encodeAbiParameters(
            [
              {
                type: "tuple",
                components: [
                  { name: "maxDustBps", type: "uint16" },
                  { name: "deadline", type: "uint64" },
                ],
              },
            ],
            [{ maxDustBps: 100, deadline }]
          )
        : encodeAbiParameters(
            [
              {
                type: "tuple",
                components: [
                  { name: "fees", type: "uint24[]" },
                  {
                    name: "maxSqrtPriceDeviationBps",
                    type: "uint16",
                  },
                  { name: "maxDustBps", type: "uint16" },
                  { name: "deadline", type: "uint64" },
                ],
              },
            ],
            [
              {
                fees: market.quotes.map(() => configuredFee),
                maxSqrtPriceDeviationBps: 100,
                maxDustBps: 100,
                deadline,
              },
            ]
          );

      const { publicClient: walletReads, walletClient } = walletClients(accountAddress);
      // Simulate and send one explicit limit: a wallet estimate stops where the
      // caught migration runs out of gas (see lib/graduation-gas.ts).
      const gas = graduationGasLimit(isTaxMarket ? 1 : market.quotes.length);
      const simulation = await walletReads.simulateContract({
        gas,
        account: accountAddress,
        address: (
          isTaxMarket
            ? FORTUNE_NETWORK.contracts.taxFactory
            : FORTUNE_NETWORK.contracts.factory
        ) as Address,
        abi: factoryAbi,
        functionName: "finalizeGraduation",
        args: [curve, plan],
      });

      if (!simulation.result) {
        throw new Error(
          "Graduation preflight returned false. The launch remains retryable."
        );
      }

      setMessage(
        isTaxMarket
          ? "Confirm the Pancake V2 tax-token graduation transaction."
          : "Confirm the Pancake V3 graduation transaction."
      );
      const hash = await walletClient.writeContract({ ...simulation.request, gas });
      const receipt = await walletReads.waitForTransactionReceipt({ hash });
      const finalized =
        receipt.status === "success" &&
        parseEventLogs({ abi: factoryAbi, eventName: "GraduationFinalized", logs: receipt.logs }).some(
          (log) => log.args.curve.toLowerCase() === curve.toLowerCase()
        );

      if (!finalized) {
        await refresh();
        throw new Error(
          "The transaction was mined but the migration did not complete, so nothing moved. The launch remains retryable."
        );
      }

      setMessage(
        isTaxMarket
          ? "Graduation confirmed. Curve trading is closed, Pancake V2 liquidity is live, and the fungible LP position is permanently locked."
          : "Graduation confirmed. Curve trading is closed and Pancake V3 liquidity is live."
      );
      await refresh();
    } catch (error) {
      setMessage(walletErrorMessage(error, "Graduation failed."));
    } finally {
      setBusy("");
    }
  }

  if (!curve) {
    return (
      <main className="page narrowPage">
        <section className="pageHeading">
          <div>
            <FortuneLogo size="md" />
            <h1>Invalid market address.</h1>
          </div>
        </section>
      </main>
    );
  }

  if (loading) {
    return (
      <main className="page narrowPage">
        <section className="pageHeading">
          <div><span className="eyebrow">FORTUNE MARKET</span><h1>Loading onchain market…</h1></div>
        </section>
      </main>
    );
  }

  if (!market) {
    return (
      <main className="page narrowPage">
        <section className="pageHeading">
          <div>
            <span className="eyebrow">FORTUNE MARKET</span>
            <h1>Market unavailable.</h1>
            <p>{message || "The curve could not be read on the configured network."}</p>
          </div>
        </section>
      </main>
    );
  }

  const rescued = market.phase === 3;

  return (
    <main className="page">
      <section className="tokenHero">
        <div className="tokenIdentity">
          <span className="tokenAvatar tokenAvatarLarge">
            {market.symbol.slice(0, 2)}
          </span>
          <div>
            <span className="eyebrow">FORTUNE MARKET</span>
            <h1 translate="no">{market.name}</h1>
            <p>
              <span translate="no">{market.symbol}</span> · Curve <span translate="no">{short(curve)}</span>
            </p>
          </div>
        </div>

        <div className="tokenHeroActions">
          <a
            className="secondaryCta"
            href={FORTUNE_NETWORK.explorerUrl + "/address/" + market.token}
            target="_blank"
            rel="noreferrer"
          >
            Token ↗
          </a>
          <button
            className="walletButton"
            onClick={async () => {
              try {
                await connect();
              } catch (error) {
                setMessage(walletErrorMessage(error, "Wallet connection failed."));
              }
            }}
          >
            {account
              ? account.slice(0, 6) + "…" + account.slice(-4)
              : "Connect wallet"}
          </button>
        </div>
      </section>

      <div className="metricsGrid four">
        <div className="metric">
          <span>Curve price</span>
          <strong>{usd(market.currentPrice)}</strong>
          <small>Onchain USD oracle model</small>
        </div>
        <div className="metric">
          <span>Graduation reserve</span>
          <strong>{usd(market.reserveUsd)}</strong>
          {market.phase === 3 ? (
            <small>Paid out pro rata to holders</small>
          ) : market.graduated ? (
            <small>Moved into the locked Pancake pool</small>
          ) : (
            <small>{progress.toFixed(2)}% of target</small>
          )}
        </div>
        <div className="metric">
          <span>Phase</span>
          <strong>
            {market.phase === 0
              ? "Curve"
              : market.phase === 1
                ? "Ready"
                : market.phase === 2
                  ? "Pancake"
                  : "Rescued"}
          </strong>
          <small>Read directly from the curve</small>
        </div>
        <div className="metric">
          <span>Launch Shield</span>
          <strong>
            {(market.shieldTaxBps / 100).toFixed(2)}%
          </strong>
          <small>Current buy-only opening tax</small>
        </div>
      </div>

      <section className="panel">
        <div className="progressHeader">
          <span>Graduation progress</span>
          <strong>{progress.toFixed(2)}%</strong>
        </div>
        <div className="progressTrack">
          <span style={{ width: progress + "%" }} />
        </div>
      </section>

      <div className="marketTradeLayout">
        <div className="marketTradeMain">
          <TokenMarketPanel token={market.token} />
        </div>
        <aside className="marketTradeSide">
          {rescued ? (
            <RescuePanel curve={curve} token={market.token} symbol={market.symbol} quotes={market.quotes} rescued graduationReadyAt={market.graduationReadyAt} clockOffset={market.clockOffset} account={account} connect={connect} onDone={() => void refresh()} />
          ) : market.graduated ? (
            isTaxMarket || market.quotes.length !== 1 ? (
              <section className="registryNotice">
                <strong>{isTaxMarket ? "PANCAKE V2 LIVE" : "PANCAKE V3 LIVE"}</strong>
                <span>
                  {isTaxMarket
                    ? "This tax launch has graduated. Curve trading is closed; Pancake V2 liquidity is live and its fungible LP tokens are permanently locked."
                    : "This launch has graduated into several pools. Curve buys and sells are closed; the graduation transaction created and permanently locked the Pancake V3 LP positions."}
                </span>
              </section>
            ) : (
              <PoolTradePanel token={market.token} symbol={market.symbol} quoteAsset={market.quotes[0]} account={account} connect={connect} onTraded={() => void refresh()} />
            )
          ) : market.graduationReady ? (
            <>
              <section className="panel">
                <span className="eyebrow">GRADUATION READY</span>
                <h2>
                  {isTaxMarket
                    ? "Move liquidity to Pancake V2"
                    : "Move liquidity to Pancake V3"}
                </h2>
                <p>
                  Finalization is permissionless. The adapter preflight checks the
                  pool configuration before any reserve transfer can complete.
                </p>
                <button
                  className="primaryCta"
                  disabled={Boolean(busy)}
                  onClick={() => void finalizeGraduation()}
                >
                  {busy === "graduate"
                    ? "Finalizing…"
                    : isTaxMarket
                      ? "Finalize Pancake V2 graduation →"
                      : "Finalize Pancake V3 graduation →"}
                </button>
              </section>
              <RescuePanel curve={curve} token={market.token} symbol={market.symbol} quotes={market.quotes} rescued={false} graduationReadyAt={market.graduationReadyAt} clockOffset={market.clockOffset} account={account} connect={connect} onDone={() => void refresh()} />
            </>
          ) : (
            <CurveTradePanel
              curve={curve}
              token={market.token}
              symbol={market.symbol}
              quotes={market.quotes}
              totalSupply={market.totalSupply}
              launchTimestamp={market.launchTimestamp}
              clockOffset={market.clockOffset}
              spotPriceUsd={market.currentPrice}
              account={account}
              connect={connect}
              onTraded={(summary) => {
                if (summary) setMessage(summary);
                void refresh();
              }}
            />
          )}
          {message ? (
            <section className="panel">
              <span className="eyebrow">TRANSACTION STATUS</span>
              <p className="launchDescription" role="status" style={{ minHeight: 0 }}>
                {message}
              </p>
            </section>
          ) : null}
        </aside>
      </div>
    </main>
  );
}
