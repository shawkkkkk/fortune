"use client";

import Link from "next/link";
import { useEffect, useState, useRef } from "react";
import {
  createPublicClient,
  createWalletClient,
  custom,
  decodeEventLog,
  defineChain,
  isAddress,
  type TransactionReceipt,
  type Address,
  type EIP1193Provider,
  type Hex,
} from "viem";
import {
  FORTUNE_NETWORK,
  FORTUNE_NETWORK_CONFIGURED,
} from "@/lib/fortune-network";

import { assertWalletIdentity, parseLaunchAmount, restorePendingLaunch, type PendingLaunch } from "@/lib/launch-safety";
import TokenImageInput from "@/components/TokenImageInput";
import PairPicker from "@/components/PairPicker";
import { useLanguage } from "@/components/LanguageProvider";
import { curveEconomics, firstBuyPreview as previewFirstBuy } from "@/lib/launch-preview";
import { formatAmount, formatUsd } from "@/lib/market-format";
import { byteLength, importMetadataUri, validateCreatorMetadata, type CreatorMetadata } from "@/lib/creator-metadata";
import { launchDraftKey, makeLaunchDraft, restoreLaunchDraft, type LaunchDraft } from "@/lib/launch-draft";

type LaunchMode = "standard";

type LaunchAsset = {
  address: Address;
  name: string;
  symbol: string;
  decimals: number;
  category: string;
  healthy: boolean;
  launchable: boolean;
  priceUsd1e18?: string;
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

export default function LaunchPage() {
  const mode: LaunchMode = "standard";
  const [account, setAccount] = useState<Address | null>(null);
  const { language } = useLanguage();
  const zh = language === "zh";
  const [assets, setAssets] = useState<LaunchAsset[]>([]);
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
  const [metadataBusy, setMetadataBusy] = useState(false);
  const [metadataURI, setMetadataURI] = useState("");
  const [importedMetadata, setImportedMetadata] = useState<CreatorMetadata | null>(null);
  const [metadataMessage, setMetadataMessage] = useState("");
  const [savedDraft, setSavedDraft] = useState<LaunchDraft | null>(null);
  const [draftMessage, setDraftMessage] = useState("");
  const [message, setMessage] = useState("");
  const [receipt, setReceipt] = useState<LaunchReceipt | null>(null);
  const [reviewed, setReviewed] = useState(false);
  const [pending, setPending] = useState<PendingLaunch | null>(null);
  const [storageLoaded, setStorageLoaded] = useState(false);
  const signing = useRef(false);
  const pendingKey = `fortune:launch:${FORTUNE_NETWORK.chainId}:${FORTUNE_NETWORK.contracts.factory.toLowerCase()}`;
  const draftKey = launchDraftKey(FORTUNE_NETWORK.chainId, FORTUNE_NETWORK.contracts.factory);

  function currentMetadata(): CreatorMetadata {
    return { name, symbol, description, imageURI, website, xProfile, telegram, github, youtube, debox };
  }
  function applyMetadata(meta: CreatorMetadata) {
    setName(meta.name); setSymbol(meta.symbol); setDescription(meta.description); setImageURI(meta.imageURI);
    setWebsite(meta.website); setXProfile(meta.xProfile); setTelegram(meta.telegram);
    setGithub(meta.github); setYoutube(meta.youtube); setDebox(meta.debox); setReviewed(false);
  }
  useEffect(() => {
    try { setSavedDraft(restoreLaunchDraft(localStorage.getItem(draftKey), FORTUNE_NETWORK.chainId, FORTUNE_NETWORK.contracts.factory)); }
    catch { setDraftMessage("Browser storage is unavailable. Drafts cannot be saved on this device."); }
  }, [draftKey]);
  function saveDraft() {
    try {
      const draft = makeLaunchDraft({ ...currentMetadata(), metadataURI, totalSupply, basePrice, slope, graduationTarget, creatorPurchase, treasury, selectedAsset }, FORTUNE_NETWORK.chainId, FORTUNE_NETWORK.contracts.factory);
      localStorage.setItem(draftKey, JSON.stringify(draft)); setSavedDraft(draft);
      setDraftMessage("Draft saved on this browser. No transaction submitted. Unuploaded image files are not included.");
    } catch (e) { setDraftMessage(e instanceof Error ? e.message : "Draft could not be saved. Browser storage may be full."); }
  }
  function restoreDraft() {
    if (!savedDraft) return;
    applyMetadata(savedDraft.fields);
    const fields = savedDraft.fields;
    setTotalSupply(fields.totalSupply); setBasePrice(fields.basePrice); setSlope(fields.slope);
    setGraduationTarget(fields.graduationTarget); setCreatorPurchase(fields.creatorPurchase); setTreasury(fields.treasury);
    setMetadataURI(fields.metadataURI); setImportedMetadata(null);
    const validPair = assets.find((asset) => asset.launchable && asset.address.toLowerCase() === fields.selectedAsset?.toLowerCase());
    setSelectedAsset(validPair?.address || null); setReviewed(false);
    setDraftMessage(validPair ? "Draft restored. Review every field again before launching." : "Draft restored. Choose a currently approved pair before launching.");
  }
  async function loadMetadata() {
    setMetadataBusy(true); setMetadataMessage(""); setImportedMetadata(null); setReviewed(false);
    try { setImportedMetadata(await importMetadataUri(metadataURI)); }
    catch (e) { setMetadataMessage(e instanceof Error ? e.message : "Metadata import failed. Check the URL and CORS settings."); }
    finally { setMetadataBusy(false); }
  }
  function reviewLaunch() {
    try {
      validateCreatorMetadata(currentMetadata());
      parseLaunchAmount("Token supply", totalSupply); parseLaunchAmount("Opening price", basePrice);
      parseLaunchAmount("Slope", slope); parseLaunchAmount("Graduation target", graduationTarget);
      parseLaunchAmount("Creator first purchase", creatorPurchase, selected?.decimals ?? 18);
      if (!selected?.launchable) throw new Error("Choose a currently approved pair.");
      setMessage(""); setReviewed(true);
    } catch (e) { setMessage(e instanceof Error ? e.message : "Review the launch fields."); setReviewed(false); }
  }

  useEffect(() => {
    try {
      const saved = restorePendingLaunch(localStorage.getItem(pendingKey), FORTUNE_NETWORK.chainId, FORTUNE_NETWORK.contracts.factory);
      setPending(saved);
      if (saved) setMessage("A submitted launch needs confirmation. Check its status before starting another launch.");
    } catch { /* Storage may be unavailable; the current session still tracks submission. */ }
    setStorageLoaded(true);
  }, [pendingKey]);

  function rememberPending(value: PendingLaunch | null) {
    setPending(value);
    try {
      if (value) localStorage.setItem(pendingKey, JSON.stringify(value));
      else localStorage.removeItem(pendingKey);
    } catch { /* Never misreport a submitted transaction as failed if storage is full. */ }
  }

  async function requireLiveRelease() {
    if (!FORTUNE_NETWORK.isMainnet) return;
    const response = await fetch("/api/public/v1/readiness", { cache: "no-store" });
    const body = await response.json();
    if (!response.ok || body?.data?.ready !== true || body?.data?.chainId !== 56) {
      throw new Error("Fortune mainnet is not release-ready. No wallet transaction was constructed.");
    }
  }

  function acceptReceipt(txReceipt: TransactionReceipt, hash: Hex) {
    if (txReceipt.status !== "success") {
      rememberPending(null);
      setMessage("The launch transaction reverted. No launch was created; gas may have been spent.");
      return;
    }
    for (const log of txReceipt.logs) {
      if (log.address.toLowerCase() !== FORTUNE_NETWORK.contracts.factory.toLowerCase()) continue;
      try {
        const event = decodeEventLog({ abi: standardFactoryAbi, eventName: "LaunchCreated", data: log.data, topics: log.topics });
        setReceipt({ mode, token: event.args.token, curve: event.args.curve, transactionHash: hash });
        rememberPending(null);
        setMessage("Standard launch confirmed on " + FORTUNE_NETWORK.chainName + ".");
        return;
      } catch { /* Ignore other events emitted by the factory. */ }
    }
    setMessage("Transaction confirmed, but its launch event could not be verified. Inspect the transaction before starting another launch.");
  }

  async function recoverLaunch() {
    if (!pending || signing.current) return;
    signing.current = true;
    setBusy(true);
    try {
      const response = await fetch(`/api/public/v1/transactions/${pending.hash}`, { cache: "no-store" });
      const body = await response.json();
      const data = body?.data;
      if (!response.ok || data?.chainId !== pending.chainId) throw new Error("Transaction status is unavailable. Keep the saved hash and check again.");
      if (data.state === "confirmed" || data.state === "reverted") {
        if (data.from?.toLowerCase() !== pending.account.toLowerCase() || data.to?.toLowerCase() !== pending.factory.toLowerCase()) throw new Error("Transaction identity could not be verified. Inspect it on BscScan.");
        if (data.state === "reverted") {
          rememberPending(null);
          setMessage("The saved launch reverted. Review the inputs before trying again; gas may have been spent.");
        } else if (data.launch) {
          setReceipt({ mode, token: data.launch.token, curve: data.launch.curve, transactionHash: pending.hash });
          rememberPending(null);
          setMessage("Your submitted launch is confirmed. Open its market below.");
        } else {
          setMessage("Transaction confirmed but no Fortune launch event was verified. Inspect it on BscScan before proceeding.");
        }
      } else {
        setMessage("The submitted transaction is pending or not yet visible to RPC. Do not resubmit; check again or inspect its nonce in your wallet.");
      }
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not recover the launch yet."); }
    finally { signing.current = false; setBusy(false); }
  }

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
        // /launch?pair=0x… preselects a pair, but only one this registry read marks launchable.
        let requested = "";
        try { requested = (new URLSearchParams(window.location.search).get("pair") || "").toLowerCase(); } catch { /* No query string. */ }
        setSelectedAsset((current) => {
          if (current) return current;

          const wanted = next.find((item) => item.launchable && item.address.toLowerCase() === requested);
          if (wanted) return wanted.address;

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
    if (signing.current || pending || !storageLoaded) return;
    signing.current = true;
    let submittedHash: Hex | null = null;
    setBusy(true);
    setMessage("");
    setReceipt(null);

    try {
      if (metadataBusy || !reviewed || !FORTUNE_NETWORK_CONFIGURED || mode !== "standard") {
        throw new Error("This launch stack is not configured. Mainnet stays blocked until the Standard release gates pass.");
      }
      await requireLiveRelease();
      const validatedMetadata = validateCreatorMetadata(currentMetadata());

      // Re-confirm the production network immediately before constructing any
      // real-value transaction; a previously connected account may have since
      // switched chains.
      const wallet = await connectNetwork();
      setAccount(wallet);

      if (!selected) {
        throw new Error("Choose a launchable payment asset.");
      }

      const cleanName = validatedMetadata.name;
      const cleanSymbol = validatedMetadata.symbol;

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
      const initial = parseLaunchAmount(
        "Creator first purchase",
        creatorPurchase,
        selected.decimals
      );
      const { name: _name, symbol: _symbol, ...meta } = validatedMetadata;

      const { publicClient, walletClient } = clients(wallet);
      let hash: Hex;

      {
        const params = {
          name: cleanName,
          symbol: cleanSymbol,
          totalSupply: parseLaunchAmount("Token supply", totalSupply),
          quoteAssets: [selected.address],
          weightsBps: [10_000],
          primaryQuote: selected.address,
          basePriceUsd1e18: parseLaunchAmount("Opening price", basePrice),
          slopeUsd1e18: parseLaunchAmount("Slope", slope),
          graduationUsd1e18: parseLaunchAmount("Graduation target", graduationTarget),
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
          await requireLiveRelease();
          await assertWalletIdentity(provider(), wallet, FORTUNE_NETWORK.chainId);
          const approveHash = await walletClient.writeContract({
            address: selected.address,
            abi: erc20Abi,
            functionName: "approve",
            args: [FORTUNE_NETWORK.contracts.factory as Address, initial],
          });
          const approval = await publicClient.waitForTransactionReceipt({ hash: approveHash });
          if (approval.status !== "success") throw new Error("Pair-asset approval reverted. No launch was submitted.");

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

          await requireLiveRelease();
          await assertWalletIdentity(provider(), wallet, FORTUNE_NETWORK.chainId);
          hash = await walletClient.writeContract({
            address: FORTUNE_NETWORK.contracts.factory as Address,
            abi: standardFactoryAbi,
            functionName: "createLaunchPreparedAndBuy",
            args: [params, salt, initial, minTokensOut > 0n ? minTokensOut : 1n],
          });
        } else {
          await publicClient.simulateContract({ account: wallet, address: FORTUNE_NETWORK.contracts.factory as Address, abi: standardFactoryAbi, functionName: "createLaunchPrepared", args: [params, salt] });
          setMessage("Confirm the launch transaction in your wallet.");
          await requireLiveRelease();
          await assertWalletIdentity(provider(), wallet, FORTUNE_NETWORK.chainId);
          hash = await walletClient.writeContract({
            address: FORTUNE_NETWORK.contracts.factory as Address,
            abi: standardFactoryAbi,
            functionName: "createLaunchPrepared",
            args: [params, salt],
          });
        }
      }

      submittedHash = hash;
      rememberPending({ hash, account: wallet, chainId: FORTUNE_NETWORK.chainId, factory: FORTUNE_NETWORK.contracts.factory as Address });
      setMessage("Launch submitted. Waiting for onchain confirmation…");
      const txReceipt = await publicClient.waitForTransactionReceipt({ hash, onReplaced: ({ transactionReceipt }) => {
        submittedHash = transactionReceipt.transactionHash;
        rememberPending({ hash: transactionReceipt.transactionHash, account: wallet, chainId: FORTUNE_NETWORK.chainId, factory: FORTUNE_NETWORK.contracts.factory as Address });
      } });
      if (txReceipt.to?.toLowerCase() !== FORTUNE_NETWORK.contracts.factory.toLowerCase()) {
        rememberPending(null);
        setMessage("The launch was replaced by another transaction. No Fortune launch was verified. Review your wallet before trying again.");
        return;
      }
      acceptReceipt(txReceipt, txReceipt.transactionHash);
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Launch could not complete.";
      setMessage(submittedHash ? "Transaction submitted. Check its onchain status before any retry. " + detail : detail);
    } finally {
      signing.current = false;
      setBusy(false);
    }
  }

  const curveInputs = { supply: Number(totalSupply), base: Number(basePrice), slope: Number(slope), graduationUsd: Number(graduationTarget) };
  const economics = curveEconomics(curveInputs);
  const quotePriceUsd = selected?.priceUsd1e18 ? Number(selected.priceUsd1e18) / 1e18 : 0;
  const buyPreview = previewFirstBuy({ ...curveInputs, amount: Number(creatorPurchase), quotePriceUsd });
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
          <fieldset aria-label="Token launch details" disabled={busy || metadataBusy || Boolean(pending)} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
          <section className="creatorDraftBar" aria-label="Launch draft">
            <div className="creatorToolbar"><strong>Your launch draft</strong><button type="button" className="secondaryCta" onClick={saveDraft}>Save draft</button>
              {savedDraft ? <><button type="button" className="secondaryCta" onClick={restoreDraft}>Restore draft</button><button type="button" className="secondaryCta" onClick={() => { try { localStorage.removeItem(draftKey); setSavedDraft(null); setDraftMessage("Saved draft deleted. Current form is unchanged."); } catch { setDraftMessage("Could not delete the saved draft."); } }}>Delete saved draft</button></> : null}
            </div><p className="fieldHint">Saved only in this browser, not to your wallet or the cloud. Restore replaces the current form. No funds move.</p>
            {draftMessage ? <p role="status" className="fieldHint">{draftMessage}</p> : null}
          </section>
          <ol className="journeySteps" aria-label="Launch steps">
            <li><span>1</span>Name + ticker + image</li><li><span>2</span>Launch type</li><li><span>3</span>Pair asset</li><li><span>4</span>First buy</li><li><span>5</span>Review + launch</li>
          </ol>

          <section className="formCard">
            <div className="formSectionTitle"><span>01</span><div><h2>Token identity</h2><p>These details are visible to everyone.</p></div></div>
            <div className="fieldGrid">
              <label>Token name<input value={name} maxLength={64} onChange={(event) => { setName(event.target.value); setReviewed(false); }} placeholder="Your token name" /></label>
              <label>Ticker<input value={symbol} maxLength={16} onChange={(event) => { setSymbol(event.target.value); setReviewed(false); }} placeholder="LUCK" /></label>
            </div>
            <TokenImageInput value={imageURI} disabled={busy || metadataBusy || Boolean(pending)} onChange={(value) => { setImageURI(value); setReviewed(false); }} onBusy={setMetadataBusy} />
            <label>Description · optional<textarea value={description} maxLength={4096} rows={4} onChange={(event) => { setDescription(event.target.value); setReviewed(false); }} placeholder="What is your token about?" /><small className="fieldHint">{byteLength(description)} / 4096 UTF-8 bytes</small></label>
            <h3>Project links</h3><p className="fieldHint">Optional. Stored as fixed onchain metadata with your token.</p>
            <div className="fieldGrid">
              <label>Website · optional<input value={website} maxLength={512} onChange={(event) => { setWebsite(event.target.value); setReviewed(false); }} placeholder="https://…" /></label>
              <label>X · optional<input value={xProfile} maxLength={512} onChange={(event) => { setXProfile(event.target.value); setReviewed(false); }} placeholder="https://x.com/…" /></label>
              <label>Telegram · optional<input value={telegram} maxLength={512} onChange={(event) => { setTelegram(event.target.value); setReviewed(false); }} placeholder="https://t.me/…" /></label>
            </div>
            <details className="creatorExtraLinks"><summary>More project links</summary><div className="fieldGrid">
              <label>GitHub · optional<input value={github} maxLength={512} onChange={(event) => { setGithub(event.target.value); setReviewed(false); }} placeholder="https://github.com/…" /></label>
              <label>YouTube · optional<input value={youtube} maxLength={512} onChange={(event) => { setYoutube(event.target.value); setReviewed(false); }} placeholder="https://youtube.com/…" /></label>
              <label>DeBox · optional<input value={debox} maxLength={512} onChange={(event) => { setDebox(event.target.value); setReviewed(false); }} placeholder="https://…" /></label>
            </div></details>
            <details className="creatorExtraLinks"><summary>Advanced · custom metadata URI</summary>
              <p className="fieldHint">Import JSON into the fields above. Standard stores those fields onchain, not the JSON URI. Unknown JSON fields are ignored; imported fields replace the current identity only when you apply them.</p>
              <div className="creatorToolbar"><label>Metadata URI<input value={metadataURI} maxLength={512} onChange={(e) => { setMetadataURI(e.target.value); setImportedMetadata(null); }} placeholder="https://…/metadata.json or ipfs://…" /></label><button type="button" className="secondaryCta" disabled={!metadataURI.trim()} onClick={() => void loadMetadata()}>Load metadata</button></div>
              <p className="fieldHint">The JSON must include name, symbol and image. Public HTTPS hosts must allow CORS. No server proxy or wallet signature is used.</p>
              {importedMetadata ? <div className="metadataImportPreview"><strong translate="no">{importedMetadata.name} · {importedMetadata.symbol}</strong><p translate="no">{importedMetadata.description}</p><p translate="no">{importedMetadata.imageURI}</p><button type="button" className="secondaryCta" onClick={() => { applyMetadata(importedMetadata); setImportedMetadata(null); setMetadataMessage("Metadata fields imported. Check the description, image and every link before reviewing."); }}>Apply imported fields</button></div> : null}
              {metadataMessage ? <p role="status" className="fieldHint">{metadataMessage}</p> : null}
            </details>
          </section>

          <section className="formCard">
            <div className="formSectionTitle"><span>02</span><div><h2>Launch type</h2><p>Standard is the only mainnet candidate.</p></div></div>
            <div className="launchModeRow">
              <button type="button" className="selectedMode" aria-pressed="true"><strong>Standard</strong><span>Fixed supply · Pancake V3 · permanently locked LP position</span></button>
              <button type="button" disabled aria-disabled="true" title="Separate testnet research and audit required"><strong>Burn + Rewards</strong><span>Pair-asset holder claims via Infinity hook · v2 in research</span></button>
              <button type="button" disabled aria-disabled="true"><strong>Dev Launch</strong><span>Custom creator-fee model · not implemented or approved</span></button>
            </div>
          </section>

          <section className="formCard">
            <div className="formSectionTitle"><span>03</span><div><h2>Pair asset</h2><p>Browse every stock, fund, gold and pre-IPO token on BNB Chain. Only registry-approved assets can hold launch reserves.</p></div></div>
            <div className="poolScope"><strong>One pair · one graduation pool</strong><p className="fieldHint">Two-to-five-pool launches require a separate reviewed release. This form does not enable multi-pair research or change the frozen Standard candidate.</p></div>
            {assetError ? <div className="registryNotice statusError"><strong>ASSET READ FAILED</strong><span>{assetError}</span></div> : null}
            <PairPicker
              mode="select"
              selectable={assets.filter((asset) => asset.launchable).map((asset) => asset.address)}
              selected={selectedAsset}
              onSelect={(address) => { setSelectedAsset(address as Address); setReviewed(false); }}
            />
          </section>

          <section className="formCard">
            <div className="formSectionTitle"><span>04</span><div><h2>Optional first buy</h2><p>Zero means launch without a creator purchase.</p></div></div>
            <div className="fieldGrid"><label>Amount in {selected?.symbol || "pair asset"}<input value={creatorPurchase} inputMode="decimal" onChange={(event) => { setCreatorPurchase(event.target.value); setReviewed(false); }} placeholder="0" /></label></div>
            {buyPreview && selected ? (
              <div className="firstBuyPreview" aria-live="polite" translate="no">
                <strong>{zh ? "首购预览" : "First-buy preview"}</strong>
                <dl>
                  <div><dt>{zh ? "支付" : "You pay"}</dt><dd>{formatAmount(buyPreview.spent)} {selected.symbol}</dd></div>
                  <div><dt>{zh ? "发行护盾 99%" : "Launch Shield 99%"}</dt><dd>−{formatAmount(buyPreview.shield)} {selected.symbol}<small>{zh ? "用于加固流动性" : "to liquidity reinforcement"}</small></dd></div>
                  <div><dt>{zh ? "手续费 1%" : "Fees 1%"}</dt><dd>−{formatAmount(buyPreview.fee)} {selected.symbol}</dd></div>
                  <div><dt>{zh ? "进入曲线" : "Reaches the curve"}</dt><dd>{formatAmount(buyPreview.netQuote)} {selected.symbol} · {formatUsd(buyPreview.netUsd)}</dd></div>
                  <div className="firstBuyTotal"><dt>{zh ? "预计获得" : "You receive"}</dt><dd>≈ {formatAmount(buyPreview.tokens)} {symbol.trim() || (zh ? "代币" : "tokens")}<small>{(buyPreview.supplyShare * 100).toPrecision(2)}% {zh ? "的总供应量" : "of supply"}</small></dd></div>
                </dl>
                {buyPreview.reachesGraduation ? <p className="fieldHint">{zh ? `这笔购买本身就会达到毕业目标：曲线只成交到目标，退还 ${formatAmount(buyPreview.refund)} ${selected.symbol}。` : `This buy alone reaches the graduation target: the curve fills only to the target and refunds ${formatAmount(buyPreview.refund)} ${selected.symbol}.`}</p> : null}
                {buyPreview.exceedsWalletCap ? <p className="reviewWarning">{zh ? `超过前 15 秒每个钱包 2% 的上限，发行交易会被回滚。首购最多约 ${formatAmount(buyPreview.maxAmountUnderCap)} ${selected.symbol}。` : `Over the 2% early-wallet cap for the first 15 seconds: the launch transaction would revert. Keep the first buy under about ${formatAmount(buyPreview.maxAmountUnderCap)} ${selected.symbol}.`}</p> : null}
                <p className="fieldHint">{zh ? `护盾在 5 秒内衰减为零。以开盘价计算，同样金额届时约可买到 ${formatAmount(buyPreview.afterShieldTokens)} ${symbol.trim() || "枚代币"}，但其他买家可能先成交。` : `The shield decays to zero within 5 seconds. At the opening price the same amount would then buy about ${formatAmount(buyPreview.afterShieldTokens)} ${symbol.trim() || "tokens"}, though other buyers may get in first.`}</p>
              </div>
            ) : null}
            <p className="reviewWarning">The Launch Shield charges up to 99% on buys in the first five seconds, including a creator first buy. Fortune simulates the atomic transaction and sets a minimum token output before submitting it.</p>
          </section>

          <details className="advancedLaunch">
            <summary>Advanced · curve economics</summary>
            <p>These research defaults mirror the mainnet fork rehearsal. They remain subject to independent economic review and onchain preflight.</p>
            <div className="fieldGrid">
              <label>Total token supply<input value={totalSupply} inputMode="decimal" onChange={(event) => { setTotalSupply(event.target.value); setReviewed(false); }} /></label>
              <label>Opening price · USD<input value={basePrice} inputMode="decimal" onChange={(event) => { setBasePrice(event.target.value); setReviewed(false); }} /></label>
              <label>Slope · USD per token<input value={slope} inputMode="decimal" onChange={(event) => { setSlope(event.target.value); setReviewed(false); }} /></label>
              <label>Graduation target · USD<input value={graduationTarget} inputMode="decimal" onChange={(event) => { setGraduationTarget(event.target.value); setReviewed(false); }} /></label>
              <label>Community treasury · optional<input value={treasury} onChange={(event) => { setTreasury(event.target.value); setReviewed(false); }} placeholder="Defaults to creator wallet" /></label>
            </div>
            {economics ? (
              <dl className="curvePreview" translate="no">
                <div><dt>{zh ? "开盘市值" : "Opening market cap"}</dt><dd>{formatUsd(economics.openingMarketCap)}</dd></div>
                <div><dt>{zh ? "毕业市值" : "Market cap at graduation"}</dt><dd>{formatUsd(economics.graduationMarketCap)}</dd></div>
                <div><dt>{zh ? "毕业前售出" : "Sold on the curve"}</dt><dd>{(economics.soldShare * 100).toPrecision(2)}% {zh ? "的供应量" : "of supply"}</dd></div>
              </dl>
            ) : null}
          </details>

          <section className="formCard">
            <div className="formSectionTitle"><span>05</span><div><h2>Review and launch</h2><p>Confirm the immutable details before signing.</p></div></div>
            {!reviewed ? <button className="launchButton" disabled={!name.trim() || !symbol.trim() || !imageURI.trim() || !selected} onClick={reviewLaunch}>Review launch →</button> : <>
              <div className="reviewSummary">
                <div><span>Token</span><strong translate="no">{name.trim()} · {symbol.trim()}</strong></div>
                <div><span>Pair</span><strong>{selected?.symbol || "—"} · {selected ? short(selected.address) : "—"}</strong></div>
                <div><span>Supply / target</span><strong>{totalSupply} tokens · ${graduationTarget}</strong></div>
                <div><span>Creator first buy</span><strong>{creatorPurchase || "0"} {selected?.symbol || ""}</strong></div>
                <div><span>Fee route</span><strong>0.5% creator · 0.5% protocol</strong></div>
                <div><span>Liquidity / mode</span><strong>Pancake V3 · Standard · fixed metadata</strong></div>
                <div><span>Image URI</span><strong translate="no">{imageURI}</strong></div>
                <div><span>Description</span><strong translate="no">{description || "—"}</strong></div>
                {[["Website", website], ["X", xProfile], ["Telegram", telegram], ["GitHub", github], ["YouTube", youtube], ["DeBox", debox]].filter(([, url]) => url).map(([label, url]) => <div key={label}><span>{label}</span><strong translate="no">{url}</strong></div>)}
              </div>
              <p className="reviewWarning">An approved pair and wallet transaction are required. Fortune checks the current chain, release state and onchain preflight again before any submission.</p>
              <div className="reviewActions">
                <button className="launchButton" disabled={busy || Boolean(pending) || !storageLoaded || !selected || !FORTUNE_NETWORK_CONFIGURED} onClick={() => void launch()}>{busy ? "Checking launch…" : FORTUNE_NETWORK_CONFIGURED ? FORTUNE_NETWORK.isMainnet ? "Confirm in wallet →" : "Launch on BSC Testnet →" : "Launch paused"}</button>
                <button type="button" disabled={busy} className="secondaryCta" onClick={() => setReviewed(false)}>Edit details</button>
              </div>
              {!FORTUNE_NETWORK_CONFIGURED && FORTUNE_NETWORK.isMainnet ? <p className="fieldHint">The release manifest and live contract checks must pass before mainnet transactions unlock.</p> : null}
              {FORTUNE_NETWORK.isTestnet ? <p className="fieldHint">Need valueless fUSD or tBNB gas? <Link href="/testnet">Open the testnet lab and faucet →</Link></p> : null}
            </>}
          </section>

          </fieldset>
          <section className="panel launchStatus" aria-live="polite">
            <span className="eyebrow">STATUS</span>
            <p className="launchDescription">
              {message || "No transaction submitted yet."}
            </p>

            {pending ? <div className="heroActions"><a className="secondaryCta" href={`${FORTUNE_NETWORK.explorerUrl}/tx/${pending.hash}`} target="_blank" rel="noreferrer">Submitted transaction ↗</a><button className="primaryCta" disabled={busy} onClick={() => void recoverLaunch()}>Check submitted launch</button></div> : null}
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
