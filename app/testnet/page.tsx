"use client";

import { useEffect, useMemo, useState } from "react";
import {
  createPublicClient,
  createWalletClient,
  custom,
  decodeEventLog,
  defineChain,
  encodeAbiParameters,
  formatUnits,
  isAddress,
  parseUnits,
  type Address,
  type EIP1193Provider,
  type Hex,
} from "viem";
import { PUBLIC_TESTNET } from "@/lib/public-testnet";
import FortuneLogo from "@/components/FortuneLogo";

type LaunchMode = "standard" | "tax";

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

const taxParams = [
  { name: "name", type: "string" },
  { name: "symbol", type: "string" },
  { name: "totalSupply", type: "uint256" },
  { name: "quoteAsset", type: "address" },
  { name: "basePriceUsd1e18", type: "uint256" },
  { name: "slopeUsd1e18", type: "uint256" },
  { name: "graduationUsd1e18", type: "uint256" },
  { name: "feeBps", type: "uint16[6]" },
  { name: "treasury", type: "address" },
  { name: "buyTaxBps", type: "uint16" },
  { name: "sellTaxBps", type: "uint16" },
  { name: "antiFarmerDuration", type: "uint32" },
  { name: "minimumDividendBalance", type: "uint256" },
  { name: "taxAllocationBps", type: "uint16[7]" },
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
    outputs: [],
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

const taxFactoryAbi = [
  {
    type: "function",
    name: "preflightLaunch",
    stateMutability: "view",
    inputs: [{ name: "p", type: "tuple", components: taxParams }],
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
      { name: "p", type: "tuple", components: taxParams },
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
      { name: "p", type: "tuple", components: taxParams },
      { name: "vanitySalt", type: "bytes32" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "createLaunchPreparedAndBuy",
    stateMutability: "nonpayable",
    inputs: [
      { name: "p", type: "tuple", components: taxParams },
      { name: "vanitySalt", type: "bytes32" },
      { name: "amountIn", type: "uint256" },
      { name: "minTokensOut", type: "uint256" },
    ],
    outputs: [],
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
    name: "TaxLaunchCreated",
    inputs: [
      { name: "launchId", type: "uint256", indexed: true },
      { name: "creator", type: "address", indexed: true },
      { name: "token", type: "address", indexed: true },
      { name: "curve", type: "address", indexed: false },
      { name: "quoteAsset", type: "address", indexed: false },
      { name: "taxProcessor", type: "address", indexed: false },
      { name: "dividendVault", type: "address", indexed: false },
      { name: "manifestHash", type: "bytes32", indexed: false },
    ],
  },
] as const;

const quoteAbi = [
  {
    type: "function",
    name: "faucet",
    stateMutability: "nonpayable",
    inputs: [{ name: "amount", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

const curveAbi = [
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
    name: "graduationReady",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "graduated",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "phase",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
  },
] as const;

const bscTestnet = defineChain({
  id: PUBLIC_TESTNET.chainId,
  name: PUBLIC_TESTNET.chainName,
  nativeCurrency: {
    name: "Test BNB",
    symbol: PUBLIC_TESTNET.nativeSymbol,
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: [PUBLIC_TESTNET.rpcUrl, PUBLIC_TESTNET.fallbackRpcUrl],
    },
  },
  blockExplorers: {
    default: {
      name: "BscScan Testnet",
      url: PUBLIC_TESTNET.explorerUrl,
    },
  },
  testnet: true,
});

type TestLaunch = {
  mode: LaunchMode;
  token: Address;
  curve: Address;
  transactionHash: Hex;
  taxProcessor?: Address;
  dividendVault?: Address;
  createdAt?: string;
};

type ServiceHealthState =
  | "checking"
  | "ready"
  | "degraded"
  | "unavailable";

type TrackedTransaction = {
  hash: Hex;
  label: string;
  state: "pending" | "confirmed" | "reverted" | "unknown";
  updatedAt: string;
};

const LAST_LAUNCH_KEY = "fortune:bsc-testnet:last-launch:v1";
const LAUNCH_HISTORY_KEY = "fortune:bsc-testnet:launch-history:v1";
const MAX_SAVED_LAUNCHES = 10;

function isSavedLaunch(value: unknown): value is TestLaunch {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<TestLaunch>;
  if (candidate.mode !== "standard" && candidate.mode !== "tax") return false;
  if (
    typeof candidate.token !== "string" ||
    typeof candidate.curve !== "string" ||
    !isAddress(candidate.token) ||
    !isAddress(candidate.curve)
  ) {
    return false;
  }
  if (
    typeof candidate.transactionHash !== "string" ||
    !/^0x[0-9a-fA-F]{64}$/.test(candidate.transactionHash)
  ) {
    return false;
  }
  if (
    candidate.taxProcessor !== undefined &&
    !isAddress(candidate.taxProcessor)
  ) {
    return false;
  }
  if (
    candidate.dividendVault !== undefined &&
    !isAddress(candidate.dividendVault)
  ) {
    return false;
  }
  return true;
}

const allocationLabels = [
  "Creator",
  "Direct burn",
  "Holder dividends",
  "Buyback + burn",
  "Liquidity",
  "Community treasury",
  "Protocol",
] as const;

function shorten(value: string) {
  return value.slice(0, 8) + "…" + value.slice(-6);
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

function parseTokenAmount(label: string, value: string) {
  const clean = value.trim() || "0";
  if (!/^\d+(?:\.\d{1,18})?$/.test(clean)) {
    throw new Error(`${label} must be a non-negative number with at most 18 decimals.`);
  }
  return parseUnits(clean, 18);
}

function publicMetadataUrl(
  label: string,
  value: string,
  options?: { allowIpfs?: boolean }
) {
  const clean = value.trim();
  if (!clean) return "";
  if (clean.length > 512) {
    throw new Error(`${label} must be 512 characters or fewer.`);
  }
  if (options?.allowIpfs && clean.toLowerCase().startsWith("ipfs://")) {
    return clean;
  }

  let parsed: URL;
  try {
    parsed = new URL(clean);
  } catch {
    throw new Error(`${label} must be a valid http(s) URL${options?.allowIpfs ? " or ipfs:// URI" : ""}.`);
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error(`${label} must use http:// or https://${options?.allowIpfs ? " (image metadata may also use ipfs://)" : ""}.`);
  }
  return clean;
}

function provider() {
  const injected = (
    window as Window & { ethereum?: EIP1193Provider }
  ).ethereum;
  if (!injected) {
    throw new Error(
      "No injected EVM wallet found. Install MetaMask or another BSC-compatible wallet."
    );
  }
  return injected;
}

async function connectTestnet() {
  const injected = provider();
  const accounts = (await injected.request({
    method: "eth_requestAccounts",
  })) as Address[];

  if (!accounts?.[0]) {
    throw new Error("Wallet did not return an account.");
  }

  try {
    await injected.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: PUBLIC_TESTNET.chainHex }],
    });
  } catch (error) {
    const code =
      typeof error === "object" &&
      error &&
      "code" in error
        ? Number((error as { code?: number }).code)
        : 0;

    if (code !== 4902) throw error;

    await injected.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: PUBLIC_TESTNET.chainHex,
          chainName: PUBLIC_TESTNET.chainName,
          nativeCurrency: {
            name: "Test BNB",
            symbol: PUBLIC_TESTNET.nativeSymbol,
            decimals: 18,
          },
          rpcUrls: [PUBLIC_TESTNET.rpcUrl],
          blockExplorerUrls: [PUBLIC_TESTNET.explorerUrl],
        },
      ],
    });
  }

  return accounts[0];
}

