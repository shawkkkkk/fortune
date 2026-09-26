"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import {
  createPublicClient,
  createWalletClient,
  custom,
  defineChain,
  encodeAbiParameters,
  formatUnits,
  http,
  isAddress,
  maxUint256,
  parseUnits,
  type Address,
  type EIP1193Provider,
} from "viem";
import {
  FORTUNE_NETWORK,
  FORTUNE_NETWORK_CONFIGURED,
} from "@/lib/fortune-network";
import FortuneLogo from "@/components/FortuneLogo";
import TokenMarketPanel from "@/components/TokenMarketPanel";

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
    name: "previewBuy",
    stateMutability: "view",
    inputs: [
      { name: "quoteAsset", type: "address" },
      { name: "amountIn", type: "uint256" },
    ],
    outputs: [
      { name: "quoteSpent", type: "uint256" },
      { name: "quoteRefund", type: "uint256" },
      { name: "snipeTax", type: "uint256" },
      { name: "normalFee", type: "uint256" },
      { name: "netQuote", type: "uint256" },
      { name: "usdIn", type: "uint256" },
      { name: "tokensOut", type: "uint256" },
    ],
  },
  {
    type: "function",
    name: "previewSell",
    stateMutability: "view",
    inputs: [
      { name: "quoteAsset", type: "address" },
      { name: "tokenAmount", type: "uint256" },
    ],
    outputs: [
      { name: "grossQuote", type: "uint256" },
      { name: "normalFee", type: "uint256" },
      { name: "quoteOut", type: "uint256" },
      { name: "usdGross", type: "uint256" },
    ],
  },
  {
    type: "function",
    name: "buy",
    stateMutability: "nonpayable",
    inputs: [
      { name: "quoteAsset", type: "address" },
      { name: "amountIn", type: "uint256" },
      { name: "minTokensOut", type: "uint256" },
    ],
    outputs: [{ name: "tokensOut", type: "uint256" }],
  },
  {
    type: "function",
    name: "sell",
    stateMutability: "nonpayable",
    inputs: [
      { name: "quoteAsset", type: "address" },
      { name: "tokenAmount", type: "uint256" },
      { name: "minQuoteOut", type: "uint256" },
    ],
    outputs: [{ name: "quoteOut", type: "uint256" }],
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
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { type: "address" },
      { type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
] as const;

const factoryAbi = [
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
  quotes: QuoteInfo[];
};

const chain = defineChain({
  id: FORTUNE_NETWORK.chainId,
  name: FORTUNE_NETWORK.chainName,
  nativeCurrency: {
    name: FORTUNE_NETWORK.nativeSymbol,
    symbol: FORTUNE_NETWORK.nativeSymbol,
    decimals: 18,
  },
  rpcUrls: {
    default: { http: [FORTUNE_NETWORK.publicRpcUrl] },
  },
  blockExplorers: {
    default: {
      name: "BscScan",
      url: FORTUNE_NETWORK.explorerUrl,
    },
  },
  testnet: !FORTUNE_NETWORK.isMainnet,
});

const publicClient = createPublicClient({
  chain,
  transport: http(FORTUNE_NETWORK.publicRpcUrl),
});

function injectedProvider() {
  const ethereum = (
    window as Window & { ethereum?: EIP1193Provider }
  ).ethereum;

  if (!ethereum) {
    throw new Error(
      "No EVM wallet found. Install MetaMask or another BNB Chain compatible wallet."
    );
  }
  return ethereum;
}

async function connectWallet() {
  const ethereum = injectedProvider();
  const accounts = (await ethereum.request({
    method: "eth_requestAccounts",
  })) as Address[];

  if (!accounts?.[0]) throw new Error("Wallet did not return an account.");

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
            name: FORTUNE_NETWORK.nativeSymbol,
            symbol: FORTUNE_NETWORK.nativeSymbol,
            decimals: 18,
          },
          rpcUrls: [FORTUNE_NETWORK.publicRpcUrl],
          blockExplorerUrls: [FORTUNE_NETWORK.explorerUrl],
        },
      ],
    });
  }

  return accounts[0];
}

