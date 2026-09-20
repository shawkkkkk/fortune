"use client";

import Link from "next/link";
import { useState } from "react";
import {
  createPublicClient,
  createWalletClient,
  custom,
  decodeEventLog,
  defineChain,
  parseUnits,
  type Address,
  type EIP1193Provider,
  type Hex,
} from "viem";
import {
  FORTUNE_NETWORK,
  FORTUNE_NETWORK_CONFIGURED,
} from "@/lib/fortune-network";
import FortuneLogo from "@/components/FortuneLogo";

const launchParamsComponents = [
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

const factoryAbi = [
  {
    type: "function",
    name: "preflightLaunch",
    stateMutability: "view",
    inputs: [
      { name: "p", type: "tuple", components: launchParamsComponents },
    ],
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
      { name: "p", type: "tuple", components: launchParamsComponents },
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
      { name: "p", type: "tuple", components: launchParamsComponents },
      { name: "vanitySalt", type: "bytes32" },
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

type LaunchReceipt = {
  token: Address;
  curve: Address;
  transactionHash: Hex;
};

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

function decodeBytes32(value: Hex) {
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

export default function LaunchPage() {
  const [account, setAccount] = useState<Address | null>(null);
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [description, setDescription] = useState("");
  const [totalSupply, setTotalSupply] = useState("1000000000");
  const [basePrice, setBasePrice] = useState("");
  const [slope, setSlope] = useState("0");
  const [graduationTarget, setGraduationTarget] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [receipt, setReceipt] = useState<LaunchReceipt | null>(null);

  if (!FORTUNE_NETWORK.isMainnet) {
    return (
      <main className="page narrowPage">
        <section className="pageHeading">
          <div>
            <FortuneLogo size="md" />
            <span className="eyebrow">PRODUCTION LAUNCH</span>
            <h1>Mainnet is not active on this deployment.</h1>
            <p>
              This site is currently configured for BSC Testnet. Use the public
              alpha flow while the audited production deployment is being prepared.
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
              Fortune will not construct real-value launch transactions until the
              factory, registry, graduation adapter, LP locker, and approved primary
              quote asset are all configured.
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
      const wallet = account || (await connectNetwork());
      setAccount(wallet);

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

      const { publicClient, walletClient } = clients(wallet);

      const params = {
        name: cleanName,
        symbol: cleanSymbol,
        totalSupply: parseUnits(totalSupply, 18),
        quoteAssets: [
          FORTUNE_NETWORK.primaryQuote.address as Address,
        ],
        weightsBps: [10_000],
        primaryQuote:
          FORTUNE_NETWORK.primaryQuote.address as Address,
        basePriceUsd1e18: parseUnits(basePrice, 18),
        slopeUsd1e18: parseUnits(slope || "0", 18),
        graduationUsd1e18: parseUnits(graduationTarget, 18),
        adaptiveGraduation: true,
        feeBps: [25, 25, 25, 15, 0, 10] as const,
        treasury: wallet,
        metadataEditable: true,
        description: description.trim().slice(0, 4096),
        imageURI: "",
        website: "",
        xProfile: "",
        telegram: "",
        github: "",
        youtube: "",
        debox: "",
      };

      setMessage("Running onchain launch preflight…");

      const [ready, reasonCode] =
        await publicClient.readContract({
          address:
            FORTUNE_NETWORK.contracts.factory as Address,
          abi: factoryAbi,
          functionName: "preflightLaunch",
          args: [params],
        });

      if (!ready) {
        throw new Error(
          "Launch preflight failed: " +
            (decodeBytes32(reasonCode) || reasonCode)
        );
      }

      setMessage("Preparing deterministic Fortune token address…");

      const [salt] = await publicClient.readContract({
        address:
          FORTUNE_NETWORK.contracts.factory as Address,
        abi: factoryAbi,
        functionName: "previewPreparedVanity",
        args: [wallet, params],
      });

      setMessage("Confirm the launch transaction in your wallet.");

      const hash = await walletClient.writeContract({
        address:
          FORTUNE_NETWORK.contracts.factory as Address,
        abi: factoryAbi,
        functionName: "createLaunchPrepared",
        args: [params, salt],
      });

      const txReceipt =
        await publicClient.waitForTransactionReceipt({ hash });

      let created: LaunchReceipt | null = null;

      for (const log of txReceipt.logs) {
        if (
          log.address.toLowerCase() !==
          FORTUNE_NETWORK.contracts.factory.toLowerCase()
        ) {
          continue;
        }

        try {
          const event = decodeEventLog({
            abi: factoryAbi,
            eventName: "LaunchCreated",
            data: log.data,
            topics: log.topics,
          });

          created = {
            token: event.args.token,
            curve: event.args.curve,
            transactionHash: hash,
          };
          break;
        } catch {
          // Ignore unrelated factory events.
        }
      }

      if (!created) {
        throw new Error(
          "The transaction confirmed, but LaunchCreated could not be decoded. Check the transaction on BscScan."
        );
      }

      setReceipt(created);
      setMessage("Launch confirmed on BNB Smart Chain.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Launch failed."
      );
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
          <h1>Launch a real Fortune token.</h1>
          <p>
            Every field below becomes part of the onchain launch economics.
            Fortune runs a final onchain preflight before your wallet is asked
            to sign.
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
          You are on BNB Smart Chain mainnet. Transactions spend real BNB and
          quote assets. Review all economics before signing.
        </span>
      </section>

      <section className="formCard">
        <div className="formSectionTitle">
          <span>01</span>
          <div>
            <h2>Token identity</h2>
            <p>Immutable ERC-20 name, ticker, and fixed supply.</p>
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
        </div>

        <label>
          Total supply
          <input
            value={totalSupply}
            inputMode="decimal"
            onChange={(event) => setTotalSupply(event.target.value)}
          />
        </label>

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
          <span>02</span>
          <div>
            <h2>Curve economics</h2>
            <p>
              Values are USD-denominated and enforced by the deployed oracle
              configuration.
            </p>
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
              onChange={(event) =>
                setGraduationTarget(event.target.value)
              }
              placeholder="Enter target reserve value"
            />
          </label>
          <label>
            Primary quote asset
            <input
              value={
                FORTUNE_NETWORK.primaryQuote.symbol +
                " · " +
                FORTUNE_NETWORK.primaryQuote.address
              }
              readOnly
            />
          </label>
        </div>

        <div className="previewFacts">
          <div><span>Creator fee</span><strong>0.25%</strong></div>
          <div><span>Holder route</span><strong>0.25%</strong></div>
          <div><span>Buyback route</span><strong>0.25%</strong></div>
          <div><span>Liquidity route</span><strong>0.15%</strong></div>
          <div><span>Protocol route</span><strong>0.10%</strong></div>
          <div><span>Total trading fee</span><strong>1.00%</strong></div>
        </div>

        <button
          className="launchButton"
          disabled={busy}
          onClick={() => void launch()}
        >
          {busy ? "Preparing launch…" : "Preflight + launch on BNB Chain →"}
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
              href={"/market/" + receipt.curve}
            >
              Open market →
            </Link>
          </div>
        ) : null}
      </section>
    </main>
  );
}