function clients(account: Address) {
  const transport = custom(provider());
  return {
    publicClient: createPublicClient({ chain: bscTestnet, transport }),
    walletClient: createWalletClient({
      account,
      chain: bscTestnet,
      transport,
    }),
  };
}

async function readQuoteBalance(account: Address) {
  const { publicClient } = clients(account);
  return publicClient.readContract({
    address: PUBLIC_TESTNET.contracts.mockQuote as Address,
    abi: quoteAbi,
    functionName: "balanceOf",
    args: [account],
  });
}

export default function PublicTestnetPage() {
  const taxReady = Boolean(
    PUBLIC_TESTNET.contracts.taxFactory &&
      PUBLIC_TESTNET.contracts.taxGraduationAdapter &&
      PUBLIC_TESTNET.contracts.taxLiquidityLocker &&
      PUBLIC_TESTNET.contracts.poolRegistry
  );

  const [mode, setMode] = useState<LaunchMode>("standard");
  const [account, setAccount] = useState<Address | null>(null);
  const [name, setName] = useState("Fortune Alpha Token");
  const [symbol, setSymbol] = useState("FALPHA");
  const [description, setDescription] = useState(
    "Created on the Fortune BSC public alpha."
  );
  const [imageURI, setImageURI] = useState("");
  const [website, setWebsite] = useState("");
  const [xProfile, setXProfile] = useState("");
  const [telegram, setTelegram] = useState("");
  const [github, setGithub] = useState("");
  const [youtube, setYoutube] = useState("");
  const [debox, setDebox] = useState("");
  const [creatorPurchase, setCreatorPurchase] = useState("0");
  const [buyTax, setBuyTax] = useState("1");
  const [sellTax, setSellTax] = useState("1");
  const [antiFarmerDays, setAntiFarmerDays] = useState("30");
  const [minimumDividendBalance, setMinimumDividendBalance] =
    useState("0");
  const [taxAllocation, setTaxAllocation] = useState([
    20, 10, 20, 20, 15, 5, 10,
  ]);
  const [treasury, setTreasury] = useState("");
  const [launch, setLaunch] = useState<TestLaunch | null>(null);
  const [launchHistory, setLaunchHistory] = useState<TestLaunch[]>([]);
  const [serviceHealth, setServiceHealth] =
    useState<ServiceHealthState>("checking");
  const [lastTransaction, setLastTransaction] =
    useState<TrackedTransaction | null>(null);
  const [quoteBalance, setQuoteBalance] = useState("0");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState(
    "Connect a testnet wallet to begin."
  );

  const allocationTotal = useMemo(
    () => taxAllocation.reduce((sum, value) => sum + value, 0),
    [taxAllocation]
  );

  useEffect(() => {
    try {
      const rawLast = window.localStorage.getItem(LAST_LAUNCH_KEY);
      const rawHistory = window.localStorage.getItem(LAUNCH_HISTORY_KEY);
      const last = rawLast ? (JSON.parse(rawLast) as unknown) : null;
      const parsedHistory = rawHistory
        ? (JSON.parse(rawHistory) as unknown)
        : [];
      const history = Array.isArray(parsedHistory)
        ? parsedHistory.filter(isSavedLaunch).slice(0, MAX_SAVED_LAUNCHES)
        : [];

      if (isSavedLaunch(last)) {
        setLaunch(last);
        setMode(last.mode);
        setLaunchHistory(
          history.some(
            (item) =>
              item.token.toLowerCase() === last.token.toLowerCase()
          )
            ? history
            : [last, ...history].slice(0, MAX_SAVED_LAUNCHES)
        );
        setMessage(
          "Recovered your last Fortune testnet launch from this browser. You can continue its lifecycle below."
        );
      } else if (history.length > 0) {
        setLaunchHistory(history);
        setLaunch(history[0]);
        setMode(history[0].mode);
        setMessage(
          "Recovered your latest saved Fortune testnet launch. You can continue its lifecycle below."
        );
      }
    } catch {
      // Browser storage is a convenience only; chain state remains authoritative.
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function probeService() {
      try {
        const response = await fetch("/api/ready", {
          cache: "no-store",
        });
        const body = (await response.json()) as {
          ready?: boolean;
          degraded?: boolean;
        };

        if (cancelled) return;
        setServiceHealth(
          body.ready
            ? body.degraded
              ? "degraded"
              : "ready"
            : "unavailable"
        );
      } catch {
        if (!cancelled) setServiceHealth("unavailable");
      }
    }

    void probeService();
    const interval = window.setInterval(
      () => void probeService(),
      30_000
    );

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    const injected = (
      window as Window & {
        ethereum?: EIP1193Provider & {
          on?: (
            event: string,
            listener: (...args: unknown[]) => void
          ) => void;
          removeListener?: (
            event: string,
            listener: (...args: unknown[]) => void
          ) => void;
        };
      }
    ).ethereum;

    if (!injected) return;

    const sync = async () => {
      const accounts = (await injected.request({
        method: "eth_accounts",
      })) as Address[];
      const chain = (await injected.request({
        method: "eth_chainId",
      })) as string;
      const next = accounts?.[0] || null;
      setAccount(next);

      if (!next || chain !== PUBLIC_TESTNET.chainHex) {
        setQuoteBalance("0");
        return;
      }

      try {
        const balance = await readQuoteBalance(next);
        setQuoteBalance(
          Number(formatUnits(balance, 18)).toLocaleString(
            undefined,
            { maximumFractionDigits: 2 }
          )
        );
      } catch {
        setQuoteBalance("0");
      }
    };

    const changed = () => void sync();
    void sync();
    injected.on?.("accountsChanged", changed);
    injected.on?.("chainChanged", changed);

    return () => {
      injected.removeListener?.("accountsChanged", changed);
      injected.removeListener?.("chainChanged", changed);
    };
  }, []);

  async function withAccount() {
    // Always re-check the active chain before an onchain action. The cached
    // account can remain populated after the wallet is switched away from BSC
    // Testnet, and using it directly would surface a confusing chain mismatch.
    const next = await connectTestnet();
    setAccount(next);
    return next;
  }

  async function waitTracked(
    publicClient: ReturnType<typeof clients>["publicClient"],
    hash: Hex,
    label: string
  ) {
    setLastTransaction({
      hash,
      label,
      state: "pending",
      updatedAt: new Date().toISOString(),
    });

    try {
      const receipt = await publicClient.waitForTransactionReceipt({
        hash,
      });
      if (receipt.status !== "success") {
        setLastTransaction({
          hash,
          label,
          state: "reverted",
          updatedAt: new Date().toISOString(),
        });
        throw new Error(
          label +
            " reverted onchain. Review the transaction on BscScan before retrying."
        );
      }

      setLastTransaction({
        hash,
        label,
        state: "confirmed",
        updatedAt: new Date().toISOString(),
      });
      return receipt;
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes("reverted onchain")
      ) {
        throw error;
      }

      setLastTransaction({
        hash,
        label,
        state: "unknown",
        updatedAt: new Date().toISOString(),
      });
      throw new Error(
        label +
          " was submitted, but Fortune could not verify its final receipt. Check BscScan for " +
          hash +
          " before retrying. " +
          (error instanceof Error ? error.message : "")
      );
    }
  }

  async function copyDiagnostics() {
    const packet = {
      product: "Fortune public BSC testnet alpha",
      generatedAt: new Date().toISOString(),
      chainId: PUBLIC_TESTNET.chainId,
      serviceHealth,
      connectedAccount: account,
      quoteBalance,
      message,
      lastTransaction,
      activeLaunch: launch,
      savedLaunchCount: launchHistory.length,
      page:
        window.location.origin + window.location.pathname,
      contracts: {
        factory: PUBLIC_TESTNET.contracts.factory,
        taxFactory: PUBLIC_TESTNET.contracts.taxFactory,
        registry: PUBLIC_TESTNET.contracts.registry,
        poolRegistry: PUBLIC_TESTNET.contracts.poolRegistry,
        graduationAdapter:
          PUBLIC_TESTNET.contracts.graduationAdapter,
        liquidityLocker:
          PUBLIC_TESTNET.contracts.liquidityLocker,
        taxGraduationAdapter:
          PUBLIC_TESTNET.contracts.taxGraduationAdapter,
        taxLiquidityLocker:
          PUBLIC_TESTNET.contracts.taxLiquidityLocker,
        mockQuote: PUBLIC_TESTNET.contracts.mockQuote,
      },
    };

    try {
      await navigator.clipboard.writeText(
        JSON.stringify(packet, null, 2)
      );
      setMessage(
        "Diagnostics copied. Paste them into the public testnet bug report; they contain public addresses and transaction data, never private keys or seed phrases."
      );
    } catch {
      setMessage(
        "Browser clipboard access was blocked. Open the launch transaction on BscScan and include its hash in your bug report."
      );
    }
  }

  function recoverLaunch(saved: TestLaunch) {
    setLaunch(saved);
    setMode(saved.mode);
    setMessage(
      "Recovered saved " +
        saved.mode +
        " launch " +
        shorten(saved.token) +
        "."
    );
  }

  async function refreshQuoteBalance(nextAccount?: Address) {
    const active = nextAccount || account;
    if (!active) return;
    const balance = await readQuoteBalance(active);
    setQuoteBalance(
      Number(formatUnits(balance, 18)).toLocaleString(
        undefined,
        { maximumFractionDigits: 2 }
      )
    );
  }

  async function connect() {
    setBusy("connect");
    try {
      const next = await connectTestnet();
      setAccount(next);
      await refreshQuoteBalance(next);
      setMessage(
        "Wallet connected to BSC Testnet. Get tBNB for gas, then use the free fUSD faucet."
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Wallet connection failed."
      );
    } finally {
      setBusy("");
    }
  }

  async function faucet() {
    setBusy("faucet");
    try {
      const active = await withAccount();
      const { publicClient, walletClient } = clients(active);
      const hash = await walletClient.writeContract({
        address: PUBLIC_TESTNET.contracts.mockQuote as Address,
        abi: quoteAbi,
        functionName: "faucet",
        args: [parseUnits("1000", 18)],
      });
      await waitTracked(publicClient, hash, "fUSD faucet");
      try {
        await refreshQuoteBalance(active);
        setMessage("1,000 fUSD test tokens minted to your wallet.");
      } catch {
        setMessage(
          "1,000 fUSD mint transaction confirmed. Balance refresh is temporarily unavailable; do not retry the mint just because the displayed balance is stale."
        );
      }
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "fUSD faucet transaction failed."
      );
    } finally {
      setBusy("");
    }
  }

  function metadata() {
    return {
      description: description.trim().slice(0, 4096),
      imageURI: publicMetadataUrl("Image", imageURI, { allowIpfs: true }),
      website: publicMetadataUrl("Website", website),
      xProfile: publicMetadataUrl("X / Twitter", xProfile),
      telegram: publicMetadataUrl("Telegram", telegram),
      github: publicMetadataUrl("GitHub", github),
      youtube: publicMetadataUrl("YouTube", youtube),
      debox: publicMetadataUrl("DeBox", debox),
    };
  }

  function rememberLaunch(next: TestLaunch) {
    const saved: TestLaunch = {
      ...next,
      createdAt: next.createdAt || new Date().toISOString(),
    };

    setLaunch(saved);
    setLaunchHistory((current) => {
      const history = [
        saved,
        ...current.filter(
          (item) =>
            item.token.toLowerCase() !== saved.token.toLowerCase()
        ),
      ].slice(0, MAX_SAVED_LAUNCHES);

      try {
        window.localStorage.setItem(
          LAUNCH_HISTORY_KEY,
          JSON.stringify(history)
        );
      } catch {
        // Browser storage is a convenience only.
      }

      return history;
    });

    try {
      window.localStorage.setItem(
        LAST_LAUNCH_KEY,
        JSON.stringify(saved)
      );
    } catch {
      // Browser storage is a convenience only; chain state remains authoritative.
    }
  }

  async function createLaunch() {
    setBusy("launch");

    try {
      const active = await withAccount();
      const cleanName = name.trim();
      const cleanSymbol = symbol.trim().toUpperCase();

      if (!cleanName || cleanName.length > 64) {
        throw new Error("Token name must be 1–64 characters.");
      }
      if (!cleanSymbol || cleanSymbol.length > 16) {
        throw new Error("Ticker must be 1–16 characters.");
      }
      if (mode === "tax" && !taxReady) {
        throw new Error(
          "The public tax-token stack has not been deployed yet."
        );
      }

      const initial = parseTokenAmount(
        "Initial creator purchase",
        creatorPurchase
      );
      const treasuryInput = treasury.trim();
      if (treasuryInput && !isAddress(treasuryInput)) {
        throw new Error(
          "Community treasury recipient must be a valid EVM address."
        );
      }
      const destination = treasuryInput
        ? (treasuryInput as Address)
        : active;
      const { publicClient, walletClient } = clients(active);
      let hash: Hex;

      if (mode === "standard") {
        const params = {
          name: cleanName,
          symbol: cleanSymbol,
          totalSupply: 1_000_000_000n * 10n ** 18n,
          quoteAssets: [PUBLIC_TESTNET.contracts.mockQuote as Address],
          weightsBps: [10_000],
          primaryQuote: PUBLIC_TESTNET.contracts.mockQuote as Address,
          basePriceUsd1e18: 10n ** 15n,
          slopeUsd1e18: 10n ** 6n,
          graduationUsd1e18: 10n ** 18n,
          adaptiveGraduation: true,
          feeBps: [25, 25, 25, 15, 0, 10] as const,
          treasury: destination,
          metadataEditable: true,
          ...metadata(),
        };

        setMessage("Running onchain launch preflight…");
        const [ready, reasonCode] = await publicClient.readContract({
          address: PUBLIC_TESTNET.contracts.factory as Address,
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

        setMessage("Finding your deterministic 0xfe token address…");
        const [salt] = await publicClient.readContract({
          address: PUBLIC_TESTNET.contracts.factory as Address,
          abi: standardFactoryAbi,
          functionName: "previewPreparedVanity",
          args: [active, params],
        });

        if (initial > 0n) {
          setMessage(
            "Approve the creator purchase. The next transaction creates the token and executes your first buy atomically."
          );
          const approval = await walletClient.writeContract({
            address: PUBLIC_TESTNET.contracts.mockQuote as Address,
            abi: quoteAbi,
            functionName: "approve",
            args: [PUBLIC_TESTNET.contracts.factory as Address, initial],
          });
          await waitTracked(publicClient, approval, "fUSD approval");

          hash = await walletClient.writeContract({
            address: PUBLIC_TESTNET.contracts.factory as Address,
            abi: standardFactoryAbi,
            functionName: "createLaunchPreparedAndBuy",
            args: [params, salt, initial, 1n],
          });
        } else {
          setMessage("Confirm the Fortune launch transaction.");
          hash = await walletClient.writeContract({
            address: PUBLIC_TESTNET.contracts.factory as Address,
            abi: standardFactoryAbi,
            functionName: "createLaunchPrepared",
            args: [params, salt],
          });
        }
      } else {
        const buyTaxBps = Math.round(Number(buyTax) * 100);
        const sellTaxBps = Math.round(Number(sellTax) * 100);
        const days = Math.round(Number(antiFarmerDays));
        const allocationBps = taxAllocation.map((value) =>
          Math.round(value * 100)
        ) as [number, number, number, number, number, number, number];

        if (
          !Number.isFinite(buyTaxBps) ||
          !Number.isFinite(sellTaxBps) ||
          buyTaxBps < 0 ||
          sellTaxBps < 0 ||
          buyTaxBps > 1000 ||
          sellTaxBps > 1000 ||
          buyTaxBps + sellTaxBps === 0
        ) {
          throw new Error(
            "Tax mode requires a buy or sell tax between 0% and 10%."
          );
        }
        if (!Number.isInteger(days) || days < 0 || days > 365) {
          throw new Error("Anti-farmer duration must be 0–365 days.");
        }
        if (allocationTotal !== 100) {
          throw new Error("Tax allocation must total exactly 100%.");
        }

        const params = {
          name: cleanName,
          symbol: cleanSymbol,
          totalSupply: 1_000_000_000n * 10n ** 18n,
          quoteAsset: PUBLIC_TESTNET.contracts.mockQuote as Address,
          basePriceUsd1e18: 10n ** 15n,
          slopeUsd1e18: 10n ** 6n,
          graduationUsd1e18: 10n ** 18n,
          feeBps: [25, 25, 25, 15, 0, 10] as const,
          treasury: destination,
          buyTaxBps,
          sellTaxBps,
          antiFarmerDuration: days * 24 * 60 * 60,
          minimumDividendBalance: parseTokenAmount(
            "Minimum dividend balance",
            minimumDividendBalance
          ),
          taxAllocationBps: allocationBps,
          ...metadata(),
        };

        const taxFactory = PUBLIC_TESTNET.contracts.taxFactory as Address;

        setMessage("Running tax-token launch preflight…");
        const [ready, reasonCode] = await publicClient.readContract({
          address: taxFactory,
          abi: taxFactoryAbi,
          functionName: "preflightLaunch",
          args: [params],
        });
        if (!ready) {
          throw new Error(
            "Tax launch preflight failed: " +
              (decodeReason(reasonCode) || reasonCode)
          );
        }

        setMessage("Finding your deterministic 0xfe tax-token address…");
        const [salt] = await publicClient.readContract({
          address: taxFactory,
          abi: taxFactoryAbi,
          functionName: "previewPreparedVanity",
          args: [active, params],
        });

        setMessage(
          initial > 0n
            ? "Confirm the tax-token launch. Your creator purchase follows as a separate BSC transaction."
            : "Confirm the Fortune tax-token launch."
        );

        hash = await walletClient.writeContract({
          address: taxFactory,
          abi: taxFactoryAbi,
          functionName: "createLaunchPrepared",
          args: [params, salt],
        });
      }

      const receipt = await waitTracked(publicClient, hash, "Launch creation");
      let created: TestLaunch | null = null;

      for (const log of receipt.logs) {
        try {
          if (mode === "standard") {
            if (
              log.address.toLowerCase() !==
              PUBLIC_TESTNET.contracts.factory.toLowerCase()
            ) {
              continue;
            }

            const decoded = decodeEventLog({
              abi: standardFactoryAbi,
              eventName: "LaunchCreated",
              data: log.data,
              topics: log.topics,
            });

            created = {
              mode,
              token: decoded.args.token,
              curve: decoded.args.curve,
              transactionHash: hash,
            };
          } else {
            if (
              log.address.toLowerCase() !==
              PUBLIC_TESTNET.contracts.taxFactory.toLowerCase()
            ) {
              continue;
            }

            const decoded = decodeEventLog({
              abi: taxFactoryAbi,
              eventName: "TaxLaunchCreated",
              data: log.data,
              topics: log.topics,
            });

            created = {
              mode,
              token: decoded.args.token,
              curve: decoded.args.curve,
              taxProcessor: decoded.args.taxProcessor,
              dividendVault: decoded.args.dividendVault,
              transactionHash: hash,
            };
          }
          break;
        } catch {
          // Ignore unrelated logs.
        }
      }

      if (!created) {
        throw new Error(
          "Launch confirmed, but Fortune could not decode its creation event."
        );
      }

      // The launch transaction is already final at this point. Persist it before
      // any optional follow-up transaction so a rejected/failed creator buy
      // cannot make a successfully created tax token look lost.
      rememberLaunch(created);

      if (mode === "tax" && initial > 0n) {
        try {
          setMessage(
            "Tax launch confirmed. Approve fUSD for the curve, then confirm your creator first purchase."
          );

          const approval = await walletClient.writeContract({
            address: PUBLIC_TESTNET.contracts.mockQuote as Address,
            abi: quoteAbi,
            functionName: "approve",
            args: [created.curve, initial],
          });
          await waitTracked(publicClient, approval, "fUSD approval");

          const buyHash = await walletClient.writeContract({
            address: created.curve,
            abi: curveAbi,
            functionName: "buy",
            args: [
              PUBLIC_TESTNET.contracts.mockQuote as Address,
              initial,
              1n,
            ],
          });
          await waitTracked(publicClient, buyHash, "Curve buy");
        } catch (error) {
          try {
            await refreshQuoteBalance(active);
          } catch {
            // The confirmed launch is still authoritative if the balance RPC is unavailable.
          }
          setMessage(
            "Tax token launch succeeded, but the optional creator first-buy did not complete. " +
              (error instanceof Error ? error.message : "The follow-up transaction failed.") +
              " Your launch is preserved below and can continue normally."
          );
          return;
        }
      }

      try {
        await refreshQuoteBalance(active);
      } catch {
        // Do not turn a confirmed launch into a false failure because a read RPC hiccupped.
      }
      setMessage(
        initial > 0n
          ? mode === "tax"
            ? "Tax launch + creator first-buy confirmed in two BSC-safe transactions. Continue to graduation when the curve is ready."
            : "Launch + creator first-buy confirmed atomically. Continue to graduation when the curve is ready."
          : "Launch created. Buy fUSD on the curve to move it toward graduation."
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Launch creation failed."
      );
    } finally {
      setBusy("");
    }
  }

  async function buyToGraduation() {
    if (!launch) return;

    setBusy("buy");
    try {
      const active = await withAccount();
      const { publicClient, walletClient } = clients(active);
      const amount = parseUnits("250", 18);
      const balance = await publicClient.readContract({
        address: PUBLIC_TESTNET.contracts.mockQuote as Address,
        abi: quoteAbi,
        functionName: "balanceOf",
        args: [active],
      });

      if (balance < amount) {
        throw new Error(
          "You need at least 250 fUSD. Use the free faucet first."
        );
      }

      const approval = await walletClient.writeContract({
        address: PUBLIC_TESTNET.contracts.mockQuote as Address,
        abi: quoteAbi,
        functionName: "approve",
        args: [launch.curve, amount],
      });
      await waitTracked(publicClient, approval, "fUSD approval");

      const buyHash = await walletClient.writeContract({
        address: launch.curve,
        abi: curveAbi,
        functionName: "buy",
        args: [PUBLIC_TESTNET.contracts.mockQuote as Address, amount, 1n],
      });
      await waitTracked(publicClient, buyHash, "Curve buy");

      let ready: boolean | null = null;
      try {
        ready = await publicClient.readContract({
          address: launch.curve,
          abi: curveAbi,
          functionName: "graduationReady",
        });
      } catch {
        // The buy receipt is authoritative; readiness can be checked again later.
      }

      try {
        await refreshQuoteBalance(active);
      } catch {
        // A stale balance must not make a confirmed buy look failed.
      }

      setMessage(
        ready === true
          ? "Buy confirmed. Curve reached GraduationReady."
          : ready === false
            ? "Buy confirmed. This curve has not reached GraduationReady yet."
            : "Buy transaction confirmed, but Fortune could not refresh graduation state from RPC. Do not retry the buy just because this read failed; refresh or try Finalize once RPC is available."
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Curve buy failed."
      );
    } finally {
      setBusy("");
    }
  }

  async function finalize() {
    if (!launch) return;

    setBusy("finalize");
    try {
      const active = await withAccount();
      const { publicClient, walletClient } = clients(active);
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 1200);

      const plan =
        launch.mode === "tax"
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
                    { name: "maxSqrtPriceDeviationBps", type: "uint16" },
                    { name: "maxDustBps", type: "uint16" },
                    { name: "deadline", type: "uint64" },
                  ],
                },
              ],
              [
                {
                  fees: [500],
                  maxSqrtPriceDeviationBps: 100,
                  maxDustBps: 100,
                  deadline,
                },
              ]
            );

      const address =
        launch.mode === "tax"
          ? (PUBLIC_TESTNET.contracts.taxFactory as Address)
          : (PUBLIC_TESTNET.contracts.factory as Address);
      const abi =
        launch.mode === "tax" ? taxFactoryAbi : standardFactoryAbi;

      const simulation = await publicClient.simulateContract({
        account: active,
        address,
        abi,
        functionName: "finalizeGraduation",
        args: [launch.curve, plan],
      });

      if (!simulation.result) {
        throw new Error(
          "Graduation preflight is not ready. The launch remains retryable."
        );
      }

      const hash = await walletClient.writeContract(simulation.request);
      await waitTracked(publicClient, hash, "Graduation");

      let graduated: boolean;
      let phase: number;
      try {
        [graduated, phase] = await Promise.all([
          publicClient.readContract({
            address: launch.curve,
            abi: curveAbi,
            functionName: "graduated",
          }),
          publicClient.readContract({
            address: launch.curve,
            abi: curveAbi,
            functionName: "phase",
          }),
        ]);
      } catch {
        setMessage(
          "Graduation transaction confirmed, but Fortune could not refresh the final curve state from RPC. Do not resubmit the graduation transaction based on this read error; verify the confirmed transaction on BscScan and refresh."
        );
        return;
      }

      if (!graduated || phase !== 2) {
        throw new Error(
          "Transaction confirmed but the curve did not reach PoolCreated."
        );
      }

      setMessage(
        launch.mode === "tax"
          ? "Graduation complete: Pancake V2 liquidity is live, LP tokens are permanently locked, and immutable tax/anti-farmer rules are active."
          : "Graduation complete: Pancake V3 liquidity is live and the LP-position NFT is permanently locked."
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Graduation failed."
      );
    } finally {
      setBusy("");
    }
  }

  const explorer = PUBLIC_TESTNET.explorerUrl;

  return (
    <main className="page narrowPage">
      <section className="pageHeading">
        <div>
          <div className="testnetBrandLockup">
            <FortuneLogo size="md" />
          </div>
          <span className="eyebrow">PUBLIC BSC TESTNET ALPHA</span>
          <h1>Build the launch you actually want.</h1>
          <p>
            Standard tokens graduate into permanently locked Pancake V3
            liquidity. Tax tokens add immutable buy/sell tax, holder rewards,
            buyback/burn routing and bounded anti-farmer protection before
            graduating into permanently locked Pancake V2 liquidity.
          </p>
        </div>
        <div className="pageHeadingActions">
          <a
            className="secondaryCta"
            href="https://github.com/shawkkkkk/fortune/issues/new?template=testnet-bug.yml"
            target="_blank"
            rel="noreferrer"
          >
            Report a bug ↗
          </a>
          <a
            className="secondaryCta"
            href={PUBLIC_TESTNET.faucetUrl}
            target="_blank"
            rel="noreferrer"
          >
            Get tBNB gas ↗
          </a>
        </div>
      </section>

      <section className="registryNotice">
        <strong>TESTNET ONLY</strong>
        <span>
          Chain 97 · fUSD is valueless · use a test-only wallet. Every setting
          below is exercised through real testnet contracts.
        </span>
      </section>

      <section
        className={
          serviceHealth === "unavailable"
            ? "registryNotice statusError"
            : "registryNotice"
        }
        style={{ marginTop: 14 }}
      >
        <strong>
          SERVICE ·{" "}
          {serviceHealth === "ready"
            ? "READY"
            : serviceHealth === "degraded"
              ? "DEGRADED"
              : serviceHealth === "checking"
                ? "CHECKING"
                : "UNAVAILABLE"}
        </strong>
        <span>
          {serviceHealth === "ready"
            ? "All published Fortune testnet contracts and at least one RPC are responding."
            : serviceHealth === "degraded"
              ? "The Fortune stack is healthy, but one or more RPC providers are degraded. Confirm transactions on BscScan before retrying."
              : serviceHealth === "checking"
                ? "Checking the public alpha stack and RPC connectivity."
                : "Fortune cannot currently verify the full public alpha stack. Avoid resubmitting a transaction solely because the website cannot refresh."}
        </span>
      </section>

      <section className="formCard">
        <div className="formSectionTitle">
          <span>01</span>
          <div>
            <h2>Launch type</h2>
            <p>Choose the token architecture before entering economics.</p>
          </div>
        </div>
        <div className="modeRow launchModeRow">
          <button
            className={mode === "standard" ? "selectedMode" : ""}
            onClick={() => {
              setMode("standard");
            }}
          >
            <strong>Standard</strong>
            <span>0% transfer tax · Pancake V3</span>
          </button>
          <button
            className={mode === "tax" ? "selectedMode" : ""}
            disabled={!taxReady}
            onClick={() => {
              setMode("tax");
            }}
          >
            <strong>Tax Token</strong>
            <span>
              {taxReady
                ? "Immutable tax · dividends · anti-farmer · Pancake V2"
                : "Tax stack awaits one-time public deployment"}
            </span>
          </button>
        </div>
      </section>

      <section className="twoColumn" style={{ marginTop: 14 }}>
        <div className="formCard">
          <div className="formSectionTitle">
            <span>02</span>
            <div>
              <h2>Wallet + test funds</h2>
              <p>tBNB pays gas. fUSD is the valueless launch quote.</p>
            </div>
          </div>

          <div className="previewFacts">
            <div><span>Network</span><strong>BSC Testnet · 97</strong></div>
            <div>
              <span>Wallet</span>
              <strong>{account ? shorten(account) : "Not connected"}</strong>
            </div>
            <div><span>fUSD balance</span><strong>{quoteBalance}</strong></div>
          </div>

          <div className="heroActions">
            <button
              className="secondaryCta"
              onClick={() => void connect()}
              disabled={Boolean(busy)}
            >
              {busy === "connect" ? "Connecting…" : "Connect / switch testnet"}
            </button>
            <button
              className="primaryCta"
              onClick={() => void faucet()}
              disabled={Boolean(busy)}
            >
              {busy === "faucet" ? "Minting…" : "Faucet 1,000 fUSD"}
            </button>
          </div>
        </div>

        <div className="formCard">
          <div className="formSectionTitle">
            <span>03</span>
            <div>
              <h2>Token</h2>
              <p>Fixed supply. No post-launch mint or blacklist.</p>
            </div>
          </div>
          <label>
            Token name
            <input value={name} maxLength={64} onChange={(e) => setName(e.target.value)} />
          </label>
          <label>
            Ticker
            <input value={symbol} maxLength={16} onChange={(e) => setSymbol(e.target.value)} />
          </label>
          <label>
            Description
            <textarea value={description} maxLength={4096} onChange={(e) => setDescription(e.target.value)} />
          </label>
        </div>
      </section>

      <section className="formCard" style={{ marginTop: 14 }}>
        <div className="formSectionTitle">
          <span>04</span>
          <div>
            <h2>Creator first purchase</h2>
            <p>
              {mode === "tax"
                ? "Optional. Tax-token deployment and the creator first buy use two BSC-safe transactions so the launch stays below the network gas cap."
                : "Optional. Approve fUSD once, then Fortune deploys the token and executes your first curve buy inside the same transaction."}
            </p>
          </div>
        </div>
        <label>
          Initial creator purchase · fUSD
          <input
            value={creatorPurchase}
            inputMode="decimal"
            onChange={(e) => setCreatorPurchase(e.target.value)}
            placeholder="0"
          />
        </label>
      </section>

      {mode === "tax" ? (
        <>
          <section className="formCard" style={{ marginTop: 14 }}>
            <div className="formSectionTitle">
              <span>05</span>
              <div>
                <h2>Tax + anti-farmer protection</h2>
                <p>
                  Immutable at launch. Tax cannot later be increased and the
                  protection window cannot be extended.
                </p>
              </div>
            </div>
            <div className="fieldGrid">
              <label>
                Buy tax · %
                <input type="number" min="0" max="10" step="0.1" value={buyTax} onChange={(e) => setBuyTax(e.target.value)} />
              </label>
              <label>
                Sell tax · %
                <input type="number" min="0" max="10" step="0.1" value={sellTax} onChange={(e) => setSellTax(e.target.value)} />
              </label>
              <label>
                Anti-farmer protection · days
                <input type="number" min="0" max="365" step="1" value={antiFarmerDays} onChange={(e) => setAntiFarmerDays(e.target.value)} />
                <small className="fieldHint">
                  0 disables it. During the window, recognized competing pools
                  from approved AMM factories cannot be used.
                </small>
              </label>
              <label>
                Minimum dividend balance · tokens
                <input value={minimumDividendBalance} inputMode="decimal" onChange={(e) => setMinimumDividendBalance(e.target.value)} />
              </label>
            </div>
          </section>

          <section className="formCard" style={{ marginTop: 14 }}>
            <div className="formSectionTitle">
              <span>06</span>
              <div>
                <h2>Tax allocation</h2>
                <p>Every percent is committed onchain. Total must equal 100%.</p>
              </div>
            </div>
            <div className={allocationTotal === 100 ? "registryNotice" : "registryNotice statusError"}>
              <strong>{allocationTotal}% allocated</strong>
              <span>{100 - allocationTotal}% remaining</span>
            </div>
            <div className="taxAllocationGrid">
              {allocationLabels.map((label, index) => (
                <label key={label}>
                  {label}
                  <div className="taxAllocationInput">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="1"
                      value={taxAllocation[index]}
                      onChange={(event) => {
                        const next = [...taxAllocation];
                        next[index] = Math.max(
                          0,
                          Math.min(100, Number(event.target.value) || 0)
                        );
                        setTaxAllocation(next);
                      }}
                    />
                    <span>%</span>
                  </div>
                </label>
              ))}
            </div>
            <label>
              Community treasury recipient · optional
              <input
                value={treasury}
                onChange={(e) => setTreasury(e.target.value)}
                placeholder="Defaults to connected creator wallet"
              />
            </label>
          </section>
        </>
      ) : null}

      <section className="formCard" style={{ marginTop: 14 }}>
        <div className="formSectionTitle">
          <span>{mode === "tax" ? "07" : "05"}</span>
          <div>
            <h2>Links</h2>
            <p>Optional public metadata for the token profile.</p>
          </div>
        </div>
        <div className="fieldGrid">
          <label>
            Token image
            <input
              value={imageURI}
              onChange={(e) => setImageURI(e.target.value)}
              placeholder="https://... or ipfs://..."
            />
            <small className="fieldHint">
              Public image URL or IPFS URI. Stored as token metadata; Fortune never needs your private keys.
            </small>
          </label>
          <label>Website<input value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://..." /></label>
          <label>X / Twitter<input value={xProfile} onChange={(e) => setXProfile(e.target.value)} placeholder="https://x.com/..." /></label>
          <label>Telegram<input value={telegram} onChange={(e) => setTelegram(e.target.value)} placeholder="https://t.me/..." /></label>
          <label>GitHub<input value={github} onChange={(e) => setGithub(e.target.value)} placeholder="https://github.com/..." /></label>
          <label>YouTube<input value={youtube} onChange={(e) => setYoutube(e.target.value)} placeholder="https://youtube.com/..." /></label>
          <label>DeBox<input value={debox} onChange={(e) => setDebox(e.target.value)} placeholder="https://debox.pro/..." /></label>
        </div>
      </section>

      <section className="formCard" style={{ marginTop: 14 }}>
        <div className="formSectionTitle">
          <span>{mode === "tax" ? "08" : "06"}</span>
          <div>
            <h2>Immutable launch preview</h2>
            <p>Review before signing.</p>
          </div>
        </div>
        <div className="previewFacts">
          <div><span>Architecture</span><strong>{mode === "tax" ? "Tax Token · V2" : "Standard · V3"}</strong></div>
          <div><span>Supply</span><strong>1,000,000,000</strong></div>
          <div><span>Quote</span><strong>fUSD</strong></div>
          <div><span>Graduation target</span><strong>$1 mock USD</strong></div>
          {mode === "tax" ? (
            <>
              <div><span>Buy / sell tax</span><strong>{buyTax}% / {sellTax}%</strong></div>
              <div><span>Anti-farmer</span><strong>{antiFarmerDays} days</strong></div>
            </>
          ) : null}
        </div>
        <button
          className="launchButton"
          onClick={() => void createLaunch()}
          disabled={
            Boolean(busy) ||
            serviceHealth === "checking" ||
            serviceHealth === "unavailable" ||
            (mode === "tax" &&
              (!taxReady || allocationTotal !== 100))
          }
        >
          {busy === "launch"
            ? "Creating launch…"
            : serviceHealth === "checking"
              ? "Checking launch readiness…"
              : serviceHealth === "unavailable"
                ? "Launch temporarily unavailable"
                : "Create " +
                  (mode === "tax" ? "tax token" : "standard token") +
                  " →"}
        </button>
      </section>

      <section className="panel" style={{ marginTop: 14 }}>
        <div className="panelTitle">
          <div>
            <span className="eyebrow">CURVE → PANCAKE</span>
            <h2>Complete the lifecycle</h2>
          </div>
          {launch ? (
            <a
              className="secondaryCta"
              href={explorer + "/tx/" + launch.transactionHash}
              target="_blank"
              rel="noreferrer"
            >
              Launch transaction ↗
            </a>
          ) : null}
        </div>

        {launch ? (
          <>
            <div className="previewFacts">
              <div>
                <span>Token</span>
                <a href={explorer + "/address/" + launch.token} target="_blank" rel="noreferrer">
                  <strong>{shorten(launch.token)} ↗</strong>
                </a>
              </div>
              <div>
                <span>Curve</span>
                <a href={explorer + "/address/" + launch.curve} target="_blank" rel="noreferrer">
                  <strong>{shorten(launch.curve)} ↗</strong>
                </a>
              </div>
              <div><span>Graduation DEX</span><strong>{launch.mode === "tax" ? "Pancake V2" : "Pancake V3"}</strong></div>
              <div><span>LP custody</span><strong>Permanently locked</strong></div>
            </div>
            <div className="heroActions">
              <button className="secondaryCta" onClick={() => void buyToGraduation()} disabled={Boolean(busy)}>
                {busy === "buy" ? "Buying…" : "Approve + buy 250 fUSD"}
              </button>
              <button className="primaryCta" onClick={() => void finalize()} disabled={Boolean(busy)}>
                {busy === "finalize"
                  ? "Graduating…"
                  : "Finalize " + (launch.mode === "tax" ? "V2" : "V3") + " graduation"}
              </button>
            </div>
          </>
        ) : (
          <div className="emptyPanel">
            <strong>Create a launch to unlock the lifecycle test.</strong>
            <span>The confirmed token and curve addresses appear here.</span>
          </div>
        )}
      </section>

      {launchHistory.length > 0 ? (
        <section className="panel" style={{ marginTop: 14 }}>
          <div className="panelTitle">
            <div>
              <span className="eyebrow">RECOVERY</span>
              <h2>Saved launches on this browser</h2>
            </div>
          </div>
          <div className="heroActions">
            {launchHistory.map((saved) => (
              <button
                key={saved.token}
                className="secondaryCta"
                onClick={() => recoverLaunch(saved)}
                disabled={Boolean(busy)}
                title={saved.token}
              >
                {saved.mode === "tax" ? "Tax" : "Standard"} ·{" "}
                {shorten(saved.token)}
              </button>
            ))}
          </div>
          <p className="launchDescription" style={{ minHeight: 0 }}>
            Fortune stores only public launch addresses and transaction hashes
            in this browser. Wallet keys are never stored.
          </p>
        </section>
      ) : null}

      <section className="panel" style={{ marginTop: 14 }}>
        <div className="panelTitle">
          <div>
            <span className="eyebrow">TRANSACTION STATUS</span>
            <h2>Know what actually happened onchain</h2>
          </div>
          {lastTransaction ? (
            <a
              className="secondaryCta"
              href={explorer + "/tx/" + lastTransaction.hash}
              target="_blank"
              rel="noreferrer"
            >
              {lastTransaction.state === "confirmed"
                ? "Confirmed"
                : lastTransaction.state === "reverted"
                  ? "Reverted"
                  : lastTransaction.state === "pending"
                    ? "Pending"
                    : "Check status"}{" "}
              on BscScan ↗
            </a>
          ) : null}
        </div>
        <p className="launchDescription" style={{ minHeight: 0 }}>
          {message}
        </p>
        <div className="heroActions">
          <button
            className="secondaryCta"
            onClick={() => void copyDiagnostics()}
          >
            Copy diagnostics
          </button>
          <a
            className="secondaryCta"
            href="https://github.com/shawkkkkk/fortune/issues/new?template=testnet-bug.yml"
            target="_blank"
            rel="noreferrer"
          >
            Report a bug ↗
          </a>
        </div>
      </section>

      <section className="panel" style={{ marginTop: 14 }}>
        <div className="panelTitle">
          <div>
            <span className="eyebrow">PUBLIC ALPHA CONTRACTS</span>
            <h2>Verify everything yourself</h2>
          </div>
        </div>
        <div className="manifestTable">
          {[
            ["Standard factory", PUBLIC_TESTNET.contracts.factory],
            ["Tax factory", PUBLIC_TESTNET.contracts.taxFactory],
            ["Asset registry", PUBLIC_TESTNET.contracts.registry],
            ["Pool registry", PUBLIC_TESTNET.contracts.poolRegistry],
            ["V3 graduation adapter", PUBLIC_TESTNET.contracts.graduationAdapter],
            ["V3 LP locker", PUBLIC_TESTNET.contracts.liquidityLocker],
            ["V2 tax adapter", PUBLIC_TESTNET.contracts.taxGraduationAdapter],
            ["V2 LP locker", PUBLIC_TESTNET.contracts.taxLiquidityLocker],
            ["Mock fUSD", PUBLIC_TESTNET.contracts.mockQuote],
          ]
            .filter(([, address]) => Boolean(address))
            .map(([label, address]) => (
              <div key={label}>
                <span>{label}</span>
                <a href={explorer + "/address/" + address} target="_blank" rel="noreferrer">
                  <strong>{shorten(address)} ↗</strong>
                </a>
              </div>
            ))}
        </div>
      </section>
    </main>
  );
}