function walletClient(account: Address) {
  return createWalletClient({
    account,
    chain,
    transport: custom(injectedProvider()),
  });
}

function usd(value: bigint) {
  const number = Number(formatUnits(value, 18));
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: number < 1 ? 8 : 2,
  }).format(number);
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
  const [selectedQuote, setSelectedQuote] = useState(0);
  const [buyAmount, setBuyAmount] = useState("");
  const [sellAmount, setSellAmount] = useState("");
  const [quoteBalance, setQuoteBalance] = useState<bigint>(0n);
  const [tokenBalance, setTokenBalance] = useState<bigint>(0n);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  const quote = market?.quotes[selectedQuote] || null;

  const refresh = useCallback(async () => {
    if (!curve || !FORTUNE_NETWORK_CONFIGURED) {
      setLoading(false);
      return;
    }

    try {
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
      ] = await Promise.all([
        publicClient.readContract({
          address: curve,
          abi: curveAbi,
          functionName: "launchToken",
        }),
        publicClient.readContract({
          address: curve,
          abi: curveAbi,
          functionName: "phase",
        }),
        publicClient.readContract({
          address: curve,
          abi: curveAbi,
          functionName: "graduationReady",
        }),
        publicClient.readContract({
          address: curve,
          abi: curveAbi,
          functionName: "graduated",
        }),
        publicClient.readContract({
          address: curve,
          abi: curveAbi,
          functionName: "currentPriceUsd1e18",
        }),
        publicClient.readContract({
          address: curve,
          abi: curveAbi,
          functionName: "netReserveUsd1e18",
        }),
        publicClient.readContract({
          address: curve,
          abi: curveAbi,
          functionName: "graduationUsd1e18",
        }),
        publicClient.readContract({
          address: curve,
          abi: curveAbi,
          functionName: "currentSnipeTaxBps",
        }),
        publicClient.readContract({
          address: curve,
          abi: curveAbi,
          functionName: "quoteAssetCount",
        }),
      ]);

      const [name, symbol] = await Promise.all([
        publicClient.readContract({
          address: token,
          abi: erc20Abi,
          functionName: "name",
        }),
        publicClient.readContract({
          address: token,
          abi: erc20Abi,
          functionName: "symbol",
        }),
      ]);

      const count = Math.min(Number(quoteCount), 5);
      const addresses = await Promise.all(
        Array.from({ length: count }, (_, index) =>
          publicClient.readContract({
            address: curve,
            abi: curveAbi,
            functionName: "quoteAssets",
            args: [BigInt(index)],
          })
        )
      );

      const quotes = await Promise.all(
        addresses.map(async (address) => {
          const [quoteSymbol, decimals] = await Promise.all([
            publicClient.readContract({
              address,
              abi: erc20Abi,
              functionName: "symbol",
            }),
            publicClient.readContract({
              address,
              abi: erc20Abi,
              functionName: "decimals",
            }),
          ]);

          return {
            address,
            symbol: quoteSymbol,
            decimals: Number(decimals),
          };
        })
      );

      setMarket({
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
        quotes,
      });

      if (selectedQuote >= quotes.length) setSelectedQuote(0);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not read this Fortune market."
      );
    } finally {
      setLoading(false);
    }
  }, [curve, selectedQuote]);

  const refreshBalances = useCallback(async () => {
    if (!account || !market || !quote) return;

    const [nextQuote, nextToken] = await Promise.all([
      publicClient.readContract({
        address: quote.address,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [account],
      }),
      publicClient.readContract({
        address: market.token,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [account],
      }),
    ]);

    setQuoteBalance(nextQuote);
    setTokenBalance(nextToken);
  }, [account, market, quote]);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 4000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  useEffect(() => {
    void refreshBalances();
  }, [refreshBalances]);

  const progress = useMemo(() => {
    if (!market || market.graduationUsd === 0n) return 0;
    const bps =
      (market.reserveUsd * 10_000n) / market.graduationUsd;
    return Math.min(100, Number(bps) / 100);
  }, [market]);

  async function ensureAccount() {
    const next = account || (await connectWallet());
    setAccount(next);
    return next;
  }

  async function approve(
    token: Address,
    spender: Address,
    accountAddress: Address
  ) {
    const client = walletClient(accountAddress);
    const hash = await client.writeContract({
      address: token,
      abi: erc20Abi,
      functionName: "approve",
      args: [spender, maxUint256],
    });
    await publicClient.waitForTransactionReceipt({ hash });
  }

  async function buy() {
    if (!curve || !market || !quote) return;
    setBusy("buy");

    try {
      if (market.shieldTaxBps > 0) {
        throw new Error(
          "Launch Shield is still active. Fortune blocks the UI from buying during the opening tax window. Wait a few seconds."
        );
      }

      const accountAddress = await ensureAccount();
      const amount = parseUnits(buyAmount, quote.decimals);
      if (amount <= 0n) throw new Error("Enter a buy amount.");

      const preview = await publicClient.readContract({
        address: curve,
        abi: curveAbi,
        functionName: "previewBuy",
        args: [quote.address, amount],
      });

      const tokensOut = preview[6];
      const minTokensOut = (tokensOut * 99n) / 100n;

      setMessage("Approve the quote asset in your wallet.");
      await approve(quote.address, curve, accountAddress);

      setMessage("Confirm the Fortune curve buy.");
      const client = walletClient(accountAddress);
      const hash = await client.writeContract({
        address: curve,
        abi: curveAbi,
        functionName: "buy",
        args: [quote.address, amount, minTokensOut],
      });

      await publicClient.waitForTransactionReceipt({ hash });
      setMessage("Buy confirmed.");
      setBuyAmount("");
      await Promise.all([refresh(), refreshBalances()]);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Buy failed."
      );
    } finally {
      setBusy("");
    }
  }

  async function sell() {
    if (!curve || !market || !quote) return;
    setBusy("sell");

    try {
      const accountAddress = await ensureAccount();
      const amount = parseUnits(sellAmount, 18);
      if (amount <= 0n) throw new Error("Enter a sell amount.");

      const preview = await publicClient.readContract({
        address: curve,
        abi: curveAbi,
        functionName: "previewSell",
        args: [quote.address, amount],
      });

      const quoteOut = preview[2];
      const minQuoteOut = (quoteOut * 99n) / 100n;

      setMessage("Approve the Fortune token in your wallet.");
      await approve(market.token, curve, accountAddress);

      setMessage("Confirm the Fortune curve sell.");
      const client = walletClient(accountAddress);
      const hash = await client.writeContract({
        address: curve,
        abi: curveAbi,
        functionName: "sell",
        args: [quote.address, amount, minQuoteOut],
      });

      await publicClient.waitForTransactionReceipt({ hash });
      setMessage("Sell confirmed.");
      setSellAmount("");
      await Promise.all([refresh(), refreshBalances()]);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Sell failed."
      );
    } finally {
      setBusy("");
    }
  }

  async function finalizeGraduation() {
    if (!curve || !market) return;
    setBusy("graduate");

    try {
      const accountAddress = await ensureAccount();
      const deadline =
        BigInt(Math.floor(Date.now() / 1000) + 1200);
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

      const simulation = await publicClient.simulateContract({
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
      const client = walletClient(accountAddress);
      const hash = await client.writeContract(simulation.request);
      await publicClient.waitForTransactionReceipt({ hash });

      setMessage(
        isTaxMarket
          ? "Graduation confirmed. Curve trading is closed, Pancake V2 liquidity is live, and the fungible LP position is permanently locked."
          : "Graduation confirmed. Curve trading is closed and Pancake V3 liquidity is live."
      );
      await refresh();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Graduation failed."
      );
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
                const next = await connectWallet();
                setAccount(next);
              } catch (error) {
                setMessage(
                  error instanceof Error
                    ? error.message
                    : "Wallet connection failed."
                );
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
          <small>{progress.toFixed(2)}% of target</small>
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

      <TokenMarketPanel token={market.token} />

      {market.graduated ? (
        <section className="registryNotice" style={{ marginTop: 14 }}>
          <strong>{isTaxMarket ? "PANCAKE V2 LIVE" : "PANCAKE V3 LIVE"}</strong>
          <span>
            {isTaxMarket
              ? "This tax launch has graduated. Curve trading is closed; Pancake V2 liquidity is live and its fungible LP tokens are permanently locked."
              : "This launch has graduated. Curve buys and sells are closed; the graduation transaction created and permanently locked the Pancake V3 LP position."}
          </span>
        </section>
      ) : market.graduationReady ? (
        <section className="panel" style={{ marginTop: 14 }}>
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
      ) : (
        <div className="tokenGrid" style={{ marginTop: 14 }}>
          <section className="panel tradePanel">
            <span className="eyebrow">BUY</span>
            <h2>Buy on the Fortune curve</h2>

            {market.quotes.length > 1 ? (
              <label>
                Quote asset
                <select
                  value={selectedQuote}
                  onChange={(event) =>
                    setSelectedQuote(Number(event.target.value))
                  }
                >
                  {market.quotes.map((item, index) => (
                    <option key={item.address} value={index}>
                      {item.symbol}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            <label>
              Amount · {quote?.symbol}
              <input
                value={buyAmount}
                inputMode="decimal"
                onChange={(event) => setBuyAmount(event.target.value)}
                placeholder="0"
              />
            </label>

            <div className="quoteBox">
              <span>Wallet balance</span>
              <strong>
                {quote
                  ? Number(
                      formatUnits(quoteBalance, quote.decimals)
                    ).toLocaleString(undefined, {
                      maximumFractionDigits: 6,
                    })
                  : "—"}{" "}
                {quote?.symbol}
              </strong>
            </div>

            {market.shieldTaxBps > 0 ? (
              <div className="registryNotice">
                <strong>LAUNCH SHIELD ACTIVE</strong>
                <span>
                  Buy UI is temporarily disabled while the opening tax is
                  non-zero. It automatically reaches zero after the five-second
                  launch window.
                </span>
              </div>
            ) : null}

            <button
              className="launchButton"
              disabled={
                Boolean(busy) ||
                market.shieldTaxBps > 0 ||
                !buyAmount
              }
              onClick={() => void buy()}
            >
              {busy === "buy" ? "Buying…" : "Approve + buy →"}
            </button>
          </section>

          <section className="panel tradePanel">
            <span className="eyebrow">SELL</span>
            <h2>Sell back to the curve</h2>

            <label>
              Amount · {market.symbol}
              <input
                value={sellAmount}
                inputMode="decimal"
                onChange={(event) => setSellAmount(event.target.value)}
                placeholder="0"
              />
            </label>

            <div className="quoteBox">
              <span>Wallet balance</span>
              <strong>
                {Number(
                  formatUnits(tokenBalance, 18)
                ).toLocaleString(undefined, {
                  maximumFractionDigits: 6,
                })}{" "}
                {market.symbol}
              </strong>
            </div>

            <button
              className="secondaryCta"
              disabled={Boolean(busy) || !sellAmount}
              onClick={() => void sell()}
            >
              {busy === "sell" ? "Selling…" : "Approve + sell →"}
            </button>
          </section>
        </div>
      )}

      <section className="panel" style={{ marginTop: 14 }}>
        <span className="eyebrow">TRANSACTION STATUS</span>
        <p className="launchDescription" style={{ minHeight: 0 }}>
          {message || "Ready."}
        </p>
      </section>
    </main>
  );
}
