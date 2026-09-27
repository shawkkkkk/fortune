"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { formatUnits, getAddress, isAddress, type Address, type Hex } from "viem";
import { RecipientName, RecipientState } from "@/components/FeeRecipientsPanel";
import { useLanguage } from "@/components/LanguageProvider";
import { SOCIAL_FEE_VAULT_ABI } from "@/lib/custom-pairs-artifacts";
import { FORTUNE_NETWORK } from "@/lib/fortune-network";
import { assertWalletIdentity } from "@/lib/launch-safety";
import { formatAmount, shortAddress } from "@/lib/market-format";
import {
  SOCIAL_PLATFORMS,
  canonicalAccount,
  challengeCode,
  challengePost,
  formatShareBps,
  socialPlatform,
  type SocialIdentityDetail,
} from "@/lib/social-fees";
import { connectWallet, injectedProvider, walletClients, walletErrorMessage } from "@/lib/wallet";

type Status = {
  enabled: boolean;
  ready: boolean;
  vault: Address | null;
  bindingsPaused: boolean | null;
  rules: { firstBindDelaySeconds: number; rebindDelaySeconds: number };
};

type Attestation = {
  identityId: Hex;
  platform: number;
  account: string;
  wallet: Address;
  stableId: Hex;
  deadline: number;
  signature: Hex;
  effectiveAfterSeconds: number;
  evidence: { url: string | null; author: string; excerpt: string };
};

const MAX_CURVES_PER_CLAIM = 20;

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...init });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.error?.message || "Fortune could not answer right now.");
  return body.data as T;
}

function units(raw: string | bigint, decimals: number) {
  return Number(formatUnits(BigInt(raw), decimals));
}

/** Claimable now per pair token: collected in the vault plus this identity's share still in curves. */
function totals(detail: SocialIdentityDetail) {
  const byToken = new Map<string, { token: Address; symbol: string; decimals: number; vault: bigint; curves: bigint }>();
  for (const balance of detail.balances) {
    byToken.set(balance.token.toLowerCase(), { token: balance.token, symbol: balance.symbol, decimals: balance.decimals, vault: BigInt(balance.claimable), curves: 0n });
  }
  for (const curve of detail.curves) {
    const key = curve.pairToken.toLowerCase();
    const entry = byToken.get(key) ?? { token: curve.pairToken, symbol: curve.pairSymbol, decimals: curve.pairDecimals, vault: 0n, curves: 0n };
    entry.curves += BigInt(curve.uncollected);
    byToken.set(key, entry);
  }
  return [...byToken.values()].filter((entry) => entry.vault > 0n || entry.curves > 0n);
}

function actionLink(platformKey: string, post: string) {
  if (platformKey === "x") return { href: `https://x.com/intent/post?text=${encodeURIComponent(post)}`, label: "Post on X ↗" };
  if (platformKey === "bluesky") return { href: `https://bsky.app/intent/compose?text=${encodeURIComponent(post)}`, label: "Post on Bluesky ↗" };
  if (platformKey === "github") return { href: "https://gist.github.com/", label: "Create a gist ↗" };
  return null;
}

