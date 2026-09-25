"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  createPublicClient,
  createWalletClient,
  custom,
  decodeEventLog,
  defineChain,
  isAddress,
  parseUnits,
  type Address,
  type EIP1193Provider,
  type Hex,
} from "viem";
import {
  FORTUNE_NETWORK,
  FORTUNE_NETWORK_CONFIGURED,
} from "@/lib/fortune-network";

type LaunchMode = "standard";

type LaunchAsset = {
  address: Address;
  name: string;
  symbol: string;
  decimals: number;
  category: string;
  healthy: boolean;
  launchable: boolean;
};

type LaunchReceipt = {
  mode: LaunchMode;
  token: Address;
  curve: Address;
  transactionHash: Hex;
};

const standardParams = [
  { name: "name", type: "string" },
  { name: "symbol", type: "string" },
  { name: "totalSupply", type: "uint256" },
  { name: "quoteAssets", type: "address[]" },
  { name: "weightsBps", type: "uint16[]" },
  { name: "primaryQuote", type: "address" },
  { name: "basePriceUsd1e18", type: "uint256" },
  { name: "slopeUsd1e18", type: "uint256" },
  { name: "graduationUsd1e18", type: "uint256" },
  { name: "adaptiveGraduation", type: "bool" },
  { name: "feeBps", type: "uint16[6]" },
  { name: "treasury", type: "address" },
  { name: "metadataEditable", type: "bool" },
  { name: "description", type: "string" },
  { name: "imageURI", type: "string" },
  { name: "website", type: "string" },
  { name: "xProfile", type: "string" },
  { name: "telegram", type: "string" },
  { name: "github", type: "string" },
  { name: "youtube", type: "string" },
  { name: "debox", type: "string" },
] as const;

