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
  FORTUNE_TAX_NETWORK_CONFIGURED,
} from "@/lib/fortune-network";
import FortuneLogo from "@/components/FortuneLogo";

type LaunchMode = "standard" | "tax";

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

const curveBuyAbi = [
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

const allocationLabels = [
  "Creator",
  "Direct burn",
  "Holder dividends",
  "Buyback + burn",
  "Liquidity",
  "Community treasury",
  "Protocol",
] as const;

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
  const [mode, setMode] = useState<LaunchMode>("standard");
  const [account, setAccount] = useState<Address | null>(null);
  const [assets, setAssets] = useState<LaunchAsset[]>([]);
  const [assetSearch, setAssetSearch] = useState("");
  const [selectedAsset, setSelectedAsset] = useState<Address | null>(null);
  const [assetError, setAssetError] = useState("");
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [description, setDescription] = useState("");
  const [imageURI, setImageURI] = useState("");
  const [totalSupply, setTotalSupply] = useState("1000000000");
  const [basePrice, setBasePrice] = useState("");
  const [slope, setSlope] = useState("0");
  const [graduationTarget, setGraduationTarget] = useState("");
  const [creatorPurchase, setCreatorPurchase] = useState("0");
  const [buyTax, setBuyTax] = useState("1");
  const [sellTax, setSellTax] = useState("1");
  const [antiFarmerDays, setAntiFarmerDays] = useState("30");
  const [minimumDividendBalance, setMinimumDividendBalance] = useState("0");
  const [taxAllocation, setTaxAllocation] = useState([
    20, 10, 20, 20, 15, 5, 10,
  ]);
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

  const allocationTotal = useMemo(
    () => taxAllocation.reduce((sum, value) => sum + value, 0),
    [taxAllocation]
  );

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
    if (!FORTUNE_NETWORK.isMainnet || !FORTUNE_NETWORK_CONFIGURED) return;

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

  if (!FORTUNE_NETWORK.isMainnet) {
    return (
      <main className="page narrowPage">
        <section className="pageHeading">
          <div>
            <FortuneLogo size="md" />
            <span className="eyebrow">PRODUCTION LAUNCH</span>
            <h1>Mainnet is not active on this deployment.</h1>
            <p>
              Use the public BSC Testnet alpha to exercise the same launch
              architecture without real assets.
            </p>
          </div>
          <Link href="/testnet" className="primaryCta">
            Open public alpha →
          </Link>
        </section>
      </main>
    );
  }

  if (!FORTUNE_NETWORK_CONFIGURED) {
    return (
      <main className="page narrowPage">
        <section className="pageHeading">
          <div>
            <FortuneLogo size="md" />
            <span className="eyebrow">PRODUCTION LAUNCH</span>
            <h1>Mainnet contracts are not fully configured.</h1>
            <p>
              Fortune will not construct real-value launch transactions until
              the production stack and approved quote assets are configured.
            </p>
          </div>
          <Link href="/status" className="secondaryCta">
            View readiness
          </Link>
        </section>
      </main>
    );
  }

  async function launch() {
    setBusy(true);
    setMessage("");
    setReceipt(null);

    try {
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
      if (mode === "tax" && !FORTUNE_TAX_NETWORK_CONFIGURED) {
        throw new Error("The production tax-token stack is not activated.");
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

      if (mode === "standard") {
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
          feeBps: [25, 25, 25, 15, 0, 10] as const,
          treasury: destination,
          metadataEditable: true,
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

          hash = await walletClient.writeContract({
            address: FORTUNE_NETWORK.contracts.factory as Address,
            abi: standardFactoryAbi,
            functionName: "createLaunchPreparedAndBuy",
            args: [params, salt, initial, 1n],
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
      } else {
        const buyTaxBps = Math.round(Number(buyTax) * 100);
        const sellTaxBps = Math.round(Number(sellTax) * 100);
        const days = Math.round(Number(antiFarmerDays));

        if (
          buyTaxBps < 0 ||
          sellTaxBps < 0 ||
          buyTaxBps > 1000 ||
          sellTaxBps > 1000 ||
          buyTaxBps + sellTaxBps === 0
        ) {
          throw new Error("Buy and sell tax must each be between 0% and 10%, with at least one non-zero.");
        }
        if (!Number.isInteger(days) || days < 0 || days > 365) {
          throw new Error("Anti-farmer duration must be 0–365 days.");
        }
        if (allocationTotal !== 100) {
          throw new Error("Tax allocation must total exactly 100%.");
        }

        const allocationBps = taxAllocation.map(
          (value) => Math.round(value * 100)
        ) as [number, number, number, number, number, number, number];

        const params = {
          name: cleanName,
          symbol: cleanSymbol,
          totalSupply: parseUnits(totalSupply, 18),
          quoteAsset: selected.address,
          basePriceUsd1e18: parseUnits(basePrice, 18),
          slopeUsd1e18: parseUnits(slope || "0", 18),
          graduationUsd1e18: parseUnits(graduationTarget, 18),
          feeBps: [25, 25, 25, 15, 0, 10] as const,
          treasury: destination,
          buyTaxBps,
          sellTaxBps,
          antiFarmerDuration: days * 24 * 60 * 60,
          minimumDividendBalance: parseTokenAmount(
            "Minimum dividend balance",
            minimumDividendBalance,
            18
          ),
          taxAllocationBps: allocationBps,
          ...meta,
        };

        const taxFactory =
          FORTUNE_NETWORK.contracts.taxFactory as Address;

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

        const [salt] = await publicClient.readContract({
          address: taxFactory,
          abi: taxFactoryAbi,
          functionName: "previewPreparedVanity",
          args: [wallet, params],
        });

        setMessage(
          initial > 0n
            ? "Confirm the tax-token launch. Your creator purchase follows as a separate BSC transaction."
            : "Confirm the tax-token launch transaction."
        );

        hash = await walletClient.writeContract({
          address: taxFactory,
          abi: taxFactoryAbi,
          functionName: "createLaunchPrepared",
          args: [params, salt],
        });
      }

      const txReceipt = await publicClient.waitForTransactionReceipt({ hash });
      let created: LaunchReceipt | null = null;

      for (const log of txReceipt.logs) {
        try {
          if (mode === "standard") {
            if (
              log.address.toLowerCase() !==
              FORTUNE_NETWORK.contracts.factory.toLowerCase()
            ) {
              continue;
            }

            const event = decodeEventLog({
              abi: standardFactoryAbi,
              eventName: "LaunchCreated",
              data: log.data,
              topics: log.topics,
            });

            created = {
              mode,
              token: event.args.token,
              curve: event.args.curve,
              transactionHash: hash,
            };
          } else {
            if (
              log.address.toLowerCase() !==
              FORTUNE_NETWORK.contracts.taxFactory.toLowerCase()
            ) {
              continue;
            }

            const event = decodeEventLog({
              abi: taxFactoryAbi,
              eventName: "TaxLaunchCreated",
              data: log.data,
              topics: log.topics,
            });

            created = {
              mode,
              token: event.args.token,
              curve: event.args.curve,
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
          "The transaction confirmed, but Fortune could not decode the launch event."
        );
      }

      // The launch itself is final before any optional tax-token follow-up buy.
      // Surface it immediately so a rejected second transaction cannot make the
      // successfully created token appear lost.
      setReceipt(created);

      if (mode === "tax" && initial > 0n) {
        try {
          setMessage(
            "Tax launch confirmed. Approve the quote asset, then confirm your creator first purchase."
          );

          const approveHash = await walletClient.writeContract({
            address: selected.address,
            abi: erc20Abi,
            functionName: "approve",
            args: [created.curve, initial],
          });
          await publicClient.waitForTransactionReceipt({ hash: approveHash });

          const buyHash = await walletClient.writeContract({
            address: created.curve,
            abi: curveBuyAbi,
            functionName: "buy",
            args: [selected.address, initial, 1n],
          });
          await publicClient.waitForTransactionReceipt({ hash: buyHash });

          setMessage(
            "Tax launch and creator first purchase confirmed on BNB Smart Chain."
          );
        } catch (error) {
          setMessage(
            "Tax token launch succeeded, but the optional creator first purchase did not complete. " +
              (error instanceof Error
                ? error.message
                : "The follow-up transaction failed.") +
              " The confirmed token remains available below."
          );
          return;
        }
      } else {
        setMessage("Launch confirmed on BNB Smart Chain.");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Launch failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="page narrowPage">
      <section className="pageHeading">
        <div>
          <FortuneLogo size="md" />
          <span className="eyebrow">BNB CHAIN · PRODUCTION</span>
          <h1>Launch against the BNB economy.</h1>
          <p>
            Pick any asset admitted to Fortune&apos;s live onchain registry.
            Standard tokens use Pancake V3. Tax tokens add immutable tax,
            holder rewards, buyback/burn routing and bounded anti-farmer
            protection before Pancake V2 graduation.
          </p>
        </div>
        <button
          className="secondaryCta"
          disabled={busy}
          onClick={async () => {
            try {
              const wallet = await connectNetwork();
              setAccount(wallet);
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
      </section>

      <section className="registryNotice">
        <strong>REAL-VALUE NETWORK</strong>
        <span>
          Transactions spend real assets. Fortune runs a live registry/oracle
          preflight before any launch can be created.
        </span>
      </section>

      <section className="formCard">
        <div className="formSectionTitle">
          <span>01</span>
          <div>
            <h2>Launch architecture</h2>
            <p>Choose the immutable token model.</p>
          </div>
        </div>
        <div className="modeRow launchModeRow">
          <button
            className={mode === "standard" ? "selectedMode" : ""}
            onClick={() => setMode("standard")}
          >
            <strong>Standard</strong>
            <span>0% transfer tax · Pancake V3 · permanent NFT LP lock</span>
          </button>
          <button
            className={mode === "tax" ? "selectedMode" : ""}
            disabled={!FORTUNE_TAX_NETWORK_CONFIGURED}
            onClick={() => setMode("tax")}
          >
            <strong>Tax Token</strong>
            <span>
              {FORTUNE_TAX_NETWORK_CONFIGURED
                ? "Tax + dividends + anti-farmer · Pancake V2"
                : "Available after the production tax stack passes release gates"}
            </span>
          </button>
        </div>
      </section>

      <section className="formCard" style={{ marginTop: 14 }}>
        <div className="formSectionTitle">
          <span>02</span>
          <div>
            <h2>Payment asset</h2>
            <p>
              The picker is sourced from the live Fortune registry, not a
              hard-coded token list.
            </p>
          </div>
        </div>

        <div className="assetPickerToolbar">
          <input
            value={assetSearch}
            onChange={(event) => setAssetSearch(event.target.value)}
            placeholder="Search the launchable asset universe"
          />
          <Link href="/assets" className="secondaryCta">
            Browse full universe
          </Link>
        </div>

        {assetError ? (
          <div className="registryNotice statusError">
            <strong>ASSET READ FAILED</strong>
            <span>{assetError}</span>
          </div>
        ) : null}

        <div className="launchAssetGrid">
          {visibleAssets.map((asset) => (
            <button
              key={asset.address}
              className={
                selectedAsset?.toLowerCase() === asset.address.toLowerCase()
                  ? "assetOption assetSelected"
                  : "assetOption"
              }
              onClick={() => setSelectedAsset(asset.address)}
            >
              <span className="assetIconLarge">
                {asset.symbol.slice(0, 2)}
              </span>
              <span>
                <strong>{asset.symbol}</strong>
                <small>{asset.name}</small>
              </span>
              <em>{asset.category}</em>
            </button>
          ))}
        </div>
      </section>

      <section className="formCard" style={{ marginTop: 14 }}>
        <div className="formSectionTitle">
          <span>03</span>
          <div>
            <h2>Token identity</h2>
            <p>Immutable ERC-20 name, ticker and fixed supply.</p>
          </div>
        </div>

        <div className="fieldGrid">
          <label>
            Token name
            <input
              value={name}
              maxLength={64}
              onChange={(event) => setName(event.target.value)}
              placeholder="Fortune Example"
            />
          </label>
          <label>
            Ticker
            <input
              value={symbol}
              maxLength={16}
              onChange={(event) => setSymbol(event.target.value)}
              placeholder="FORT"
            />
          </label>
          <label>
            Total supply
            <input
              value={totalSupply}
              inputMode="decimal"
              onChange={(event) => setTotalSupply(event.target.value)}
            />
          </label>
          <label>
            Creator first purchase · {selected?.symbol || "quote"}
            <input
              value={creatorPurchase}
              inputMode="decimal"
              onChange={(event) => setCreatorPurchase(event.target.value)}
              placeholder="0"
            />
          </label>
        </div>

        <label>
          Description
          <textarea
            value={description}
            maxLength={4096}
            onChange={(event) => setDescription(event.target.value)}
          />
        </label>
      </section>

      <section className="formCard" style={{ marginTop: 14 }}>
        <div className="formSectionTitle">
          <span>04</span>
          <div>
            <h2>Curve economics</h2>
            <p>USD-denominated values enforced by Fortune&apos;s live oracle.</p>
          </div>
        </div>

        <div className="fieldGrid">
          <label>
            Opening price · USD
            <input
              value={basePrice}
              inputMode="decimal"
              onChange={(event) => setBasePrice(event.target.value)}
              placeholder="e.g. 0.00001"
            />
          </label>
          <label>
            Linear slope · USD per token
            <input
              value={slope}
              inputMode="decimal"
              onChange={(event) => setSlope(event.target.value)}
              placeholder="0 for flat curve"
            />
          </label>
          <label>
            Graduation target · USD
            <input
              value={graduationTarget}
              inputMode="decimal"
              onChange={(event) => setGraduationTarget(event.target.value)}
              placeholder="Enter target reserve value"
            />
          </label>
          <label>
            Selected quote
            <input
              value={
                selected
                  ? selected.symbol + " · " + short(selected.address)
                  : "Choose an asset above"
              }
              readOnly
            />
          </label>
        </div>
      </section>

      {mode === "tax" ? (
        <>
          <section className="formCard" style={{ marginTop: 14 }}>
            <div className="formSectionTitle">
              <span>05</span>
              <div>
                <h2>Tax + anti-farmer</h2>
                <p>Immutable at launch. Rates cannot later be raised.</p>
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
                Anti-farmer · days
                <input type="number" min="0" max="365" step="1" value={antiFarmerDays} onChange={(e) => setAntiFarmerDays(e.target.value)} />
              </label>
              <label>
                Minimum dividend balance
                <input value={minimumDividendBalance} inputMode="decimal" onChange={(e) => setMinimumDividendBalance(e.target.value)} />
              </label>
            </div>
          </section>

          <section className="formCard" style={{ marginTop: 14 }}>
            <div className="formSectionTitle">
              <span>06</span>
              <div>
                <h2>Tax allocation</h2>
                <p>Total must equal exactly 100%.</p>
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
                placeholder="Defaults to creator wallet"
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
            <p>Optional public token profile links.</p>
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
              Public image URL or IPFS URI.
            </small>
          </label>
          <label>Website<input value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://..." /></label>
          <label>X / Twitter<input value={xProfile} onChange={(e) => setXProfile(e.target.value)} placeholder="https://x.com/..." /></label>
          <label>Telegram<input value={telegram} onChange={(e) => setTelegram(e.target.value)} placeholder="https://t.me/..." /></label>
          <label>GitHub<input value={github} onChange={(e) => setGithub(e.target.value)} placeholder="https://github.com/..." /></label>
          <label>YouTube<input value={youtube} onChange={(e) => setYoutube(e.target.value)} placeholder="https://youtube.com/..." /></label>
          <label>DeBox<input value={debox} onChange={(e) => setDebox(e.target.value)} placeholder="https://debox.pro/..." /></label>
        </div>

        <button
          className="launchButton"
          disabled={
            busy ||
            !selected ||
            (mode === "tax" && allocationTotal !== 100)
          }
          onClick={() => void launch()}
        >
          {busy
            ? "Preparing launch…"
            : "Preflight + launch on BNB Chain →"}
        </button>
      </section>

      <section className="panel" style={{ marginTop: 14 }}>
        <span className="eyebrow">STATUS</span>
        <p className="launchDescription" style={{ minHeight: 0 }}>
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
                receipt.curve +
                (receipt.mode === "tax" ? "?mode=tax" : "")
              }
            >
              Open market →
            </Link>
          </div>
        ) : null}
      </section>
    </main>
  );
}