function IdentityCard({
  detail,
  account,
  now,
  busy,
  onClaim,
  onCancel,
}: {
  detail: SocialIdentityDetail;
  account: Address | null;
  now: number;
  busy: boolean;
  onClaim: (detail: SocialIdentityDetail) => void;
  onCancel: (identityId: Hex) => void;
}) {
  const { language } = useLanguage();
  const zh = language === "zh";
  const { identity } = detail;
  const rows = totals(detail);
  const mine = Boolean(account && identity.wallet && identity.wallet.toLowerCase() === account.toLowerCase());
  const canCancel = Boolean(
    account &&
      identity.pendingWallet &&
      (identity.pendingWallet.toLowerCase() === account.toLowerCase() || identity.wallet?.toLowerCase() === account.toLowerCase())
  );
  return (
    <article className="identityCard">
      <div className="identityHead">
        {identity.platform === 0 ? <strong>{mine ? "This wallet" : shortAddress(identity.wallet ?? "")}</strong> : <RecipientName recipient={identity} />}
        <RecipientState recipient={identity} now={now} />
      </div>
      {rows.length ? (
        <dl className="identityBalances" translate="no">
          {rows.map((row) => (
            <div key={row.token}>
              <dt>{row.symbol}</dt>
              <dd>
                {formatAmount(units(row.vault + row.curves, row.decimals))}
                {row.curves > 0n ? <small>{zh ? `其中 ${formatAmount(units(row.curves, row.decimals))} 仍在曲线中，领取时一并归集` : `${formatAmount(units(row.curves, row.decimals))} still in curves, collected when you claim`}</small> : null}
              </dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="fieldHint">Nothing to claim yet.</p>
      )}
      {detail.curves.length ? (
        <details className="identityLaunches">
          <summary translate="no">{zh ? `${identity.curveCount} 个发行指定了这个接收方` : identity.curveCount === 1 ? "1 launch names this recipient" : `${identity.curveCount} launches name this recipient`}</summary>
          <ul>
            {detail.curves.map((curve) => (
              <li key={curve.curve}>
                <Link href={`/custom/${curve.curve}`} translate="no">{curve.name || curve.symbol || shortAddress(curve.curve)}</Link>
                <span translate="no">{formatShareBps(curve.shareBps)} · {curve.pairSymbol}</span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      <div className="identityActions">
        {mine && rows.length ? (
          <button type="button" className="primaryCta" disabled={busy} onClick={() => onClaim(detail)}>Collect and claim</button>
        ) : null}
        {canCancel ? (
          <button type="button" className="secondaryCta" disabled={busy} onClick={() => onCancel(identity.identityId)}>Cancel pending wallet</button>
        ) : null}
      </div>
    </article>
  );
}

export default function ClaimsDashboard() {
  const { language } = useLanguage();
  const zh = language === "zh";
  const [status, setStatus] = useState<Status | null>(null);
  const [statusError, setStatusError] = useState("");
  const [account, setAccount] = useState<Address | null>(null);
  const [mine, setMine] = useState<SocialIdentityDetail[] | null>(null);
  const [platformKey, setPlatformKey] = useState("x");
  const [handle, setHandle] = useState("");
  const [lookup, setLookup] = useState<(SocialIdentityDetail & { vault: Address }) | null>(null);
  const [lookupError, setLookupError] = useState("");
  const [proofUrl, setProofUrl] = useState("");
  const [attestation, setAttestation] = useState<Attestation | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [copied, setCopied] = useState(false);
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  // Chain time minus this device's clock, so delay countdowns match the vault.
  const [chainOffset, setChainOffset] = useState(0);
  const syncClock = useCallback((chainTime: number | undefined) => {
    if (typeof chainTime === "number" && chainTime > 0) setChainOffset(chainTime - Math.floor(Date.now() / 1000));
  }, []);

  const platform = socialPlatform(platformKey) ?? SOCIAL_PLATFORMS[0];

  const loadMine = useCallback(async (wallet: Address | null) => {
    if (!wallet) return setMine(null);
    try {
      const data = await api<{ identities: SocialIdentityDetail[]; chainTime?: number }>(`/api/public/v1/social/identity?wallet=${wallet}`);
      syncClock(data.chainTime);
      setMine(data.identities);
    } catch {
      setMine([]);
    }
  }, [syncClock]);

  const runLookup = useCallback(async (key: string, raw: string) => {
    setLookupError("");
    setAttestation(null);
    const parsed = canonicalAccount(key, raw);
    if (!parsed.ok) {
      setLookup(null);
      setLookupError(parsed.reason);
      return;
    }
    try {
      const data = await api<SocialIdentityDetail & { vault: Address; chainTime?: number }>(
        `/api/public/v1/social/identity?platform=${parsed.platform.key}&account=${encodeURIComponent(parsed.account)}`
      );
      syncClock(data.chainTime);
      setLookup(data);
    } catch (error) {
      setLookup(null);
      setLookupError(error instanceof Error ? error.message : "The account could not be looked up.");
    }
  }, [syncClock]);

  useEffect(() => {
    api<Status>("/api/public/v1/social/status").then(setStatus).catch((error) => setStatusError(error instanceof Error ? error.message : ""));
    const ethereum = (window as Window & { ethereum?: { request: (args: { method: string }) => Promise<unknown> } }).ethereum;
    ethereum
      ?.request({ method: "eth_accounts" })
      .then((accounts) => {
        const first = Array.isArray(accounts) && typeof accounts[0] === "string" && isAddress(accounts[0]) ? getAddress(accounts[0]) : null;
        setAccount(first);
        void loadMine(first);
      })
      .catch(() => undefined);
    const params = new URLSearchParams(window.location.search);
    const queryPlatform = socialPlatform(params.get("platform"));
    const queryAccount = params.get("account");
    if (queryPlatform && queryAccount) {
      setPlatformKey(queryPlatform.key);
      setHandle(queryAccount);
      void runLookup(queryPlatform.key, queryAccount);
    }
    return undefined;
  }, [loadMine, runLookup]);

  useEffect(() => {
    const update = () => setNow(Math.floor(Date.now() / 1000) + chainOffset);
    update();
    const tick = window.setInterval(update, 1_000);
    return () => window.clearInterval(tick);
  }, [chainOffset]);

  const code = useMemo(() => {
    if (!lookup || !account || !status?.vault) return null;
    return challengeCode({
      chainId: FORTUNE_NETWORK.chainId,
      vault: status.vault,
      identityId: lookup.identity.identityId,
      wallet: account,
      nonce: BigInt(lookup.identity.nonce),
    });
  }, [lookup, account, status?.vault]);

  const post = code ? challengePost(platform, code) : "";
  const lookedUpPlatform = lookup ? socialPlatform(lookup.identity.platform) : null;
  const boundHere = Boolean(lookup && account && lookup.identity.wallet?.toLowerCase() === account.toLowerCase());
  const pendingHere = Boolean(lookup && account && lookup.identity.pendingWallet?.toLowerCase() === account.toLowerCase());

  async function run(label: string, action: (wallet: Address) => Promise<void>) {
    setBusy(true);
    setMessage(label);
    try {
      const wallet = await connectWallet();
      setAccount(wallet);
      await action(wallet);
      await loadMine(wallet);
      if (lookup) await runLookup(lookup.identity.platformKey, lookup.identity.account);
    } catch (error) {
      setMessage(walletErrorMessage(error, "That did not go through."));
    } finally {
      setBusy(false);
    }
  }

  async function checkProof() {
    if (!lookup || !account) return;
    setBusy(true);
    setMessage("Checking your proof…");
    setAttestation(null);
    try {
      const data = await api<Attestation>("/api/public/v1/social/attest", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ platform: lookup.identity.platform, account: lookup.identity.account, wallet: account, proofUrl: proofUrl.trim() || undefined }),
      });
      setAttestation(data);
      setMessage("Proof accepted. Submit the binding from your wallet.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The proof could not be checked.");
    } finally {
      setBusy(false);
    }
  }

  async function submitBinding() {
    const signed = attestation;
    const vault = status?.vault;
    if (!signed || !vault) return;
    await run("Preparing the binding…", async (wallet) => {
      if (wallet.toLowerCase() !== signed.wallet.toLowerCase()) throw new Error(`Switch your wallet to ${shortAddress(signed.wallet)}: the proof names that wallet.`);
      const { publicClient, walletClient } = walletClients(wallet);
      const args = [signed.platform, signed.account, signed.stableId, BigInt(signed.deadline), signed.signature] as const;
      await publicClient.simulateContract({ account: wallet, address: vault, abi: SOCIAL_FEE_VAULT_ABI, functionName: "bind", args });
      setMessage("Confirm the binding in your wallet…");
      await assertWalletIdentity(injectedProvider(), wallet, FORTUNE_NETWORK.chainId);
      const hash = await walletClient.writeContract({ address: vault, abi: SOCIAL_FEE_VAULT_ABI, functionName: "bind", args });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error("The binding reverted.");
      const block = await publicClient.getBlock({ blockNumber: receipt.blockNumber });
      const at = new Date((Number(block.timestamp) + signed.effectiveAfterSeconds - chainOffset) * 1000);
      setAttestation(null);
      setProofUrl("");
      setMessage(zh
        ? `绑定已提交。将于 ${at.toLocaleString("zh-CN")} 生效，届时即可领取。`
        : `Binding submitted. It takes effect at ${at.toLocaleString("en-US")}; claim any time after that.`);
    });
  }

  async function claim(detail: SocialIdentityDetail) {
    const vault = status?.vault;
    if (!vault) return;
    await run("Preparing your claim…", async (wallet) => {
      const { publicClient, walletClient } = walletClients(wallet);
      const curves = detail.curves.filter((curve) => BigInt(curve.uncollected) > 0n).slice(0, MAX_CURVES_PER_CLAIM).map((curve) => curve.curve);
      const tokens = [...new Set([
        ...detail.balances.filter((balance) => BigInt(balance.owed) > 0n).map((balance) => balance.token),
        ...detail.curves.filter((curve) => curves.includes(curve.curve)).map((curve) => curve.pairToken),
      ].map((token) => getAddress(token)))];
      const args = [curves, detail.identity.identityId, tokens] as const;
      await publicClient.simulateContract({ account: wallet, address: vault, abi: SOCIAL_FEE_VAULT_ABI, functionName: "collectAndClaim", args });
      setMessage("Confirm the claim in your wallet…");
      await assertWalletIdentity(injectedProvider(), wallet, FORTUNE_NETWORK.chainId);
      const hash = await walletClient.writeContract({ address: vault, abi: SOCIAL_FEE_VAULT_ABI, functionName: "collectAndClaim", args });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error("The claim reverted.");
      setMessage("Claimed. The fees are in your wallet.");
    });
  }

  async function cancel(identityId: Hex) {
    const vault = status?.vault;
    if (!vault) return;
    await run("Cancelling the pending wallet…", async (wallet) => {
      const { publicClient, walletClient } = walletClients(wallet);
      await publicClient.simulateContract({ account: wallet, address: vault, abi: SOCIAL_FEE_VAULT_ABI, functionName: "cancelPendingBinding", args: [identityId] });
      await assertWalletIdentity(injectedProvider(), wallet, FORTUNE_NETWORK.chainId);
      const hash = await walletClient.writeContract({ address: vault, abi: SOCIAL_FEE_VAULT_ABI, functionName: "cancelPendingBinding", args: [identityId] });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error("The cancellation reverted.");
      setMessage("The pending wallet was cancelled.");
    });
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(post);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2_000);
    } catch {
      setCopied(false);
    }
  }

  const enabled = status?.enabled === true;
  const action = lookedUpPlatform && post ? actionLink(lookedUpPlatform.key, post) : null;
  const firstDelayHours = Math.round((status?.rules.firstBindDelaySeconds ?? 3_600) / 3_600);
  const rebindDays = Math.round((status?.rules.rebindDelaySeconds ?? 259_200) / 86_400);

  return (
    <main className="page claimsPage">
      <section className="pageHeading">
        <div>
          <span className="eyebrow">CREATOR FEES</span>
          <h1>Claim your creator fees.</h1>
          <p>Launches can send their creator fee to wallets and to social accounts. Verify an account once and claim everything it earns, across every launch that names it.</p>
        </div>
      </section>

      {status && !enabled ? (
        <div className="registryNotice statusError">
          <strong>NOT LIVE ON THIS NETWORK YET</strong>
          <span>Social fee routing ships with the custom-pairs beta on BSC Testnet. It has not been deployed here yet.</span>
        </div>
      ) : null}
      {statusError ? <div className="registryNotice statusError"><strong>UNAVAILABLE</strong><span>{statusError}</span></div> : null}
      {enabled ? (
        <div className="registryNotice">
          <strong translate="no">{zh ? `未审计测试版 · ${FORTUNE_NETWORK.chainName}` : `UNAUDITED BETA · ${FORTUNE_NETWORK.chainName.toUpperCase()}`}</strong>
          <span>
            {status?.ready
              ? "Fortune checks a public post from the account and signs a binding your wallet submits. Fortune never asks for a seed phrase or private key, and never needs one."
              : status?.bindingsPaused
                ? "New verifications are paused. Wallets that are already bound can still claim."
                : "Account verification is still being set up on this deployment. Wallet recipients can already claim."}
          </span>
        </div>
      ) : null}

      <div className="claimsLayout">
        <div className="claimsMain">
          <section className="formCard">
            <div className="formSectionTitle"><span>01</span><div><h2>Your claims</h2><p>Accounts and launches that pay the connected wallet.</p></div></div>
            {!account ? (
              <div className="claimsConnect">
                <p>Connect the wallet that receives fees.</p>
                <button type="button" className="primaryCta" disabled={busy} onClick={() => void run("Connecting…", async () => setMessage(""))}>Connect wallet</button>
              </div>
            ) : mine === null ? (
              <p className="fieldHint">Loading…</p>
            ) : mine.length ? (
              <div className="identityList">
                {mine.map((detail) => (
                  <IdentityCard key={detail.identity.identityId} detail={detail} account={account} now={now} busy={busy} onClaim={(item) => void claim(item)} onCancel={(id) => void cancel(id)} />
                ))}
              </div>
            ) : (
              <p className="fieldHint">Nothing pays this wallet yet. Verify an account below, or launch with a fee split that includes this wallet.</p>
            )}
          </section>

          <section className="formCard">
            <div className="formSectionTitle"><span>02</span><div><h2>Verify an account</h2><p>Prove you own the account a launch named, then bind your wallet to it.</p></div></div>
            <form
              className="claimsLookup"
              onSubmit={(event) => {
                event.preventDefault();
                void runLookup(platformKey, handle);
              }}
            >
              <label>Platform
                <select value={platformKey} onChange={(event) => { setPlatformKey(event.target.value); setLookup(null); setAttestation(null); }}>
                  {SOCIAL_PLATFORMS.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
                </select>
              </label>
              <label><span translate="no">{zh ? `${platform.label} 账户` : `${platform.label} ${platform.placeholder}`}</span>
                <input value={handle} onChange={(event) => setHandle(event.target.value)} placeholder={platform.prefix + platform.placeholder} autoComplete="off" spellCheck={false} />
              </label>
              <button type="submit" className="secondaryCta" disabled={!enabled || busy}>Look up</button>
            </form>
            {lookupError ? <p className="fieldError" role="alert">{lookupError}</p> : null}

            {lookup && lookedUpPlatform ? (
              <div className="claimsFound">
                <div className="identityHead">
                  <RecipientName recipient={lookup.identity} />
                  <RecipientState recipient={lookup.identity} now={now} />
                </div>
                <p className="fieldHint" translate="no">
                  {zh
                    ? `${lookup.identity.curveCount} 个发行指定了这个账户。`
                    : lookup.identity.curveCount === 1 ? "1 launch names this account." : `${lookup.identity.curveCount} launches name this account.`}
                  {totals(lookup).map((row) => ` ${formatAmount(units(row.vault + row.curves, row.decimals))} ${row.symbol}`).join(" ·")}
                  {totals(lookup).length ? (zh ? " 等待领取。" : " waiting.") : ""}
                </p>

                {!account ? (
                  <button type="button" className="primaryCta" disabled={busy} onClick={() => void run("Connecting…", async () => setMessage(""))}>Connect the wallet to receive fees</button>
                ) : boundHere ? (
                  <p className="verificationBadge verificationVerified">This wallet already receives this account&apos;s fees. Claim them above.</p>
                ) : pendingHere ? (
                  <p className="verificationBadge" translate="no">
                    {zh ? `该钱包的绑定将于 ${new Date(((lookup.identity.pendingAt ?? 0) - chainOffset) * 1000).toLocaleString("zh-CN")} 生效。` : `This wallet takes over at ${new Date(((lookup.identity.pendingAt ?? 0) - chainOffset) * 1000).toLocaleString("en-US")}.`}
                  </p>
                ) : (
                  <ol className="claimsSteps">
                    {lookup.identity.wallet ? (
                      <li className="reviewWarning" translate="no">
                        {zh
                          ? `该账户目前支付给 ${shortAddress(lookup.identity.wallet)}。更换钱包需等待 ${rebindDays} 天，期间当前钱包可以取消。`
                          : `This account currently pays ${shortAddress(lookup.identity.wallet)}. Changing the wallet takes ${rebindDays} days, and the current wallet can cancel it meanwhile.`}
                      </li>
                    ) : null}
                    {lookedUpPlatform.key === "farcaster" ? (
                      <li>
                        <strong>Add this wallet to your Farcaster account</strong>
                        <p className="fieldHint" translate="no">
                          {zh
                            ? `在 Farcaster 应用中：设置 → 已验证地址 → 添加 ${account}。然后点击下面的“检查”。无需发帖。`
                            : `In the Farcaster app: Settings → Verified addresses → add ${account}. Then check below. No post needed.`}
                        </p>
                      </li>
                    ) : (
                      <li>
                        <strong translate="no">{zh ? `从 ${lookedUpPlatform.prefix}${lookup.identity.account} 发布这段文字` : `Publish this from ${lookedUpPlatform.prefix}${lookup.identity.account}`}</strong>
                        <p className="fieldHint">{lookedUpPlatform.proof}</p>
                        <div className="claimsCode">
                          <code translate="no">{post}</code>
                          <button type="button" className="secondaryCta" onClick={() => void copy()}>{copied ? "Copied" : "Copy"}</button>
                          {action ? <a className="secondaryCta" href={action.href} target="_blank" rel="noreferrer">{action.label}</a> : null}
                        </div>
                        <p className="fieldHint">The code only works for this wallet. Anyone can see it; it proves nothing until the account itself publishes it.</p>
                      </li>
                    )}
                    <li>
                      {lookedUpPlatform.proofExample ? (
                        <label>Link to your post
                          <input value={proofUrl} onChange={(event) => setProofUrl(event.target.value)} placeholder={lookedUpPlatform.proofExample} inputMode="url" autoComplete="off" spellCheck={false} />
                        </label>
                      ) : null}
                      <button
                        type="button"
                        className="secondaryCta"
                        disabled={busy || !status?.ready || (Boolean(lookedUpPlatform.proofExample) && !proofUrl.trim())}
                        onClick={() => void checkProof()}
                      >
                        Check proof
                      </button>
                    </li>
                    {attestation ? (
                      <li>
                        <strong>Proof accepted</strong>
                        <p className="fieldHint" translate="no">{attestation.evidence.author}: “{attestation.evidence.excerpt}”</p>
                        <button type="button" className="primaryCta" disabled={busy} onClick={() => void submitBinding()}>Bind this wallet</button>
                        <p className="fieldHint" translate="no">
                          {zh
                            ? `绑定在 ${attestation.effectiveAfterSeconds >= 86_400 ? `${rebindDays} 天` : `${firstDelayHours} 小时`}后生效。在此之前 Fortune 的守护者可以取消可疑的绑定。`
                            : `It takes effect after ${attestation.effectiveAfterSeconds >= 86_400 ? `${rebindDays} days` : `${firstDelayHours} hour${firstDelayHours === 1 ? "" : "s"}`}. Until then Fortune's guardian can cancel a binding that looks wrong.`}
                        </p>
                      </li>
                    ) : null}
                  </ol>
                )}
              </div>
            ) : null}
            {message ? <p className="launchDescription" role="status">{message}</p> : null}
          </section>
        </div>

        <aside className="launchAside" aria-label="How claims work">
          <div className="launchPreviewCard">
            <span className="eyebrow">HOW IT WORKS</span>
            <ol className="claimsHow">
              <li><strong>A launch names you.</strong> Custom-pair launches can split their creator fee between wallets and social accounts, fixed at launch.</li>
              <li><strong>You prove the account.</strong> Publish a one-time code from the account, or add your wallet on Farcaster. Fortune checks it and signs a binding.</li>
              <li><strong>Your wallet binds it.</strong> One transaction. It takes effect after a short delay; changing the wallet later takes longer and the current wallet can cancel.</li>
              <li><strong>You claim.</strong> Fees from every launch that names the account, in each pair token, to your wallet.</li>
            </ol>
            <dl className="launchPreviewFacts">
              <div><dt>Platforms</dt><dd>{SOCIAL_PLATFORMS.map((item) => item.label).join(", ")}</dd></div>
              <div><dt>Seed phrase</dt><dd>Never needed. Never share it.</dd></div>
            </dl>
          </div>
          <p className="fieldHint"><Link href="/docs#social-fees">How social fees work →</Link></p>
        </aside>
      </div>
    </main>
  );
}

