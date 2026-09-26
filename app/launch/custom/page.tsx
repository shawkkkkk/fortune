"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { decodeEventLog, formatUnits, hexToString, isAddress, parseAbi, parseUnits, type Address, type Hex } from "viem";
import PairInspector from "@/components/PairInspector";
import TokenImageInput from "@/components/TokenImageInput";
import { useLanguage } from "@/components/LanguageProvider";
import { FORTUNE_NETWORK } from "@/lib/fortune-network";
import { CUSTOM_PAIRS, CUSTOM_PAIR_RULES, afterTax, firstBuyTokens } from "@/lib/custom-pairs";
import { CUSTOM_PAIR_FACTORY_ABI } from "@/lib/custom-pairs-artifacts";
import { byteLength, publicMetadataUrl } from "@/lib/creator-metadata";
import { assertWalletIdentity } from "@/lib/launch-safety";
import { formatAmount, formatShare } from "@/lib/market-format";
import type { PairInspection } from "@/lib/pair-inspector";
import { formatTaxBps } from "@/lib/pair-inspector-text";
import { connectWallet, connectedAccount, injectedProvider, walletClients, walletErrorMessage } from "@/lib/wallet";

const ERC20 = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address,address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
]);

const PREFLIGHT_TEXT: Record<string, string> = {
  LAUNCHES_PAUSED: "New custom-pair launches are paused right now.",
  BAD_NAME_LENGTH: "The name must be 1 to 64 bytes.",
  BAD_SYMBOL_LENGTH: "The ticker must be 1 to 16 bytes.",
  DESCRIPTION_TOO_LONG: "The description must be at most 1,024 bytes.",
  METADATA_TOO_LONG: "Each link must be at most 256 bytes.",
  SUPPLY_RANGE: "Supply must be between 1 million and 1 trillion tokens.",
  TARGET_RANGE: "The graduation target is outside the supported range.",
  CREATOR_FEE_TOO_HIGH: "The creator fee can be at most 1%.",
  PAIR_NO_CODE: "The pair token has no contract code on this network.",
  PAIR_IS_CURVE: "That address is a Fortune curve, not a token.",
  PAIR_DECIMALS: "The pair token's decimals could not be read or are above 36.",
  PAIR_NOT_ERC20: "The pair token does not answer basic BEP-20 reads.",
};

const CREATOR_FEES = [0, 25, 50, 100] as const;

function toNumber(raw: bigint, decimals: number) {
  return Number(formatUnits(raw, decimals));
}

function parseAmount(value: string, decimals: number) {
  const clean = value.trim().replace(/,/g, "");
  if (!clean) return null;
  if (!/^\d+(?:\.\d+)?$/.test(clean) || (clean.split(".")[1] || "").length > decimals) return null;
  try {
    return parseUnits(clean, decimals);
  } catch {
    return null;
  }
}