const standardFactoryAbi = [
  {
    type: "function",
    name: "preflightLaunch",
    stateMutability: "view",
    inputs: [{ name: "p", type: "tuple", components: standardParams }],
    outputs: [
      { name: "ready", type: "bool" },
      { name: "reasonCode", type: "bytes32" },
    ],
  },
  {
    type: "function",
    name: "previewPreparedVanity",
    stateMutability: "view",
    inputs: [
      { name: "creator", type: "address" },
      { name: "p", type: "tuple", components: standardParams },
    ],
    outputs: [
      { name: "vanitySalt", type: "bytes32" },
      { name: "predictedToken", type: "address" },
      { name: "manifestHash", type: "bytes32" },
      { name: "launchNonce", type: "uint256" },
    ],
  },
  {
    type: "function",
    name: "createLaunchPrepared",
    stateMutability: "nonpayable",
    inputs: [
      { name: "p", type: "tuple", components: standardParams },
      { name: "vanitySalt", type: "bytes32" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "createLaunchPreparedAndBuy",
    stateMutability: "nonpayable",
    inputs: [
      { name: "p", type: "tuple", components: standardParams },
      { name: "vanitySalt", type: "bytes32" },
      { name: "amountIn", type: "uint256" },
      { name: "minTokensOut", type: "uint256" },
    ],
    outputs: [
      { name: "info", type: "tuple", components: [
        { name: "creator", type: "address" },
        { name: "token", type: "address" },
        { name: "curve", type: "address" },
        { name: "feeRouter", type: "address" },
        { name: "holderVault", type: "address" },
        { name: "buybackVault", type: "address" },
        { name: "liquidityVault", type: "address" },
        { name: "manifestHash", type: "bytes32" },
        { name: "vanitySalt", type: "bytes32" },
        { name: "createdAt", type: "uint64" },
      ] },
      { name: "tokensOut", type: "uint256" },
    ],
  },
  {
    type: "event",
    name: "LaunchCreated",
    inputs: [
      { name: "launchId", type: "uint256", indexed: true },
      { name: "creator", type: "address", indexed: true },
      { name: "token", type: "address", indexed: true },
      { name: "curve", type: "address", indexed: false },
      { name: "manifestHash", type: "bytes32", indexed: false },
    ],
  },
] as const;

const erc20Abi = [
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
] as const;

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

function provider() {
  const injected = (
    window as Window & { ethereum?: EIP1193Provider }
  ).ethereum;

  if (!injected) {
    throw new Error(
      "No EVM wallet found. Install MetaMask or another BNB Chain compatible wallet."
    );
  }

  return injected;
}

async function connectNetwork() {
  const ethereum = provider();
  const accounts = (await ethereum.request({
    method: "eth_requestAccounts",
  })) as Address[];

  if (!accounts?.[0]) {
    throw new Error("Wallet did not return an account.");
  }

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

  const activeChain = await ethereum.request({ method: "eth_chainId" });
  if (String(activeChain).toLowerCase() !== FORTUNE_NETWORK.chainHex.toLowerCase()) {
    throw new Error("Wallet did not switch to the selected BNB network. No transaction was submitted.");
  }

  return accounts[0];
}

function clients(account: Address) {
  const transport = custom(provider());

  return {
    publicClient: createPublicClient({ chain, transport }),
    walletClient: createWalletClient({
      account,
      chain,
      transport,
    }),
  };
}

function decodeReason(value: Hex) {
  try {
    const raw = value.slice(2);
    const bytes = raw.match(/.{2}/g) || [];
    return bytes
      .map((byte) => String.fromCharCode(parseInt(byte, 16)))
      .join("")
      .replace(/\0/g, "")
      .trim();
  } catch {
    return value;
  }
}

function short(value: string) {
  return value.slice(0, 8) + "…" + value.slice(-6);
}

function parseTokenAmount(
  label: string,
  value: string,
  decimals: number
) {
  const clean = value.trim() || "0";
  if (!/^\d+(?:\.\d+)?$/.test(clean)) {
    throw new Error(label + " must be a non-negative number.");
  }
  const fractional = clean.split(".")[1] || "";
  if (fractional.length > decimals) {
    throw new Error(
      label + " supports at most " + decimals + " decimal places."
    );
  }
  return parseUnits(clean, decimals);
}

function publicMetadataUrl(
  label: string,
  value: string,
  options?: { allowIpfs?: boolean }
) {
  const clean = value.trim();
  if (!clean) return "";
  if (clean.length > 512) {
    throw new Error(label + " must be 512 characters or fewer.");
  }
  if (options?.allowIpfs && clean.toLowerCase().startsWith("ipfs://")) {
    return clean;
  }

  let parsed: URL;
  try {
    parsed = new URL(clean);
  } catch {
    throw new Error(
      label +
        " must be a valid http(s) URL" +
        (options?.allowIpfs ? " or ipfs:// URI." : ".")
    );
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error(
      label +
        " must use http:// or https://" +
        (options?.allowIpfs
          ? " (image metadata may also use ipfs://)."
          : ".")
    );
  }
  return clean;
}

export default function LaunchPage() {
  const mode: LaunchMode = "standard";
  const [account, setAccount] = useState<Address | null>(null);
  const [assets, setAssets] = useState<LaunchAsset[]>([]);
  const [assetSearch, setAssetSearch] = useState("");
  const [selectedAsset, setSelectedAsset] = useState<Address | null>(null);
  const [assetError, setAssetError] = useState("");
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [description, setDescription] = useState("");
  const [imageURI, setImageURI] = useState("");
  const [totalSupply, setTotalSupply] = useState(FORTUNE_NETWORK.isTestnet ? "1000000000" : "10000000");
  const [basePrice, setBasePrice] = useState("0.001");
  const [slope, setSlope] = useState(FORTUNE_NETWORK.isTestnet ? "0.000000000001" : "0.00000001");
  const [graduationTarget, setGraduationTarget] = useState(FORTUNE_NETWORK.isTestnet ? "1" : "50");
  const [creatorPurchase, setCreatorPurchase] = useState("0");
  const [treasury, setTreasury] = useState("");
  const [website, setWebsite] = useState("");
  const [xProfile, setXProfile] = useState("");
  const [telegram, setTelegram] = useState("");
  const [github, setGithub] = useState("");
  const [youtube, setYoutube] = useState("");
  const [debox, setDebox] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [receipt, setReceipt] = useState<LaunchReceipt | null>(null);
  const [reviewed, setReviewed] = useState(false);

  const visibleAssets = useMemo(() => {
    const needle = assetSearch.trim().toLowerCase();
    if (!needle) return assets;

    return assets.filter((asset) =>
      [
        asset.symbol,
        asset.name,
        asset.category,
        asset.address,
      ]
        .join(" ")
        .toLowerCase()
        .includes(needle)
    );
  }, [assets, assetSearch]);

  const selected = assets.find(
    (asset) => asset.address.toLowerCase() === selectedAsset?.toLowerCase()
  ) || null;

  useEffect(() => {
    if (!FORTUNE_NETWORK_CONFIGURED) return;

    let cancelled = false;

    fetch("/api/public/v1/assets?launchable=true&limit=250", {
      cache: "no-store",
    })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok || !body?.data?.items) {
          throw new Error(
            body?.error?.message || "Could not load launchable assets."
          );
        }

        const next = body.data.items as LaunchAsset[];
        if (cancelled) return;

        setAssets(next);
        setSelectedAsset((current) => {
          if (current) return current;

          const primary = next.find(
            (item) =>
              item.address.toLowerCase() ===
              FORTUNE_NETWORK.primaryQuote.address.toLowerCase()
          );

          return primary?.address || next[0]?.address || null;
        });
      })
      .catch((error) => {
        if (!cancelled) {
          setAssetError(
            error instanceof Error
              ? error.message
              : "Could not load launchable assets."
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  async function launch() {
    setBusy(true);
    setMessage("");
    setReceipt(null);

    try {
      if (!FORTUNE_NETWORK_CONFIGURED || mode !== "standard") {
        throw new Error("This launch stack is not configured. Mainnet stays blocked until the Standard release gates pass.");
      }
      if (FORTUNE_NETWORK.isMainnet) {
        const readinessResponse = await fetch("/api/public/v1/readiness", { cache: "no-store" });
        const readinessBody = await readinessResponse.json();
        if (!readinessResponse.ok || readinessBody?.data?.ready !== true) {
          throw new Error("Fortune mainnet is not release-ready. No wallet transaction was constructed.");
        }
      }

      // Re-confirm the production network immediately before constructing any
      // real-value transaction; a previously connected account may have since
      // switched chains.
      const wallet = await connectNetwork();
      setAccount(wallet);

      if (!selected) {
        throw new Error("Choose a launchable payment asset.");
      }

      const cleanName = name.trim();
      const cleanSymbol = symbol.trim().toUpperCase();

      if (!cleanName || cleanName.length > 64) {
        throw new Error("Token name must be 1–64 characters.");
      }
      if (!cleanSymbol || cleanSymbol.length > 16) {
        throw new Error("Ticker must be 1–16 characters.");
      }
      if (!/^\d+(\.\d+)?$/.test(totalSupply) || Number(totalSupply) <= 0) {
        throw new Error("Enter a valid positive token supply.");
      }
      if (!basePrice || Number(basePrice) <= 0) {
        throw new Error("Enter a positive opening price in USD.");
      }
      if (Number(slope) < 0) {
        throw new Error("Slope cannot be negative.");
      }
      if (!graduationTarget || Number(graduationTarget) <= 0) {
        throw new Error("Enter a positive graduation target in USD.");
      }

      const treasuryInput = treasury.trim();
      if (treasuryInput && !isAddress(treasuryInput)) {
        throw new Error(
          "Community treasury recipient must be a valid EVM address."
        );
      }
      const destination = treasuryInput
        ? (treasuryInput as Address)
        : wallet;
      const initial = parseTokenAmount(
        "Creator first purchase",
        creatorPurchase,
        selected.decimals
      );
      const meta = {
        description: description.trim().slice(0, 4096),
        imageURI: publicMetadataUrl("Image", imageURI, { allowIpfs: true }),
        website: publicMetadataUrl("Website", website),
        xProfile: publicMetadataUrl("X / Twitter", xProfile),
        telegram: publicMetadataUrl("Telegram", telegram),
        github: publicMetadataUrl("GitHub", github),
        youtube: publicMetadataUrl("YouTube", youtube),
        debox: publicMetadataUrl("DeBox", debox),
      };

      const { publicClient, walletClient } = clients(wallet);
      let hash: Hex;

      {
        const params = {
          name: cleanName,
          symbol: cleanSymbol,
          totalSupply: parseUnits(totalSupply, 18),
          quoteAssets: [selected.address],
          weightsBps: [10_000],
          primaryQuote: selected.address,
          basePriceUsd1e18: parseUnits(basePrice, 18),
          slopeUsd1e18: parseUnits(slope || "0", 18),
          graduationUsd1e18: parseUnits(graduationTarget, 18),
          adaptiveGraduation: true,
          // Chain-56 v1 rejects holder, buyback and liquidity fee routes.
          feeBps: [50, 0, 0, 0, 0, 50] as const,
          treasury: destination,
          metadataEditable: false,
          ...meta,
        };

        setMessage("Running onchain launch preflight…");

        const [ready, reasonCode] = await publicClient.readContract({
          address: FORTUNE_NETWORK.contracts.factory as Address,
          abi: standardFactoryAbi,
          functionName: "preflightLaunch",
          args: [params],
        });

        if (!ready) {
          throw new Error(
            "Launch preflight failed: " +
              (decodeReason(reasonCode) || reasonCode)
          );
        }

        const [salt] = await publicClient.readContract({
          address: FORTUNE_NETWORK.contracts.factory as Address,
          abi: standardFactoryAbi,
          functionName: "previewPreparedVanity",
          args: [wallet, params],
        });

        if (initial > 0n) {
          setMessage("Approve the creator purchase, then confirm the atomic launch + first buy.");
          const approveHash = await walletClient.writeContract({
            address: selected.address,
            abi: erc20Abi,
            functionName: "approve",
            args: [FORTUNE_NETWORK.contracts.factory as Address, initial],
          });
          await publicClient.waitForTransactionReceipt({ hash: approveHash });

          setMessage("Simulating the atomic first buy and its opening shield fee…");
          const simulation = await publicClient.simulateContract({
            account: wallet,
            address: FORTUNE_NETWORK.contracts.factory as Address,
            abi: standardFactoryAbi,
            functionName: "createLaunchPreparedAndBuy",
            args: [params, salt, initial, 1n],
          });
          const expectedTokens = simulation.result[1];
          if (expectedTokens <= 1n) {
            throw new Error("The first-buy simulation produced no usable token output. No launch was submitted.");
          }
          const minTokensOut = (expectedTokens * 95n) / 100n;

          hash = await walletClient.writeContract({
            address: FORTUNE_NETWORK.contracts.factory as Address,
            abi: standardFactoryAbi,
            functionName: "createLaunchPreparedAndBuy",
            args: [params, salt, initial, minTokensOut > 0n ? minTokensOut : 1n],
          });
        } else {
          setMessage("Confirm the launch transaction in your wallet.");
          hash = await walletClient.writeContract({
            address: FORTUNE_NETWORK.contracts.factory as Address,
            abi: standardFactoryAbi,
            functionName: "createLaunchPrepared",
            args: [params, salt],
          });
        }
      }

      const txReceipt = await publicClient.waitForTransactionReceipt({ hash });
      let created: LaunchReceipt | null = null;

      for (const log of txReceipt.logs) {
        try {
          if (log.address.toLowerCase() !== FORTUNE_NETWORK.contracts.factory.toLowerCase()) continue;
          const event = decodeEventLog({
            abi: standardFactoryAbi,
            eventName: "LaunchCreated",
            data: log.data,
            topics: log.topics,
          });
          created = { mode, token: event.args.token, curve: event.args.curve, transactionHash: hash };
          break;
        } catch {
          // Ignore unrelated logs.
        }
      }

      if (!created) {
        throw new Error(
          "The transaction confirmed, but Fortune could not decode the launch event."
        );
      }

      setReceipt(created);
      setMessage("Standard launch confirmed on " + FORTUNE_NETWORK.chainName + ".");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Launch failed.");
    } finally {
      setBusy(false);
    }
  }

  const cleanNamePreview = name.trim();
  const cleanSymbolPreview = symbol.trim();
  const firstBuyPreview = Number(creatorPurchase) > 0 ? creatorPurchase.trim() + " " + (selected?.symbol || "") : "";

  return (
    <main className="page launchPage">
      <section className="pageHeading launchHeading">
        <div>
          <span className="eyebrow">BNB CHAIN · CREATE</span>
          <h1>Make your own luck.</h1>
          <p>Name it, choose a reviewed pair, then inspect the exact launch before your wallet signs.</p>
        </div>
        <img className="launchHeadingArt" src="/fortune-cat-cutout.webp" alt="Fortune lucky cat holding a fortune cookie" width="170" height="170" />
      </section>

      <div className="registryNotice">
        <strong>{FORTUNE_NETWORK.isMainnet ? "MAINNET RELEASE GATED" : "PUBLIC BSC TESTNET ALPHA"}</strong>
        <span>{FORTUNE_NETWORK.isMainnet
          ? "The Standard launch button unlocks only after all onchain and release checks pass."
          : "Create a valueless testnet Standard launch here. Use the testnet lab for the mock-asset faucet and detailed research controls."}</span>
      </div>

      <div className="launchLayout">
        <div className="launchMain">
          <ol className="journeySteps" aria-label="Launch steps">
            <li><span>1</span>Name + ticker + image</li><li><span>2</span>Launch type</li><li><span>3</span>Pair asset</li><li><span>4</span>First buy</li><li><span>5</span>Review + launch</li>
          </ol>

          <section className="formCard">
            <div className="formSectionTitle"><span>01</span><div><h2>Token identity</h2><p>These details are visible to everyone.</p></div></div>
            <div className="fieldGrid">
              <label>Token name<input value={name} maxLength={64} onChange={(event) => { setName(event.target.value); setReviewed(false); }} placeholder="Your token name" /></label>
              <label>Ticker<input value={symbol} maxLength={16} onChange={(event) => { setSymbol(event.target.value.toUpperCase()); setReviewed(false); }} placeholder="LUCK" /></label>
              <label>Image URL or IPFS URI<input value={imageURI} onChange={(event) => { setImageURI(event.target.value); setReviewed(false); }} placeholder="https://… or ipfs://…" /><small className="fieldHint">Host a square image publicly first. Fortune records this link immutably at launch; image upload hosting is still being prepared.</small></label>
            </div>
          </section>

          <section className="formCard">
            <div className="formSectionTitle"><span>02</span><div><h2>Launch type</h2><p>Standard is the only mainnet candidate.</p></div></div>
            <div className="launchModeRow">
              <button type="button" className="selectedMode" aria-pressed="true"><strong>Standard</strong><span>Fixed supply · Pancake V3 · permanently locked LP position</span></button>
              <button type="button" disabled aria-disabled="true" title="Separate testnet research and audit required"><strong>Burn + Rewards</strong><span>Pair-asset holder claims via Infinity hook · v2 in research</span></button>
            </div>
          </section>

          <section className="formCard">
            <div className="formSectionTitle"><span>03</span><div><h2>Pair asset</h2><p>Only live registry-approved assets are selectable.</p></div></div>
            <div className="assetPickerToolbar">
              <input aria-label="Search approved pair assets" value={assetSearch} onChange={(event) => setAssetSearch(event.target.value)} placeholder="Search approved BNB assets" />
              <Link href="/assets" className="secondaryCta">Pair policy →</Link>
            </div>
            {assetError ? <div className="registryNotice statusError"><strong>ASSET READ FAILED</strong><span>{assetError}</span></div> : null}
            {visibleAssets.length === 0 && !assetError ? <div className="emptyPanel"><strong>No approved pair found.</strong><p>Asset discovery alone does not mean an asset is safe to pair.</p></div> : null}
            <div className="launchAssetGrid">
              {visibleAssets.map((asset) => <button type="button" key={asset.address} className={selectedAsset?.toLowerCase() === asset.address.toLowerCase() ? "assetOption assetSelected" : "assetOption"} aria-pressed={selectedAsset?.toLowerCase() === asset.address.toLowerCase()} onClick={() => { setSelectedAsset(asset.address); setReviewed(false); }}>
                <span className="assetIconLarge">{asset.symbol.slice(0, 2)}</span><span><strong>{asset.symbol}</strong><small>{asset.name}</small></span><em>{asset.category}</em>
              </button>)}
            </div>
          </section>

          <section className="formCard">
            <div className="formSectionTitle"><span>04</span><div><h2>Optional first buy</h2><p>Zero means launch without a creator purchase.</p></div></div>
            <div className="fieldGrid"><label>Amount in {selected?.symbol || "pair asset"}<input value={creatorPurchase} inputMode="decimal" onChange={(event) => { setCreatorPurchase(event.target.value); setReviewed(false); }} placeholder="0" /></label></div>
            <p className="reviewWarning">The Launch Shield charges up to 99% on buys in the first five seconds, including a creator first buy. Fortune simulates the atomic transaction and sets a minimum token output before submitting it.</p>
          </section>

          <details className="advancedLaunch">
            <summary>Advanced · curve economics and profile links</summary>
            <p>These research defaults mirror the mainnet fork rehearsal. They remain subject to independent economic review and onchain preflight.</p>
            <div className="fieldGrid">
              <label>Total token supply<input value={totalSupply} inputMode="decimal" onChange={(event) => { setTotalSupply(event.target.value); setReviewed(false); }} /></label>
              <label>Opening price · USD<input value={basePrice} inputMode="decimal" onChange={(event) => { setBasePrice(event.target.value); setReviewed(false); }} /></label>
              <label>Slope · USD per token<input value={slope} inputMode="decimal" onChange={(event) => { setSlope(event.target.value); setReviewed(false); }} /></label>
              <label>Graduation target · USD<input value={graduationTarget} inputMode="decimal" onChange={(event) => { setGraduationTarget(event.target.value); setReviewed(false); }} /></label>
              <label>Community treasury · optional<input value={treasury} onChange={(event) => { setTreasury(event.target.value); setReviewed(false); }} placeholder="Defaults to creator wallet" /></label>
              <label>Website · optional<input value={website} onChange={(event) => { setWebsite(event.target.value); setReviewed(false); }} placeholder="https://…" /></label>
              <label>X · optional<input value={xProfile} onChange={(event) => { setXProfile(event.target.value); setReviewed(false); }} placeholder="https://x.com/…" /></label>
              <label>Telegram · optional<input value={telegram} onChange={(event) => { setTelegram(event.target.value); setReviewed(false); }} placeholder="https://t.me/…" /></label>
              <label>GitHub · optional<input value={github} onChange={(event) => { setGithub(event.target.value); setReviewed(false); }} /></label>
              <label>YouTube · optional<input value={youtube} onChange={(event) => { setYoutube(event.target.value); setReviewed(false); }} /></label>
              <label>DeBox · optional<input value={debox} onChange={(event) => { setDebox(event.target.value); setReviewed(false); }} /></label>
            </div>
            <label>Description · optional<textarea value={description} maxLength={4096} onChange={(event) => { setDescription(event.target.value); setReviewed(false); }} /></label>
          </details>

          <section className="formCard">
            <div className="formSectionTitle"><span>05</span><div><h2>Review and launch</h2><p>Confirm the immutable details before signing.</p></div></div>
            {!reviewed ? <button className="launchButton" disabled={!name.trim() || !symbol.trim() || !imageURI.trim() || !selected} onClick={() => { setMessage(""); setReviewed(true); }}>Review launch →</button> : <>
              <div className="reviewSummary">
                <div><span>Token</span><strong translate="no">{name.trim()} · {symbol.trim()}</strong></div>
                <div><span>Pair</span><strong>{selected?.symbol || "—"} · {selected ? short(selected.address) : "—"}</strong></div>
                <div><span>Supply / target</span><strong>{totalSupply} tokens · ${graduationTarget}</strong></div>
                <div><span>Creator first buy</span><strong>{creatorPurchase || "0"} {selected?.symbol || ""}</strong></div>
                <div><span>Fee route</span><strong>0.5% creator · 0.5% protocol</strong></div>
                <div><span>Liquidity / mode</span><strong>Pancake V3 · Standard · fixed metadata</strong></div>
                <div><span>Image URI</span><strong translate="no">{imageURI}</strong></div>
              </div>
              <p className="reviewWarning">An approved pair and wallet transaction are required. Fortune checks the current chain, release state and onchain preflight again before any submission.</p>
              <div className="reviewActions">
                <button className="launchButton" disabled={busy || !selected || !FORTUNE_NETWORK_CONFIGURED} onClick={() => void launch()}>{busy ? "Checking launch…" : FORTUNE_NETWORK_CONFIGURED ? FORTUNE_NETWORK.isMainnet ? "Confirm in wallet →" : "Launch on BSC Testnet →" : "Launch paused"}</button>
                <button type="button" className="secondaryCta" onClick={() => setReviewed(false)}>Edit details</button>
              </div>
              {!FORTUNE_NETWORK_CONFIGURED && FORTUNE_NETWORK.isMainnet ? <p className="fieldHint">The release manifest and live contract checks must pass before mainnet transactions unlock.</p> : null}
              {FORTUNE_NETWORK.isTestnet ? <p className="fieldHint">Need valueless fUSD or tBNB gas? <Link href="/testnet">Open the testnet lab and faucet →</Link></p> : null}
            </>}
          </section>

          <section className="panel launchStatus">
            <span className="eyebrow">STATUS</span>
            <p className="launchDescription">
              {message || "No transaction submitted yet."}
            </p>

            {receipt ? (
              <div className="heroActions">
                <a
                  className="secondaryCta"
                  href={
                    FORTUNE_NETWORK.explorerUrl +
                    "/tx/" +
                    receipt.transactionHash
                  }
                  target="_blank"
                  rel="noreferrer"
                >
                  Transaction ↗
                </a>
                <a
                  className="secondaryCta"
                  href={
                    FORTUNE_NETWORK.explorerUrl +
                    "/address/" +
                    receipt.token
                  }
                  target="_blank"
                  rel="noreferrer"
                >
                  Token ↗
                </a>
                <Link
                  className="primaryCta"
                  href={
                    "/market/" +
                    receipt.curve
                  }
                >
                  Open market →
                </Link>
              </div>
            ) : null}
          </section>
        </div>

        <aside className="launchAside" aria-label="Launch preview">
          <div className="launchPreviewCard">
            <span className="eyebrow">LIVE PREVIEW</span>
            <div className="launchPreviewToken">
              <span className="tokenAvatar tokenAvatarLarge" translate="no">{(cleanSymbolPreview || "LU").slice(0, 2)}</span>
              <div>
                {cleanNamePreview ? <strong translate="no">{cleanNamePreview}</strong> : <strong>Your token</strong>}
                <span translate="no">{cleanSymbolPreview ? "$" + cleanSymbolPreview : "$TICKER"}</span>
              </div>
            </div>
            <dl className="launchPreviewFacts">
              <div><dt>Launch type</dt><dd>Standard</dd></div>
              <div><dt>Pair</dt><dd>{selected?.symbol || "Choose a pair"}</dd></div>
              <div><dt>First buy</dt><dd>{firstBuyPreview || "None"}</dd></div>
              <div><dt>Fee route</dt><dd>0.5% creator · 0.5% protocol</dd></div>
              <div><dt>Graduation</dt><dd>Pancake V3 · locked LP</dd></div>
              <div><dt>Token address</dt><dd>Ends in fe</dd></div>
            </dl>
            <p className="launchPreviewNote">Fortune repeats the onchain preflight before your wallet signs.</p>
          </div>
          <img className="launchAsideArt" src="/fortune-cat-rewards.webp" alt="" width="1254" height="1254" loading="lazy" />
        </aside>
      </div>
    </main>
  );
}
