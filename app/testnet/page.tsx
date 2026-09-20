"use client";

import { useState } from "react";
import {
  createPublicClient,
  createWalletClient,
  custom,
  decodeEventLog,
  defineChain,
  encodeAbiParameters,
  formatUnits,
  parseUnits,
  type Address,
  type EIP1193Provider,
  type Hex,
} from "viem";
import { PUBLIC_TESTNET } from "@/lib/public-testnet";

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
] as const;

const factoryAbi = [
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
      http: [
        PUBLIC_TESTNET.rpcUrl,
        PUBLIC_TESTNET.fallbackRpcUrl,
      ],
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
  token: Address;
  curve: Address;
  transactionHash: Hex;
};

function shorten(value: string) {
  return value.slice(0, 8) + "…" + value.slice(-6);
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
          blockExplorerUrls: [
            PUBLIC_TESTNET.explorerUrl,
          ],
        },
      ],
    });
  }

  return accounts[0];
}

function clients(account: Address) {
  const transport = custom(provider());

  return {
    publicClient: createPublicClient({
      chain: bscTestnet,
      transport,
    }),
    walletClient: createWalletClient({
      account,
      chain: bscTestnet,
      transport,
    }),
  };
}

export default function PublicTestnetPage() {
  const [account, setAccount] = useState<Address | null>(null);
  const [name, setName] = useState("Fortune Beta Token");
  const [symbol, setSymbol] = useState("FBETA");
  const [description, setDescription] = useState(
    "Created on the Fortune BSC public testnet beta."
  );
  const [launch, setLaunch] = useState<TestLaunch | null>(null);
  const [quoteBalance, setQuoteBalance] = useState("0");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState(
    "Connect a testnet wallet to begin."
  );

  async function withAccount() {
    const next = account || (await connectTestnet());
    setAccount(next);
    return next;
  }

  async function refreshQuoteBalance(nextAccount?: Address) {
    const active = nextAccount || account;
    if (!active) return;

    const { publicClient } = clients(active);
    const balance = await publicClient.readContract({
      address: PUBLIC_TESTNET.contracts.mockQuote,
      abi: quoteAbi,
      functionName: "balanceOf",
      args: [active],
    });

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
        "Wallet connected to BSC Testnet. Get tBNB for gas, then use the free fUSD test faucet below."
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
      const { publicClient, walletClient } =
        clients(active);

      const hash = await walletClient.writeContract({
        address: PUBLIC_TESTNET.contracts.mockQuote,
        abi: quoteAbi,
        functionName: "faucet",
        args: [parseUnits("250", 18)],
      });

      await publicClient.waitForTransactionReceipt({
        hash,
      });
      await refreshQuoteBalance(active);
      setMessage(
        "250 fUSD test tokens minted to your wallet."
      );
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

  async function createLaunch() {
    setBusy("launch");
    try {
      const active = await withAccount();
      const cleanName = name.trim();
      const cleanSymbol = symbol.trim().toUpperCase();

      if (!cleanName || cleanName.length > 64) {
        throw new Error(
          "Token name must be 1–64 characters."
        );
      }
      if (!cleanSymbol || cleanSymbol.length > 16) {
        throw new Error(
          "Ticker must be 1–16 characters."
        );
      }

      const { publicClient, walletClient } =
        clients(active);

      const params = {
        name: cleanName,
        symbol: cleanSymbol,
        totalSupply:
          1_000_000_000n * 10n ** 18n,
        quoteAssets: [
          PUBLIC_TESTNET.contracts.mockQuote,
        ],
        weightsBps: [10_000],
        primaryQuote:
          PUBLIC_TESTNET.contracts.mockQuote,
        basePriceUsd1e18: 10n ** 15n,
        slopeUsd1e18: 10n ** 6n,
        graduationUsd1e18: 10n ** 18n,
        adaptiveGraduation: true,
        feeBps: [25, 25, 25, 15, 0, 10] as const,
        treasury: active,
        metadataEditable: true,
        description: description.trim().slice(0, 4096),
        imageURI: "",
        website: "",
        xProfile: "",
        telegram: "",
      };

      setMessage(
        "Finding your deterministic 0xfe token address…"
      );

      const [salt] = await publicClient.readContract({
        address: PUBLIC_TESTNET.contracts.factory,
        abi: factoryAbi,
        functionName: "previewPreparedVanity",
        args: [active, params],
      });

      setMessage(
        "Confirm the Fortune launch transaction in your wallet."
      );

      const hash = await walletClient.writeContract({
        address: PUBLIC_TESTNET.contracts.factory,
        abi: factoryAbi,
        functionName: "createLaunchPrepared",
        args: [params, salt],
      });

      const receipt =
        await publicClient.waitForTransactionReceipt({
          hash,
        });

      let created: TestLaunch | null = null;

      for (const log of receipt.logs) {
        if (
          log.address.toLowerCase() !==
          PUBLIC_TESTNET.contracts.factory.toLowerCase()
        ) {
          continue;
        }

        try {
          const decoded = decodeEventLog({
            abi: factoryAbi,
            eventName: "LaunchCreated",
            data: log.data,
            topics: log.topics,
          });

          created = {
            token: decoded.args.token,
            curve: decoded.args.curve,
            transactionHash: hash,
          };
          break;
        } catch {
          // Ignore unrelated factory events.
        }
      }

      if (!created) {
        throw new Error(
          "Launch transaction confirmed, but the LaunchCreated event could not be decoded. Check the transaction in BscScan."
        );
      }

      setLaunch(created);
      setMessage(
        "Launch created. Faucet fUSD if needed, then buy on the curve to drive it to graduation."
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Launch creation failed."
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
      const { publicClient, walletClient } =
        clients(active);
      const amount = parseUnits("250", 18);

      const balance = await publicClient.readContract({
        address: PUBLIC_TESTNET.contracts.mockQuote,
        abi: quoteAbi,
        functionName: "balanceOf",
        args: [active],
      });

      if (balance < amount) {
        throw new Error(
          "You need at least 250 fUSD. Use the free fUSD faucet first."
        );
      }

      setMessage(
        "Approve 250 fUSD for this curve in your wallet."
      );

      const approval =
        await walletClient.writeContract({
          address:
            PUBLIC_TESTNET.contracts.mockQuote,
          abi: quoteAbi,
          functionName: "approve",
          args: [launch.curve, amount],
        });

      await publicClient.waitForTransactionReceipt({
        hash: approval,
      });

      setMessage(
        "Approval confirmed. Confirm the curve buy."
      );

      const buyHash =
        await walletClient.writeContract({
          address: launch.curve,
          abi: curveAbi,
          functionName: "buy",
          args: [
            PUBLIC_TESTNET.contracts.mockQuote,
            amount,
            1n,
          ],
        });

      await publicClient.waitForTransactionReceipt({
        hash: buyHash,
      });

      const ready = await publicClient.readContract({
        address: launch.curve,
        abi: curveAbi,
        functionName: "graduationReady",
      });

      await refreshQuoteBalance(active);

      setMessage(
        ready
          ? "Curve reached GraduationReady. You can now finalize its Pancake V3 graduation."
          : "Buy confirmed. This curve has not reached GraduationReady yet."
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Curve buy failed."
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
      const { publicClient, walletClient } =
        clients(active);

      const deadline =
        BigInt(Math.floor(Date.now() / 1000) + 1200);

      const plan = encodeAbiParameters(
        [
          {
            type: "tuple",
            components: [
              { name: "fees", type: "uint24[]" },
              {
                name: "maxSqrtPriceDeviationBps",
                type: "uint16",
              },
              {
                name: "maxDustBps",
                type: "uint16",
              },
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

      const simulation =
        await publicClient.simulateContract({
          account: active,
          address: PUBLIC_TESTNET.contracts.factory,
          abi: factoryAbi,
          functionName: "finalizeGraduation",
          args: [launch.curve, plan],
        });

      if (!simulation.result) {
        throw new Error(
          "Graduation preflight is not ready yet. The launch remains retryable."
        );
      }

      setMessage(
        "Confirm the permissionless graduation transaction."
      );

      const hash =
        await walletClient.writeContract(
          simulation.request
        );

      await publicClient.waitForTransactionReceipt({
        hash,
      });

      const [graduated, phase] = await Promise.all([
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

      if (!graduated || phase !== 2) {
        throw new Error(
          "Transaction confirmed but the curve did not reach PoolCreated. It can be retried."
        );
      }

      setMessage(
        "Graduation complete: Pancake V3 pool created and the LP-position NFT is permanently locked."
      );
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

  const explorer = PUBLIC_TESTNET.explorerUrl;

  return (
    <main className="page narrowPage">
      <section className="pageHeading">
        <div>
          <span className="eyebrow">
            PUBLIC BSC TESTNET BETA
          </span>
          <h1>Try Fortune onchain.</h1>
          <p>
            Create a real Fortune testnet launch, trade its
            Basket Curve with free mock fUSD, and graduate it
            into a real Pancake V3 testnet pool. Test assets
            have no financial value.
          </p>
        </div>
        <a
          className="secondaryCta"
          href={PUBLIC_TESTNET.faucetUrl}
          target="_blank"
          rel="noreferrer"
        >
          Get tBNB gas ↗
        </a>
      </section>

      <section className="registryNotice">
        <strong>TESTNET ONLY</strong>
        <span>
          Chain 97 · never use real BNB or a wallet holding
          valuable assets. The fUSD faucet below mints a
          Fortune-owned mock token solely for testing.
        </span>
      </section>

      <section className="twoColumn">
        <div className="formCard">
          <div className="formSectionTitle">
            <span>01</span>
            <div>
              <h2>Wallet + test funds</h2>
              <p>
                tBNB pays gas. fUSD is the free quote asset
                used by this beta deployment.
              </p>
            </div>
          </div>

          <div className="previewFacts">
            <div>
              <span>Network</span>
              <strong>BSC Testnet · 97</strong>
            </div>
            <div>
              <span>Wallet</span>
              <strong>
                {account ? shorten(account) : "Not connected"}
              </strong>
            </div>
            <div>
              <span>fUSD balance</span>
              <strong>{quoteBalance}</strong>
            </div>
          </div>

          <div className="heroActions">
            <button
              className="secondaryCta"
              onClick={() => void connect()}
              disabled={Boolean(busy)}
            >
              {busy === "connect"
                ? "Connecting…"
                : "Connect / switch testnet"}
            </button>
            <button
              className="primaryCta"
              onClick={() => void faucet()}
              disabled={Boolean(busy)}
            >
              {busy === "faucet"
                ? "Minting…"
                : "Faucet 250 fUSD"}
            </button>
          </div>
        </div>

        <div className="formCard">
          <div className="formSectionTitle">
            <span>02</span>
            <div>
              <h2>Create a launch</h2>
              <p>
                The public beta uses the proven single-asset
                fUSD path and the live Fortune factory.
              </p>
            </div>
          </div>

          <label>
            Token name
            <input
              value={name}
              maxLength={64}
              onChange={(event) =>
                setName(event.target.value)
              }
            />
          </label>
          <label>
            Ticker
            <input
              value={symbol}
              maxLength={16}
              onChange={(event) =>
                setSymbol(event.target.value)
              }
            />
          </label>
          <label>
            Description
            <textarea
              value={description}
              maxLength={4096}
              onChange={(event) =>
                setDescription(event.target.value)
              }
            />
          </label>

          <button
            className="launchButton"
            onClick={() => void createLaunch()}
            disabled={Boolean(busy)}
          >
            {busy === "launch"
              ? "Creating launch…"
              : "Create testnet launch →"}
          </button>
        </div>
      </section>

      <section className="panel" style={{ marginTop: 14 }}>
        <div className="panelTitle">
          <div>
            <span className="eyebrow">
              03 · CURVE → PANCAKE
            </span>
            <h2>Complete the testnet lifecycle</h2>
          </div>
          {launch ? (
            <a
              className="secondaryCta"
              href={
                explorer +
                "/tx/" +
                launch.transactionHash
              }
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
                <a
                  href={explorer + "/address/" + launch.token}
                  target="_blank"
                  rel="noreferrer"
                >
                  <strong>{shorten(launch.token)} ↗</strong>
                </a>
              </div>
              <div>
                <span>Curve</span>
                <a
                  href={explorer + "/address/" + launch.curve}
                  target="_blank"
                  rel="noreferrer"
                >
                  <strong>{shorten(launch.curve)} ↗</strong>
                </a>
              </div>
              <div>
                <span>Graduation target</span>
                <strong>$1 mock USD</strong>
              </div>
              <div>
                <span>Pancake fee tier</span>
                <strong>0.05%</strong>
              </div>
            </div>

            <div className="heroActions">
              <button
                className="secondaryCta"
                onClick={() =>
                  void buyToGraduation()
                }
                disabled={Boolean(busy)}
              >
                {busy === "buy"
                  ? "Buying…"
                  : "Approve + buy 250 fUSD"}
              </button>
              <button
                className="primaryCta"
                onClick={() => void finalize()}
                disabled={Boolean(busy)}
              >
                {busy === "finalize"
                  ? "Graduating…"
                  : "Finalize Pancake graduation"}
              </button>
            </div>
          </>
        ) : (
          <div className="emptyPanel">
            <strong>
              Create a launch to unlock the lifecycle test.
            </strong>
            <span>
              You will receive the real testnet token and curve
              addresses after the LaunchCreated event confirms.
            </span>
          </div>
        )}
      </section>

      <section className="panel" style={{ marginTop: 14 }}>
        <span className="eyebrow">TRANSACTION STATUS</span>
        <p className="launchDescription" style={{ minHeight: 0 }}>
          {message}
        </p>
      </section>

      <section className="panel" style={{ marginTop: 14 }}>
        <div className="panelTitle">
          <div>
            <span className="eyebrow">
              PUBLIC BETA CONTRACTS
            </span>
            <h2>Verify everything yourself</h2>
          </div>
          <a
            className="secondaryCta"
            href={
              explorer +
              "/address/" +
              PUBLIC_TESTNET.contracts.factory
            }
            target="_blank"
            rel="noreferrer"
          >
            Factory on BscScan ↗
          </a>
        </div>
        <div className="manifestTable">
          {[
            ["Fortune Factory", PUBLIC_TESTNET.contracts.factory],
            ["Asset Registry", PUBLIC_TESTNET.contracts.registry],
            [
              "Pancake graduation adapter",
              PUBLIC_TESTNET.contracts.graduationAdapter,
            ],
            [
              "Permanent LP locker",
              PUBLIC_TESTNET.contracts.liquidityLocker,
            ],
            ["Mock fUSD", PUBLIC_TESTNET.contracts.mockQuote],
          ].map(([label, address]) => (
            <div key={label}>
              <span>{label}</span>
              <a
                href={explorer + "/address/" + address}
                target="_blank"
                rel="noreferrer"
              >
                <strong>{shorten(address)} ↗</strong>
              </a>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
