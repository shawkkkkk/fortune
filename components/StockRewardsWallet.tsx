"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { formatUnits, parseAbi, type Address, type Hex } from "viem";
import { useLanguage } from "@/components/LanguageProvider";
import { FORTUNE_NETWORK } from "@/lib/fortune-network";
import { assertWalletIdentity } from "@/lib/launch-safety";
import { formatAmount, shortAddress } from "@/lib/market-format";
import { STOCK_REWARDS, withRewardsHeadroom } from "@/lib/stock-rewards";
import { STOCK_REWARDS_TOKEN_ABI } from "@/lib/stock-rewards-artifacts";
import type { StockRewardsLaunch } from "@/lib/stock-rewards-read";
import { connectWallet, connectedAccount, injectedProvider, walletClients, walletErrorMessage } from "@/lib/wallet";

const ERC20 = parseAbi(["function balanceOf(address) view returns (uint256)"]);

type Holding = { launch: StockRewardsLaunch; balance: bigint; claimable: bigint[] };

function units(raw: string | bigint, decimals: number) {
  return Number(formatUnits(BigInt(raw), decimals));
}

/**
 * Holder rewards across every Stock Rewards launch: what the connected wallet can claim in
 * each, and a public ledger of what each launch has paid its holders, read from the tokens.
 */
