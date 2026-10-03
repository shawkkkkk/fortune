"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { decodeEventLog, formatUnits, hexToString, parseUnits, type Address, type Hex } from "viem";
import TokenImageInput from "@/components/TokenImageInput";
import { useLanguage } from "@/components/LanguageProvider";
import { byteLength, publicMetadataUrl } from "@/lib/creator-metadata";
import { FORTUNE_NETWORK } from "@/lib/fortune-network";
import { assertWalletIdentity } from "@/lib/launch-safety";
import { formatShare, formatUsd } from "@/lib/market-format";
import { formatTaxBps } from "@/lib/pair-inspector-text";
import { PENNY_MAX_USD } from "@/lib/pair-reasons";
import {
  STOCK_REWARDS,
  STOCK_REWARDS_RULES,
  checkWeights,
  curveEconomics,
  equalWeights,
  graduationPrice,
  minimumTargetFor,
  poolPriceFits,
  preflightText,
} from "@/lib/stock-rewards";
import { STOCK_REWARDS_FACTORY_ABI } from "@/lib/stock-rewards-artifacts";
import type { StockListing } from "@/lib/stock-rewards-read";
import { connectWallet, connectedAccount, injectedProvider, walletClients, walletErrorMessage } from "@/lib/wallet";

const TARGETS = [1_000, 10_000, 50_000] as const;
const CREATOR_FEES = [0, 25, 50, 100] as const;
const HOLDER_FEES = [25, 50, 100, 250] as const;

type Picked = { address: Address; share: string };

function usd(raw: bigint | string) {
  return Number(formatUnits(BigInt(raw), 18));
}

function isPenny(stock: StockListing) {
  return stock.category === "penny-stock" || usd(stock.priceUsd1e18) < PENNY_MAX_USD;
}

/** "33.33" → 3333 basis points; null unless a number with at most two decimals. */
function shareBps(value: string) {
  const clean = value.trim();
  if (!/^\d{1,3}(?:\.\d{1,2})?$/.test(clean)) return null;
  return Math.round(Number(clean) * 100);
}

function bpsText(bps: number) {
  return (bps / 100).toFixed(2).replace(/\.?0+$/, "");
}

function parseTarget(value: string) {
  const clean = value.trim().replace(/[$,\s]/g, "");
  if (!/^\d+(?:\.\d{1,2})?$/.test(clean)) return null;
  try {
    return parseUnits(clean, 18);
  } catch {
    return null;
  }
}