export default function CustomPairLaunchPage() {
  const { language } = useLanguage();
  const zh = language === "zh";
  const [pairInput, setPairInput] = useState("");
  const [inspection, setInspection] = useState<PairInspection | null>(null);
  const [account, setAccount] = useState<Address | null>(null);
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [imageURI, setImageURI] = useState("");
  const [imageBusy, setImageBusy] = useState(false);
  const [description, setDescription] = useState("");
  const [website, setWebsite] = useState("");
  const [xProfile, setXProfile] = useState("");
  const [telegram, setTelegram] = useState("");
  const [supply, setSupply] = useState("1000000000");
  const [target, setTarget] = useState("1000");
  const [creatorFeeBps, setCreatorFeeBps] = useState<number>(50);
  const [firstBuy, setFirstBuy] = useState("");
  const [protocolFeeBps, setProtocolFeeBps] = useState<number | null>(null);
  const [paused, setPaused] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [launched, setLaunched] = useState<{ curve: Address; token: Address; hash: Hex } | null>(null);

  const pairAddress = isAddress(pairInput.trim()) ? (pairInput.trim() as Address) : null;
  const decimals = inspection?.token.decimals ?? 18;
  const pairSymbol = inspection?.token.symbol || "PAIR";
  const buyTaxBps = inspection?.simulation.buy?.taxBps ?? 0;

  useEffect(() => {
    connectedAccount().then(setAccount).catch(() => undefined);
    if (!CUSTOM_PAIRS.enabled) return;
    fetch("/api/public/v1/custom-pairs?limit=1")
      .then((response) => response.json())
      .then((body) => {
        if (typeof body?.data?.protocolFeeBps === "number") setProtocolFeeBps(body.data.protocolFeeBps);
        setPaused(body?.data?.launchesPaused === true);
      })
      .catch(() => undefined);
  }, []);

  const economics = useMemo(() => {
    const supplyRaw = parseAmount(supply, 18);
    const targetRaw = parseAmount(target, decimals);
    if (!supplyRaw || !targetRaw) return null;
    const targetNumber = toNumber(targetRaw, decimals);
    return {
      supplyRaw,
      targetRaw,
      openingCap: targetNumber / 3,
      graduationCap: (targetNumber / 3) * CUSTOM_PAIR_RULES.priceMultiple,
      poolPair: targetNumber,
    };
  }, [supply, target, decimals]);

  const buyPreview = useMemo(() => {
    const amountRaw = parseAmount(firstBuy, decimals);
    if (!economics || !amountRaw || amountRaw === 0n) return null;
    const received = afterTax(amountRaw, buyTaxBps);
    const fee = protocolFeeBps ?? 50;
    const preview = firstBuyTokens({ supply: economics.supplyRaw, target: economics.targetRaw, received, protocolFeeBps: fee, creatorFeeBps });
    const share = Number(preview.tokens) / Number(economics.supplyRaw);
    return {
      amount: toNumber(amountRaw, decimals),
      taxed: toNumber(amountRaw - received, decimals),
      shield: toNumber(preview.shield, decimals),
      fees: toNumber(preview.protocolFee + preview.creatorFee, decimals),
      net: toNumber(preview.net, decimals),
      tokens: toNumber(preview.tokens, 18),
      share,
      overCap: share > CUSTOM_PAIR_RULES.earlyWalletCapBps / 10_000,
    };
  }, [firstBuy, decimals, economics, buyTaxBps, protocolFeeBps, creatorFeeBps]);

  const identityError = (() => {
    if (!name.trim() || byteLength(name.trim()) > 64) return "Add a name (up to 64 bytes).";
    if (!symbol.trim() || byteLength(symbol.trim()) > 16) return "Add a ticker (up to 16 bytes).";
    if (!imageURI.trim()) return "Add an image.";
    if (byteLength(description) > 1024) return "Keep the description under 1,024 bytes.";
    try {
      publicMetadataUrl("Image", imageURI, true);
      publicMetadataUrl("Website", website);
      publicMetadataUrl("X", xProfile);
      publicMetadataUrl("Telegram", telegram);
    } catch (error) {
      return error instanceof Error ? error.message : "Check the links.";
    }
    if ([imageURI, website, xProfile, telegram].some((value) => byteLength(value.trim()) > 256)) return "Each link must be at most 256 bytes.";
    return "";
  })();

  const economicsError = (() => {
    if (!economics) return "Enter a supply and a graduation target.";
    if (economics.supplyRaw < CUSTOM_PAIR_RULES.minSupply || economics.supplyRaw > CUSTOM_PAIR_RULES.maxSupply) {
      return "Supply must be between 1 million and 1 trillion tokens.";
    }
    if (economics.targetRaw < CUSTOM_PAIR_RULES.minTarget || economics.targetRaw > CUSTOM_PAIR_RULES.maxTarget) {
      return "The graduation target is outside the supported range.";
    }
    if (firstBuy.trim() && !parseAmount(firstBuy, decimals)) return "Enter the first buy as a number.";
    if (buyPreview?.overCap) return "This first buy would exceed the 2% early-wallet cap and revert. Lower it.";
    return "";
  })();

  const pairBlocked = !inspection || inspection.verdict === "unsupported";
  const ready = CUSTOM_PAIRS.enabled && !paused && Boolean(pairAddress) && !pairBlocked && !identityError && !economicsError;

  async function launch() {
    if (!ready || !pairAddress || !economics || !CUSTOM_PAIRS.factory) return;
    setBusy(true);
    setMessage("Connecting your wallet…");
    setLaunched(null);
    try {
      const wallet = await connectWallet();
      setAccount(wallet);
      const { publicClient, walletClient } = walletClients(wallet);
      const factory = CUSTOM_PAIRS.factory;
      const params = {
        name: name.trim(),
        symbol: symbol.trim(),
        supply: economics.supplyRaw,
        pairToken: pairAddress,
        graduationTarget: economics.targetRaw,
        creatorFeeBps,
        description: description.trim(),
        imageURI: imageURI.trim(),
        website: website.trim(),
        xProfile: xProfile.trim(),
        telegram: telegram.trim(),
      };

      setMessage("Running the factory preflight…");
      const [preflightOk, reason] = (await publicClient.readContract({ address: factory, abi: CUSTOM_PAIR_FACTORY_ABI, functionName: "preflight", args: [params] })) as [boolean, Hex];
      if (!preflightOk) {
        const code = hexToString(reason).replace(/\0/g, "");
        throw new Error(PREFLIGHT_TEXT[code] || "Preflight failed: " + code);
      }

      const amountIn = parseAmount(firstBuy, decimals) ?? 0n;
      let hash: Hex;
      if (amountIn > 0n) {
        const balance = await publicClient.readContract({ address: pairAddress, abi: ERC20, functionName: "balanceOf", args: [wallet] });
        if (balance < amountIn) {
          throw new Error(zh
            ? `你的钱包只有 ${formatAmount(toNumber(balance, decimals))} ${pairSymbol}，少于首购金额。`
            : `Your wallet holds ${formatAmount(toNumber(balance, decimals))} ${pairSymbol}, less than the first buy.`);
        }
        const allowance = await publicClient.readContract({ address: pairAddress, abi: ERC20, functionName: "allowance", args: [wallet, factory] });
        if (allowance < amountIn) {
          setMessage(zh ? `请在钱包中批准首购所需的 ${pairSymbol}…` : `Approve ${pairSymbol} for the first buy in your wallet…`);
          await assertWalletIdentity(injectedProvider(), wallet, FORTUNE_NETWORK.chainId);
          const approval = await walletClient.writeContract({ address: pairAddress, abi: ERC20, functionName: "approve", args: [factory, amountIn] });
          await publicClient.waitForTransactionReceipt({ hash: approval });
        }
        setMessage("Simulating the launch and first buy…");
        const simulation = await publicClient.simulateContract({
          account: wallet,
          address: factory,
          abi: CUSTOM_PAIR_FACTORY_ABI,
          functionName: "createLaunchAndBuy",
          args: [params, amountIn, 1n],
        });
        const simulatedTokens = (simulation.result as readonly [Address, Address, bigint])[2];
        const minTokensOut = (simulatedTokens * 99n) / 100n || 1n;
        setMessage("Confirm the launch in your wallet…");
        await assertWalletIdentity(injectedProvider(), wallet, FORTUNE_NETWORK.chainId);
        hash = await walletClient.writeContract({
          address: factory,
          abi: CUSTOM_PAIR_FACTORY_ABI,
          functionName: "createLaunchAndBuy",
          args: [params, amountIn, minTokensOut],
        });
      } else {
        setMessage("Simulating the launch…");
        await publicClient.simulateContract({ account: wallet, address: factory, abi: CUSTOM_PAIR_FACTORY_ABI, functionName: "createLaunch", args: [params] });
        setMessage("Confirm the launch in your wallet…");
        await assertWalletIdentity(injectedProvider(), wallet, FORTUNE_NETWORK.chainId);
        hash = await walletClient.writeContract({ address: factory, abi: CUSTOM_PAIR_FACTORY_ABI, functionName: "createLaunch", args: [params] });
      }

      setMessage("Waiting for BNB Chain to confirm…");
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error("The launch transaction reverted.");
      for (const log of receipt.logs) {
        if (log.address.toLowerCase() !== factory.toLowerCase()) continue;
        try {
          const event = decodeEventLog({ abi: CUSTOM_PAIR_FACTORY_ABI, data: log.data, topics: log.topics });
          if (event.eventName === "LaunchCreated") {
            const args = event.args as unknown as { token: Address; curve: Address };
            setLaunched({ curve: args.curve, token: args.token, hash });
            setMessage("Launched. Your curve is live.");
            return;
          }
        } catch {
          /* Not the launch event. */
        }
      }
      throw new Error("The transaction confirmed but no launch event was found.");
    } catch (error) {
      setMessage(walletErrorMessage(error, "The launch did not go through."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="page launchPage customLaunchPage">
      <section className="pageHeading launchHeading">
        <div>
          <span className="eyebrow">CUSTOM PAIRS · BETA</span>
          <h1>Pair with any token.</h1>
          <p>Paste any BEP-20, including tokenized stocks and tokens with a transfer tax. Fortune measures how it behaves, then your launch trades against it on its own curve.</p>
        </div>
        <img className="launchHeadingArt" src="/fortune-cat-cutout-400.webp" alt="" width="170" height="170" />
      </section>

      <div className={"registryNotice" + (CUSTOM_PAIRS.enabled ? "" : " statusError")}>
        <strong>{CUSTOM_PAIRS.enabled ? "UNAUDITED BETA · " + FORTUNE_NETWORK.chainName.toUpperCase() : "NOT DEPLOYED ON THIS NETWORK YET"}</strong>
        <span>
          {CUSTOM_PAIRS.enabled
            ? "Custom-pair contracts are separate from the audited Standard launch and have not been audited. Fortune does not review pair tokens; the check below measures them but is not an audit."
            : FORTUNE_NETWORK.isMainnet
              ? "Custom pairs stay off BNB Smart Chain mainnet until their own audit passes. You can still check any token below."
              : "The custom-pairs beta factory has not been deployed on this network yet. You can already check any token below."}
        </span>
      </div>

      <div className="launchLayout">
        <div className="launchMain">
          <fieldset aria-label="Custom-pair launch details" disabled={busy || imageBusy} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
            <section className="formCard">
              <div className="formSectionTitle"><span>01</span><div><h2>Pair token</h2><p translate="no">{zh ? `${FORTUNE_NETWORK.chainName} 上的任意 BEP-20 合约。` : `Any BEP-20 contract on ${FORTUNE_NETWORK.chainName}.`}</p></div></div>
              <label>Pair token address
                <input value={pairInput} maxLength={42} onChange={(event) => setPairInput(event.target.value)} placeholder="0x…" autoComplete="off" spellCheck={false} aria-invalid={Boolean(pairInput.trim()) && !pairAddress} />
              </label>
              {pairInput.trim() && !pairAddress ? <p className="fieldError" role="alert">Enter a 0x address with 40 hex characters.</p> : null}
              {CUSTOM_PAIRS.testTokens.length ? (
                <div className="customPairQuick">
                  <span className="fieldHint">Testnet tokens with a faucet:</span>
                  {CUSTOM_PAIRS.testTokens.map((address, index) => (
                    <button key={address} type="button" className="secondaryCta" onClick={() => setPairInput(address)}>
                      {index === 0 ? "tSTONK · 5% transfer tax" : "tSHARE · no tax"}
                    </button>
                  ))}
                </div>
              ) : null}
              {pairAddress ? <PairInspector address={pairAddress} holder={account} onResult={setInspection} /> : (
                <p className="fieldHint">Fortune simulates a buy, a sell and a graduation transfer of the token and measures what actually arrives. Taxes are allowed; tokens that revert or charge tax on top are not.</p>
              )}
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
              <div className="formSectionTitle"><span>03</span><div><h2>Curve and fees</h2><p translate="no">{zh ? `以 ${pairSymbol} 计价。无预言机，不换算美元。` : `Priced in ${pairSymbol}. No oracle, no USD conversion.`}</p></div></div>
              <div className="fieldGrid">
                <label>Total supply<input value={supply} inputMode="numeric" onChange={(event) => setSupply(event.target.value)} /></label>
                <label><span translate="no">{zh ? `毕业目标 · ${pairSymbol}` : `Graduation target · ${pairSymbol}`}</span><input value={target} inputMode="decimal" onChange={(event) => setTarget(event.target.value)} /></label>
              </div>
              <p className="fieldHint" translate="no">{zh ? `当扣除转账税和手续费后有这么多 ${pairSymbol} 支撑曲线时，曲线关闭。届时曲线持有的全部资产转入新的 PancakeSwap V2 资金池。` : `The curve closes when this much ${pairSymbol}, after transfer taxes and fees, backs it. Everything it holds then moves into a new PancakeSwap V2 pool.`}</p>
              <fieldset className="customFeeChoice">
                <legend>Creator fee on every curve trade</legend>
                <div className="launchModeRow">
                  {CREATOR_FEES.map((bps) => (
                    <button key={bps} type="button" className={creatorFeeBps === bps ? "selectedMode" : undefined} aria-pressed={creatorFeeBps === bps} onClick={() => setCreatorFeeBps(bps)}>
                      <strong translate="no">{formatTaxBps(bps)}</strong>
                      <span translate="no">{bps === 0 ? (zh ? "无创作者费" : "No creator fee") : (zh ? `以 ${pairSymbol} 支付` : `Paid in ${pairSymbol}`)}</span>
                    </button>
                  ))}
                </div>
              </fieldset>
              <p className="fieldHint" translate="no">{zh
                ? `另加 ${protocolFeeBps === null ? "—" : formatTaxBps(protocolFeeBps)} 的协议费。手续费累积在曲线中、由接收方领取，因此被封禁的接收方永远无法阻止交易。`
                : `Plus the protocol fee of ${protocolFeeBps === null ? "—" : formatTaxBps(protocolFeeBps)}. Fees accrue in the curve and are claimed, so a blocked recipient can never stop trading.`}</p>
              {economics && !economicsError ? (
                <dl className="curvePreview" translate="no">
                  <div><dt>{zh ? "开盘市值" : "Opening market cap"}</dt><dd>{formatAmount(economics.openingCap)} {pairSymbol}</dd></div>
                  <div><dt>{zh ? "毕业市值" : "Market cap at graduation"}</dt><dd>≈ {formatAmount(economics.graduationCap)} {pairSymbol}</dd></div>
                  <div><dt>{zh ? "曲线涨幅" : "Price rise on the curve"}</dt><dd>16×</dd></div>
                  <div><dt>{zh ? "曲线售出" : "Sold on the curve"}</dt><dd>{zh ? "75% 的供应量" : "75% of supply"}</dd></div>
                  <div><dt>{zh ? "注入资金池" : "Seeds the pool"}</dt><dd>{zh ? "18.75% 的供应量 + " : "18.75% of supply + "}{formatAmount(economics.poolPair)} {pairSymbol}</dd></div>
                  <div><dt>{zh ? "毕业时销毁" : "Burned at graduation"}</dt><dd>{zh ? "≈ 6.25% 的供应量 + LP 代币" : "≈ 6.25% of supply + LP tokens"}</dd></div>
                </dl>
              ) : null}
            </section>

            <section className="formCard">
              <div className="formSectionTitle"><span>04</span><div><h2>Optional first buy</h2><p>Made in the launch transaction. The Launch Shield applies to it too.</p></div></div>
              <div className="fieldGrid"><label><span translate="no">{zh ? `金额 · ${pairSymbol}` : `Amount in ${pairSymbol}`}</span><input value={firstBuy} inputMode="decimal" onChange={(event) => setFirstBuy(event.target.value)} placeholder="0" /></label></div>
              {buyPreview ? (
                <div className="firstBuyPreview" aria-live="polite" translate="no">
                  <strong>{zh ? "首购预览" : "First-buy preview"}</strong>
                  <dl>
                    <div><dt>{zh ? "你发送" : "You send"}</dt><dd>{formatAmount(buyPreview.amount)} {pairSymbol}</dd></div>
                    {buyPreview.taxed > 0 ? <div><dt>{zh ? `${pairSymbol} 转账税 ${formatTaxBps(buyTaxBps)}` : `${pairSymbol} transfer tax ${formatTaxBps(buyTaxBps)}`}</dt><dd>−{formatAmount(buyPreview.taxed)} {pairSymbol}</dd></div> : null}
                    <div><dt>{zh ? "发行护盾 99%" : "Launch Shield 99%"}</dt><dd>−{formatAmount(buyPreview.shield)} {pairSymbol}<small>{zh ? "计入毕业流动性" : "to graduation liquidity"}</small></dd></div>
                    <div><dt>{zh ? "手续费" : "Fees"}</dt><dd>−{formatAmount(buyPreview.fees)} {pairSymbol}</dd></div>
                    <div><dt>{zh ? "进入曲线" : "Reaches the curve"}</dt><dd>{formatAmount(buyPreview.net)} {pairSymbol}</dd></div>
                    <div className="firstBuyTotal"><dt>{zh ? "预计获得" : "You receive"}</dt><dd>≈ {formatAmount(buyPreview.tokens)} {symbol.trim() || (zh ? "代币" : "tokens")}<small>{formatShare(buyPreview.share)}{zh ? " 的总供应量" : " of supply"}</small></dd></div>
                  </dl>
                </div>
              ) : null}
              <p className="reviewWarning">The Launch Shield takes up to 99% of every buy in the first five seconds, including this one. It never goes to the creator: it stays in the curve and becomes pool liquidity at graduation.</p>
            </section>

            <section className="formCard">
              <div className="formSectionTitle"><span>05</span><div><h2>Launch</h2><p translate="no">{zh
                ? (parseAmount(firstBuy, decimals) ? `批准 ${pairSymbol} 后，你的钱包签署一笔交易。` : "你的钱包签署一笔交易。")
                : `Your wallet signs one transaction${parseAmount(firstBuy, decimals) ? ", after approving " + pairSymbol : ""}.`}</p></div></div>
              <ul className="customChecklist">
                <li className={pairAddress && !pairBlocked ? "done" : undefined}>{pairAddress ? (pairBlocked ? (inspection ? "This pair token is not supported." : "Checking the pair token…") : "Pair token checked") : "Choose a pair token"}</li>
                <li className={!identityError ? "done" : undefined}>{identityError || "Identity complete"}</li>
                <li className={!economicsError ? "done" : undefined}>{economicsError || "Curve and first buy set"}</li>
              </ul>
              <button className="launchButton" disabled={!ready || busy} onClick={() => void launch()}>
                {busy ? "Working…" : !CUSTOM_PAIRS.enabled ? "Custom pairs are not live on this network" : paused ? "Launches paused" : FORTUNE_NETWORK.isMainnet ? "Launch custom pair on BNB Chain →" : "Launch custom pair on BSC Testnet →"}
              </button>
              {message ? <p className="launchDescription" role="status">{message}</p> : null}
              {launched ? (
                <div className="heroActions">
                  <Link className="primaryCta" href={`/custom/${launched.curve}`}>Open your market →</Link>
                  <a className="secondaryCta" href={`${FORTUNE_NETWORK.explorerUrl}/tx/${launched.hash}`} target="_blank" rel="noreferrer">Transaction ↗</a>
                </div>
              ) : null}
            </section>
          </fieldset>
        </div>

        <aside className="launchAside" aria-label="How custom pairs work">
          <div className="launchPreviewCard">
            <span className="eyebrow">HOW IT WORKS</span>
            <dl className="launchPreviewFacts">
              <div><dt>Pair</dt><dd>Any BEP-20</dd></div>
              <div><dt>Transfer taxes</dt><dd>Measured, never counted as reserve</dd></div>
              <div><dt>Price</dt><dd>In pair-token units</dd></div>
              <div><dt>Launch Shield</dt><dd>99% → 0 in 5s · 2% cap for 15s</dd></div>
              <div><dt>Graduation</dt><dd>Pancake V2 · LP burned</dd></div>
              <div><dt>If the pair breaks</dt><dd>Pro-rata rescue</dd></div>
            </dl>
            <p className="launchPreviewNote">Want a reviewed, audited pair instead? <Link href="/launch">Standard launch →</Link></p>
          </div>
          <p className="fieldHint"><Link href="/docs#custom-pairs">How custom pairs work →</Link></p>
        </aside>
      </div>
    </main>
  );
}