export default function StockRewardsWallet() {
  const { language } = useLanguage();
  const zh = language === "zh";
  const [launches, setLaunches] = useState<StockRewardsLaunch[] | null>(null);
  const [error, setError] = useState(false);
  const [account, setAccount] = useState<Address | null>(null);
  const [holdings, setHoldings] = useState<Holding[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!STOCK_REWARDS.enabled) return undefined;
    const controller = new AbortController();
    fetch("/api/public/v1/stock-rewards?limit=48", { signal: controller.signal })
      .then((response) => response.json())
      .then((body) => {
        if (Array.isArray(body?.data?.launches)) setLaunches(body.data.launches);
        else setError(true);
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(true);
      });
    connectedAccount().then(setAccount).catch(() => undefined);
    return () => controller.abort();
  }, []);

  const readHoldings = useCallback(async (wallet: Address, list: StockRewardsLaunch[]) => {
    const { publicClient } = walletClients(wallet);
    const rows = await Promise.all(
      list.map(async (launch) => {
        try {
          const [balance, owed] = await Promise.all([
            publicClient.readContract({ address: launch.token, abi: ERC20, functionName: "balanceOf", args: [wallet] }),
            publicClient.readContract({ address: launch.token, abi: STOCK_REWARDS_TOKEN_ABI, functionName: "claimable", args: [wallet] }) as Promise<
              readonly [readonly Address[], readonly bigint[]]
            >,
          ]);
          return { launch, balance, claimable: [...owed[1]] };
        } catch {
          return null;
        }
      })
    );
    setHoldings(rows.filter((row): row is Holding => Boolean(row && (row.balance > 0n || row.claimable.some((value) => value > 0n)))));
  }, []);

  useEffect(() => {
    if (account && launches) void readHoldings(account, launches);
  }, [account, launches, readHoldings]);

  async function run(label: string, action: (wallet: Address) => Promise<void>) {
    setBusy(true);
    setMessage(label);
    try {
      const wallet = await connectWallet();
      setAccount(wallet);
      await action(wallet);
      if (launches) await readHoldings(wallet, launches);
    } catch (problem) {
      setMessage(walletErrorMessage(problem));
    } finally {
      setBusy(false);
    }
  }

  async function claim(wallet: Address, launch: StockRewardsLaunch) {
    const { publicClient, walletClient } = walletClients(wallet);
    const call = { account: wallet, address: launch.token, abi: STOCK_REWARDS_TOKEN_ABI, functionName: "claim" } as const;
    await publicClient.simulateContract(call);
    const gas = withRewardsHeadroom(await publicClient.estimateContractGas(call), launch.stocks.length);
    await assertWalletIdentity(injectedProvider(), wallet, FORTUNE_NETWORK.chainId);
    const hash = await walletClient.writeContract({ ...call, gas });
    const receipt = await publicClient.waitForTransactionReceipt({ hash: hash as Hex });
    if (receipt.status !== "success") throw new Error(zh ? "领取被回滚。" : "The claim reverted.");
  }

  const claimable = (holdings ?? []).filter((row) => row.claimable.some((value) => value > 0n));

  if (!STOCK_REWARDS.enabled) {
    return (
      <section className="panel stockRewardsHub">
        <span className="eyebrow">STOCK REWARDS · BETA</span>
        <h2>Holders get paid in stocks</h2>
        <p className="fieldHint">Stock Rewards launches pay their holders in up to five tokenized stocks, claimable onchain at any time. The beta is not deployed on this network yet.</p>
        <Link className="secondaryCta" href="/launch/stock-rewards">See how it works →</Link>
      </section>
    );
  }

  return (
    <>
      <section className="panel stockRewardsHub" aria-busy={busy}>
        <div className="holdingsHead">
          <div>
            <span className="eyebrow">YOUR STOCK REWARDS</span>
            <h2>Every stock you have earned</h2>
          </div>
          {account ? <span className="mutedSmall" translate="no">{shortAddress(account)}</span> : (
            <button type="button" className="secondaryCta" disabled={busy} onClick={() => void run(zh ? "正在连接…" : "Connecting…", async () => setMessage(""))}>Connect wallet</button>
          )}
        </div>
        {!account ? <p className="fieldHint">Connect a wallet to see what it can claim across every Stock Rewards launch.</p> : null}
        {account && holdings === null ? <p className="fieldHint" role="status">Reading your rewards…</p> : null}
        {account && holdings && !holdings.length ? <p className="fieldHint">This wallet holds no Stock Rewards tokens yet.</p> : null}
        {holdings?.length ? (
          <div className="stockRewardsHoldings">
            {holdings.map((row) => (
              <div className="stockRewardsHolding" key={row.launch.token}>
                <div className="stockBasketName">
                  <Link href={`/stock-rewards/${row.launch.curve}`}><strong translate="no">{row.launch.name}</strong></Link>
                  <span translate="no">{formatAmount(units(row.balance, 18))} {row.launch.symbol}</span>
                </div>
                <div className="stockRewardsAmounts" translate="no">
                  {row.launch.stocks.map((stock, index) => (
                    <span key={stock.address}>{formatAmount(units(row.claimable[index] ?? 0n, stock.decimals))} {stock.symbol}</span>
                  ))}
                </div>
                <button
                  type="button"
                  className="secondaryCta"
                  disabled={busy || !row.claimable.some((value) => value > 0n)}
                  onClick={() => void run(zh ? `正在领取 ${row.launch.symbol} 的股票分红…` : `Claiming ${row.launch.symbol} rewards…`, async (wallet) => {
                    await claim(wallet, row.launch);
                    setMessage(zh ? "已领取。" : "Claimed.");
                  })}
                >
                  Claim
                </button>
              </div>
            ))}
          </div>
        ) : null}
        {claimable.length > 1 ? (
          <button
            type="button"
            className="launchButton"
            disabled={busy}
            onClick={() => void run(zh ? "正在逐个领取…" : "Claiming each in turn…", async (wallet) => {
              for (const row of claimable) {
                setMessage(zh ? `请在钱包中确认 ${row.launch.symbol}…` : `Confirm ${row.launch.symbol} in your wallet…`);
                await claim(wallet, row.launch);
              }
              setMessage(zh ? "全部已领取。" : "All claimed.");
            })}
          >
            {zh ? `领取全部 ${claimable.length} 个代币的分红` : `Claim from all ${claimable.length} tokens`}
          </button>
        ) : null}
        {message ? <p className="launchDescription" role="status">{message}</p> : null}
      </section>

      <section className="panel stockRewardsLedger">
        <span className="eyebrow">DISTRIBUTION LEDGER · BETA</span>
        <h2>What each launch has paid its holders</h2>
        <p className="fieldHint">Read from each token contract: every stock it has received for holders, since launch.</p>
        {error ? <p className="chartCoverage" role="alert">Stock Rewards launches could not be read right now.</p> : null}
        {launches && !launches.length ? <div className="emptyPanel"><strong>No Stock Rewards launches yet.</strong></div> : null}
        {launches?.length ? (
          <div className="stockLedgerRows">
            {launches.map((launch) => (
              <div className="stockLedgerRow" key={launch.token}>
                <Link href={`/stock-rewards/${launch.curve}`} translate="no"><strong>{launch.name}</strong> <span>{launch.symbol}</span></Link>
                <span className="stockLedgerAmounts" translate="no">
                  {launch.stocks.map((stock) => `${formatAmount(units(stock.totalReceived, stock.decimals))} ${stock.symbol}`).join(" · ")}
                </span>
              </div>
            ))}
          </div>
        ) : null}
      </section>
    </>
  );
}