export default function StockRewardsLaunchPage() {
  const { language } = useLanguage();
  const zh = language === "zh";
  const [listings, setListings] = useState<StockListing[] | null>(null);
  const [listError, setListError] = useState(false);
  const [paused, setPaused] = useState(false);
  const [tab, setTab] = useState<"stocks" | "penny">("stocks");
  const [picked, setPicked] = useState<Picked[]>([]);
  const [account, setAccount] = useState<Address | null>(null);
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [imageURI, setImageURI] = useState("");
  const [imageBusy, setImageBusy] = useState(false);
  const [description, setDescription] = useState("");
  const [website, setWebsite] = useState("");
  const [xProfile, setXProfile] = useState("");
  const [telegram, setTelegram] = useState("");
  const [target, setTarget] = useState("10000");
  const [creatorFeeBps, setCreatorFeeBps] = useState<number>(50);
  const [holderFeeBps, setHolderFeeBps] = useState<number>(50);
  const [poolFee, setPoolFee] = useState<number>(10_000);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [launched, setLaunched] = useState<{ curve: Address; token: Address; hash: Hex } | null>(null);

  useEffect(() => {
    connectedAccount().then(setAccount).catch(() => undefined);
    if (!STOCK_REWARDS.enabled) return;
    const controller = new AbortController();
    fetch("/api/public/v1/stock-rewards/stocks", { signal: controller.signal })
      .then((response) => response.json())
      .then((body) => {
        if (Array.isArray(body?.data?.stocks)) setListings(body.data.stocks);
        else setListError(true);
      })
      .catch(() => {
        if (!controller.signal.aborted) setListError(true);
      });
    fetch("/api/public/v1/stock-rewards?limit=1", { signal: controller.signal })
      .then((response) => response.json())
      .then((body) => setPaused(body?.data?.launchesPaused === true))
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  const byAddress = useMemo(() => new Map((listings ?? []).map((stock) => [stock.address.toLowerCase(), stock])), [listings]);
  const shown = (listings ?? []).filter((stock) => (tab === "penny" ? isPenny(stock) : !isPenny(stock)));
  const pennyCount = (listings ?? []).filter(isPenny).length;

  function toggle(stock: StockListing) {
    setPicked((current) => {
      const exists = current.some((item) => item.address.toLowerCase() === stock.address.toLowerCase());
      const next = exists
        ? current.filter((item) => item.address.toLowerCase() !== stock.address.toLowerCase())
        : current.length >= STOCK_REWARDS_RULES.maxStocks
          ? current
          : [...current, { address: stock.address, share: "" }];
      const even = equalWeights(next.length);
      return next.map((item, index) => ({ ...item, share: bpsText(even[index]) }));
    });
  }

  function splitEvenly() {
    setPicked((current) => {
      const even = equalWeights(current.length);
      return current.map((item, index) => ({ ...item, share: bpsText(even[index]) }));
    });
  }

  const weights = picked.map((item) => shareBps(item.share));
  const weightCheck = weights.some((weight) => weight === null)
    ? ({ ok: false, reason: "Enter each share as a percentage, such as 33.33.", reasonZh: "请以百分比填写每个份额，例如 33.33。" } as const)
    : checkWeights(weights as number[]);

  const targetRaw = parseTarget(target);
  const economics = useMemo(() => {
    if (!targetRaw || targetRaw < STOCK_REWARDS_RULES.minGraduationUsd || targetRaw > STOCK_REWARDS_RULES.maxGraduationUsd) return null;
    const { base, slope, ok } = curveEconomics(targetRaw);
    if (!ok) return null;
    const endPrice = graduationPrice(targetRaw);
    const supply = Number(formatUnits(STOCK_REWARDS_RULES.totalSupply, 18));
    const poolTokens = Number(formatUnits((targetRaw * 10n ** 18n) / endPrice, 18));
    return {
      base,
      slope,
      endPrice,
      openingCap: usd(base) * supply,
      graduationCap: usd(endPrice) * supply,
      poolShare: poolTokens / supply,
      burnedShare: Math.max(0, 1 - 0.55 - poolTokens / supply),
    };
  }, [targetRaw]);

  // Pools the graduation adapter could not price at this target, with the target that would fit.
  const priceProblems = picked
    .map((item) => byAddress.get(item.address.toLowerCase()))
    .filter((stock): stock is StockListing => Boolean(stock))
    .filter((stock) => economics && !poolPriceFits(BigInt(stock.priceUsd1e18), stock.decimals, economics.endPrice))
    .map((stock) => ({ stock, minimum: minimumTargetFor(BigInt(stock.priceUsd1e18), stock.decimals) }));
  const unhealthy = picked
    .map((item) => byAddress.get(item.address.toLowerCase()))
    .filter((stock): stock is StockListing => Boolean(stock && !stock.healthy));

  const stocksError = !picked.length
    ? (zh ? "请选择一到五只股票。" : "Choose one to five stocks.")
    : !weightCheck.ok
      ? (zh ? weightCheck.reasonZh : weightCheck.reason)
      : unhealthy.length
        ? (zh ? `${unhealthy.map((stock) => stock.symbol).join("、")} 的价格暂时无法读取。` : `${unhealthy.map((stock) => stock.symbol).join(", ")} has no fresh price right now.`)
        : "";

  const economicsError = !targetRaw
    ? (zh ? "请以美元填写毕业目标。" : "Enter the graduation target in dollars.")
    : !economics
      ? (zh ? "毕业目标必须在 10 美元到 1,000,000 美元之间。" : "The graduation target must be between $10 and $1,000,000.")
      : priceProblems.length
        ? priceProblems
            .map(({ stock, minimum }) => zh
              ? `在此目标下无法为 ${stock.symbol} 的资金池定价${minimum ? `，目标至少需要 ${formatUsd(minimum)}` : ""}。`
              : `${stock.symbol}'s pool cannot be priced at this target${minimum ? `; raise it to at least ${formatUsd(minimum)}` : ""}.`)
            .join(" ")
        : "";

  const identityError = (() => {
    if (!name.trim() || byteLength(name.trim()) > 64) return zh ? "请填写名称（最多 64 字节）。" : "Add a name (up to 64 bytes).";
    if (!symbol.trim() || byteLength(symbol.trim()) > 16) return zh ? "请填写代码（最多 16 字节）。" : "Add a ticker (up to 16 bytes).";
    if (!imageURI.trim()) return zh ? "请添加图片。" : "Add an image.";
    if (byteLength(description) > 1024) return zh ? "简介请控制在 1,024 字节以内。" : "Keep the description under 1,024 bytes.";
    try {
      publicMetadataUrl("Image", imageURI, true);
      publicMetadataUrl("Website", website);
      publicMetadataUrl("X", xProfile);
      publicMetadataUrl("Telegram", telegram);
    } catch (error) {
      return error instanceof Error ? error.message : "Check the links.";
    }
    if ([imageURI, website, xProfile, telegram].some((value) => byteLength(value.trim()) > 256)) {
      return zh ? "每个链接最多 256 字节。" : "Each link must be at most 256 bytes.";
    }
    return "";
  })();

  const totalFeeBps = creatorFeeBps + holderFeeBps + STOCK_REWARDS_RULES.protocolFeeBps;
  const holderShareOfPoolFees = (poolFee / 100) * (1 - STOCK_REWARDS_RULES.pancakeProtocolShareBps / 10_000);
  const ready = STOCK_REWARDS.enabled && !paused && !stocksError && !economicsError && !identityError;

  async function launch() {
    if (!ready || !STOCK_REWARDS.factory || !targetRaw) return;
    setBusy(true);
    setLaunched(null);
    setMessage(zh ? "正在连接钱包…" : "Connecting your wallet…");
    try {
      const wallet = await connectWallet();
      setAccount(wallet);
      const { publicClient, walletClient } = walletClients(wallet);
      const factory = STOCK_REWARDS.factory;
      const params = {
        name: name.trim(),
        symbol: symbol.trim(),
        stocks: picked.map((item) => item.address),
        weightsBps: weights as number[],
        graduationUsd1e18: targetRaw,
        creatorFeeBps,
        holderFeeBps,
        poolFee,
        description: description.trim(),
        imageURI: imageURI.trim(),
        website: website.trim(),
        xProfile: xProfile.trim(),
        telegram: telegram.trim(),
      };
      setMessage(zh ? "正在运行工厂预检…" : "Running the factory preflight…");
      const [preflightOk, reason] = (await publicClient.readContract({
        address: factory,
        abi: STOCK_REWARDS_FACTORY_ABI,
        functionName: "preflight",
        args: [params],
      })) as readonly [boolean, Hex];
      if (!preflightOk) throw new Error(preflightText(hexToString(reason).replace(/\0/g, ""), zh));
      setMessage(zh ? "正在模拟发行…" : "Simulating the launch…");
      await publicClient.simulateContract({ account: wallet, address: factory, abi: STOCK_REWARDS_FACTORY_ABI, functionName: "createLaunch", args: [params] });
      setMessage(zh ? "请在钱包中确认发行…" : "Confirm the launch in your wallet…");
      await assertWalletIdentity(injectedProvider(), wallet, FORTUNE_NETWORK.chainId);
      const hash = await walletClient.writeContract({ address: factory, abi: STOCK_REWARDS_FACTORY_ABI, functionName: "createLaunch", args: [params] });
      setMessage(zh ? "正在等待 BNB Chain 确认…" : "Waiting for BNB Chain to confirm…");
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error(zh ? "发行交易被回滚。" : "The launch transaction reverted.");
      for (const log of receipt.logs) {
        if (log.address.toLowerCase() !== factory.toLowerCase()) continue;
        try {
          const event = decodeEventLog({ abi: STOCK_REWARDS_FACTORY_ABI, data: log.data, topics: log.topics });
          if (event.eventName === "LaunchCreated") {
            const args = event.args as unknown as { token: Address; curve: Address };
            setLaunched({ curve: args.curve, token: args.token, hash });
            setMessage(zh ? "已发行。你的曲线已上线。" : "Launched. Your curve is live.");
            return;
          }
        } catch {
          /* Not the launch event. */
        }
      }
      throw new Error(zh ? "交易已确认，但未找到发行事件。" : "The transaction confirmed but no launch event was found.");
    } catch (error) {
      setMessage(walletErrorMessage(error, zh ? "发行未完成。" : "The launch did not go through."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="page launchPage stockRewardsLaunchPage">
      <section className="pageHeading launchHeading">
        <div>
          <span className="eyebrow">STOCK REWARDS · BETA</span>
          <h1>Holders earn the stocks.</h1>
          <p>Pair your token with up to five tokenized stocks. Every trade pays holders in the stock it used, and after graduation the pools keep paying them. Claim every stock in one click, whenever you like.</p>
        </div>
        <img className="launchHeadingArt" src="/fortune-cat-cutout-400.webp" alt="" width="170" height="170" />
      </section>

      <div className={"registryNotice" + (STOCK_REWARDS.enabled ? "" : " statusError")}>
        <strong>{STOCK_REWARDS.enabled ? "UNAUDITED BETA · " + FORTUNE_NETWORK.chainName.toUpperCase() : "NOT DEPLOYED ON THIS NETWORK YET"}</strong>
        <span>
          {STOCK_REWARDS.enabled
            ? "Stock Rewards contracts are separate from the frozen Standard candidate and have not been audited. The stocks here are faucet test shares with test prices; they have no value."
            : FORTUNE_NETWORK.isMainnet
              ? "Stock Rewards stay off BNB Smart Chain mainnet until their own audit passes."
              : "The Stock Rewards beta factory has not been deployed on this network yet."}
        </span>
      </div>

      <div className="launchLayout">
        <div className="launchMain">
          <fieldset aria-label="Stock Rewards launch details" disabled={busy || imageBusy} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
            <section className="formCard">
              <div className="formSectionTitle"><span>01</span><div><h2>Stocks</h2><p>Choose one to five. Buyers pay with any of them, and holders earn all of them.</p></div></div>
              <div className="tradeTabs stockRewardsTabs" role="group" aria-label="Stock list">
                <button type="button" aria-pressed={tab === "stocks"} className={tab === "stocks" ? "active" : undefined} onClick={() => setTab("stocks")}>Stocks</button>
                <button type="button" aria-pressed={tab === "penny"} className={tab === "penny" ? "active" : undefined} onClick={() => setTab("penny")}>
                  {zh ? `低价股 · ${pennyCount}` : `Penny stocks · ${pennyCount}`}
                </button>
              </div>
              {listError ? <p className="fieldError" role="alert">The stock list could not be read right now. Reload to try again.</p> : null}
              {!listings && !listError && STOCK_REWARDS.enabled ? <p className="fieldHint" role="status">Reading the stock registry…</p> : null}
              {listings && !shown.length ? <p className="fieldHint">{tab === "penny" ? "No penny stocks are listed yet." : "No stocks are listed yet."}</p> : null}
              {shown.length ? (
                <div className="stockPickGrid">
                  {shown.map((stock) => {
                    const selected = picked.some((item) => item.address.toLowerCase() === stock.address.toLowerCase());
                    const full = !selected && picked.length >= STOCK_REWARDS_RULES.maxStocks;
                    return (
                      <button
                        key={stock.address}
                        type="button"
                        className={"stockPick" + (selected ? " selected" : "")}
                        aria-pressed={selected}
                        disabled={full}
                        title={full ? "Five stocks is the maximum" : undefined}
                        onClick={() => toggle(stock)}
                      >
                        <strong translate="no">{stock.symbol}</strong>
                        <span translate="no">{stock.name}</span>
                        <small translate="no">{formatUsd(usd(stock.priceUsd1e18))}{stock.healthy ? "" : zh ? " · 价格过期" : " · stale price"}</small>
                      </button>
                    );
                  })}
                </div>
              ) : null}

              {picked.length ? (
                <div className="stockShares">
                  <div className="stockSharesHead">
                    <strong>{zh ? `已选 ${picked.length}/5` : `${picked.length} of 5 chosen`}</strong>
                    <button type="button" className="linkButton" onClick={splitEvenly}>Split evenly</button>
                  </div>
                  {picked.map((item, index) => {
                    const stock = byAddress.get(item.address.toLowerCase());
                    const targetShare = targetRaw && weights[index] ? usd((targetRaw * BigInt(weights[index] as number)) / 10_000n) : null;
                    return (
                      <div className="stockShareRow" key={item.address}>
                        <span className="stockShareName" translate="no">{stock?.symbol ?? item.address.slice(0, 8)}</span>
                        <label className="stockShareInput">
                          <span className="srOnly" translate="no">{zh ? `${stock?.symbol ?? ""} 的份额（%）` : `${stock?.symbol ?? ""} share (%)`}</span>
                          <input
                            value={item.share}
                            inputMode="decimal"
                            aria-invalid={shareBps(item.share) === null || (shareBps(item.share) as number) < STOCK_REWARDS_RULES.minWeightBps}
                            onChange={(event) => setPicked((current) => current.map((row, rowIndex) => (rowIndex === index ? { ...row, share: event.target.value } : row)))}
                          />
                          <span aria-hidden="true">%</span>
                        </label>
                        <small className="fieldHint" translate="no">{targetShare !== null ? (zh ? `筹集 ${formatUsd(targetShare)}` : `raises ${formatUsd(targetShare)}`) : ""}</small>
                        <button type="button" className="linkButton" onClick={() => stock && toggle(stock)} aria-label={zh ? `移除 ${stock?.symbol ?? ""}` : `Remove ${stock?.symbol ?? ""}`}>{zh ? "移除" : "Remove"}</button>
                      </div>
                    );
                  })}
                  <p className="fieldHint">Each stock raises its share of the target, at least 10%. Once a stock&apos;s share is full, buyers pay with the others, so every stock gets its own PancakeSwap pool at graduation.</p>
                </div>
              ) : null}
            </section>

            <section className="formCard">
              <div className="formSectionTitle"><span>02</span><div><h2>Token identity</h2><p>Stored onchain with your launch. It cannot be edited later.</p></div></div>
              <div className="fieldGrid">
                <label>Token name<input value={name} maxLength={64} onChange={(event) => setName(event.target.value)} placeholder="Your token name" /></label>
                <label>Ticker<input value={symbol} maxLength={16} onChange={(event) => setSymbol(event.target.value)} placeholder="LUCK" /></label>
              </div>
              <TokenImageInput value={imageURI} disabled={busy} onChange={setImageURI} onBusy={setImageBusy} />
              <label>Description · optional<textarea value={description} rows={3} maxLength={1024} onChange={(event) => setDescription(event.target.value)} placeholder="What is your token about?" /><small className="fieldHint">{byteLength(description)} / 1024 UTF-8 bytes</small></label>
              <div className="fieldGrid">
                <label>Website · optional<input value={website} maxLength={256} onChange={(event) => setWebsite(event.target.value)} placeholder="https://…" /></label>
                <label>X · optional<input value={xProfile} maxLength={256} onChange={(event) => setXProfile(event.target.value)} placeholder="https://x.com/…" /></label>
                <label>Telegram · optional<input value={telegram} maxLength={256} onChange={(event) => setTelegram(event.target.value)} placeholder="https://t.me/…" /></label>
              </div>
            </section>

            <section className="formCard">
              <div className="formSectionTitle"><span>03</span><div><h2>Curve and fees</h2><p>1,000,000,000 tokens on a USD-priced curve, from the stocks&apos; prices.</p></div></div>
              <fieldset className="customFeeChoice">
                <legend>Graduation target</legend>
                <div className="launchModeRow">
                  {TARGETS.map((dollars) => (
                    <button key={dollars} type="button" className={target === String(dollars) ? "selectedMode" : undefined} aria-pressed={target === String(dollars)} onClick={() => setTarget(String(dollars))}>
                      <strong translate="no">{formatUsd(dollars)}</strong>
                      <span>{dollars === 1_000 ? "Quick test" : dollars === 10_000 ? "Typical" : "Deeper pools"}</span>
                    </button>
                  ))}
                </div>
                <label className="stockTargetInput">Or any amount in dollars<input value={target} inputMode="decimal" onChange={(event) => setTarget(event.target.value)} /></label>
              </fieldset>
              <fieldset className="customFeeChoice">
                <legend>Holder fee on every curve trade</legend>
                <div className="launchModeRow">
                  {HOLDER_FEES.map((bps) => (
                    <button key={bps} type="button" className={holderFeeBps === bps ? "selectedMode" : undefined} aria-pressed={holderFeeBps === bps} onClick={() => setHolderFeeBps(bps)}>
                      <strong translate="no">{formatTaxBps(bps)}</strong>
                      <span>Paid to holders</span>
                    </button>
                  ))}
                </div>
              </fieldset>
              <fieldset className="customFeeChoice">
                <legend>Creator fee on every curve trade</legend>
                <div className="launchModeRow">
                  {CREATOR_FEES.map((bps) => (
                    <button key={bps} type="button" className={creatorFeeBps === bps ? "selectedMode" : undefined} aria-pressed={creatorFeeBps === bps} onClick={() => setCreatorFeeBps(bps)}>
                      <strong translate="no">{formatTaxBps(bps)}</strong>
                      <span>{bps === 0 ? "No creator fee" : "To your wallet"}</span>
                    </button>
                  ))}
                </div>
              </fieldset>
              <fieldset className="customFeeChoice">
                <legend>PancakeSwap pool fee after graduation</legend>
                <div className="launchModeRow">
                  {STOCK_REWARDS_RULES.poolFees.map((fee) => (
                    <button key={fee} type="button" className={poolFee === fee ? "selectedMode" : undefined} aria-pressed={poolFee === fee} onClick={() => setPoolFee(fee)}>
                      <strong translate="no">{fee === 2_500 ? "0.25%" : "1%"}</strong>
                      <span>{fee === 2_500 ? "Cheaper trading" : "More rewards for holders"}</span>
                    </button>
                  ))}
                </div>
              </fieldset>
              <p className="fieldHint" translate="no">{zh
                ? `每笔曲线交易共收取 ${formatTaxBps(totalFeeBps)}：持有者 ${formatTaxBps(holderFeeBps)}、创作者 ${formatTaxBps(creatorFeeBps)}、协议 0.5%，以该笔交易使用的股票支付。你之后可以把创作者费永久转给持有者。`
                : `Each curve trade pays ${formatTaxBps(totalFeeBps)} in the stock it uses: ${formatTaxBps(holderFeeBps)} to holders, ${formatTaxBps(creatorFeeBps)} to you and 0.5% to the protocol. You can hand your share to holders for good later.`}</p>
              {economics ? (
                <dl className="curvePreview" translate="no">
                  <div><dt>{zh ? "开盘完全稀释市值" : "Opening fully diluted value"}</dt><dd>{formatUsd(economics.openingCap)}</dd></div>
                  <div><dt>{zh ? "毕业时完全稀释市值" : "Fully diluted value at graduation"}</dt><dd>≈ {formatUsd(economics.graduationCap)}</dd></div>
                  <div><dt>{zh ? "曲线涨幅" : "Price rise on the curve"}</dt><dd>10×</dd></div>
                  <div><dt>{zh ? "曲线售出" : "Sold on the curve"}</dt><dd>{zh ? "55% 的供应量" : "55% of supply"}</dd></div>
                  <div><dt>{zh ? "注入资金池" : "Seeds the pools"}</dt><dd>{formatShare(economics.poolShare)}{zh ? " 的供应量 + 全部股票" : " of supply + every stock raised"}</dd></div>
                  <div><dt>{zh ? "毕业时销毁" : "Burned at graduation"}</dt><dd>≈ {formatShare(economics.burnedShare)}{zh ? " 的供应量" : " of supply"}</dd></div>
                  <div><dt>{zh ? "毕业后持有者所得" : "Holders after graduation"}</dt><dd>{zh ? `${holderShareOfPoolFees.toFixed(2)}% 的股票侧兑换额` : `${holderShareOfPoolFees.toFixed(2)}% of stock-side swaps`}</dd></div>
                </dl>
              ) : null}
              <p className="fieldHint">Prices move with the stocks: the curve values each payment at the oracle price when it lands, so the raise reaches the target sooner if the stocks rise.</p>
            </section>

            <section className="formCard">
              <div className="formSectionTitle"><span>04</span><div><h2>Launch</h2><p>Your wallet signs one transaction. There is no creator first buy: the Launch Shield takes 99% of a buy in the launch&apos;s first second.</p></div></div>
              <ul className="customChecklist">
                <li className={!stocksError ? "done" : undefined} translate="no">{stocksError || (zh ? `${picked.length} 只股票，份额合计 100%` : `${picked.length} stock${picked.length === 1 ? "" : "s"}, shares add up to 100%`)}</li>
                <li className={!identityError ? "done" : undefined}>{identityError || "Identity complete"}</li>
                <li className={!economicsError ? "done" : undefined} translate="no">{economicsError || (zh ? `毕业目标 ${formatUsd(usd(targetRaw ?? 0n))}` : `Graduation target ${formatUsd(usd(targetRaw ?? 0n))}`)}</li>
              </ul>
              <button className="launchButton" disabled={!ready || busy} onClick={() => void launch()}>
                {busy ? "Working…" : !STOCK_REWARDS.enabled ? "Stock Rewards are not live on this network" : paused ? "Launches paused" : "Launch on BSC Testnet →"}
              </button>
              {message ? <p className="launchDescription" role="status">{message}</p> : null}
              {launched ? (
                <div className="heroActions">
                  <Link className="primaryCta" href={`/stock-rewards/${launched.curve}`}>Open your market →</Link>
                  <a className="secondaryCta" href={`${FORTUNE_NETWORK.explorerUrl}/tx/${launched.hash}`} target="_blank" rel="noreferrer">Transaction ↗</a>
                </div>
              ) : null}
              {account ? <p className="fieldHint" translate="no">{zh ? "已连接 " : "Connected "}{account.slice(0, 6)}…{account.slice(-4)}</p> : null}
            </section>
          </fieldset>
        </div>

        <aside className="launchAside" aria-label="How Stock Rewards work">
          <div className="launchPreviewCard">
            <span className="eyebrow">HOW IT WORKS</span>
            <dl className="launchPreviewFacts">
              <div><dt>Stocks</dt><dd>One to five, each with a fixed share</dd></div>
              <div><dt>Holders earn</dt><dd>Every stock, streamed over 6 hours</dd></div>
              <div><dt>Claims</dt><dd>Onchain, any time, all stocks at once</dd></div>
              <div><dt>Launch Shield</dt><dd>99% → 0 in 5s · 2% cap for 15s</dd></div>
              <div><dt>Graduation</dt><dd>One PancakeSwap V3 pool per stock, locked forever</dd></div>
              <div><dt>After graduation</dt><dd>Pool fees: stocks to holders, tokens burned</dd></div>
              <div><dt>If graduation fails</dt><dd>Pro-rata rescue after 7 days</dd></div>
            </dl>
            <p className="launchPreviewNote">Want a single pair instead? <Link href="/launch">Standard launch →</Link></p>
          </div>
          <p className="fieldHint"><Link href="/docs#stock-rewards">How Stock Rewards work →</Link></p>
        </aside>
      </div>
    </main>
  );
}
