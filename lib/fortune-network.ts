import { PUBLIC_TESTNET } from "@/lib/public-testnet";

const configuredChainId = Number(
  process.env.NEXT_PUBLIC_CHAIN_ID || PUBLIC_TESTNET.chainId
);

const isMainnet = configuredChainId === 56;

export const FORTUNE_NETWORK = {
  chainId: configuredChainId,
  chainHex: "0x" + configuredChainId.toString(16),
  chainName: isMainnet
    ? "BNB Smart Chain"
    : PUBLIC_TESTNET.chainName,
  nativeSymbol: isMainnet ? "BNB" : PUBLIC_TESTNET.nativeSymbol,
  explorerUrl: isMainnet
    ? "https://bscscan.com"
    : PUBLIC_TESTNET.explorerUrl,
  publicRpcUrl: isMainnet
    ? (process.env.NEXT_PUBLIC_BSC_RPC_URL ||
      "https://bsc-dataseed.bnbchain.org")
    : PUBLIC_TESTNET.rpcUrl,
  isMainnet,
  isTestnet: configuredChainId === PUBLIC_TESTNET.chainId,
  contracts: {
    factory:
      process.env.NEXT_PUBLIC_FORTUNE_FACTORY_ADDRESS ||
      (configuredChainId === PUBLIC_TESTNET.chainId
        ? PUBLIC_TESTNET.contracts.factory
        : ""),
    registry:
      process.env.NEXT_PUBLIC_FORTUNE_REGISTRY_ADDRESS ||
      (configuredChainId === PUBLIC_TESTNET.chainId
        ? PUBLIC_TESTNET.contracts.registry
        : ""),
    graduationAdapter:
      process.env.NEXT_PUBLIC_FORTUNE_GRADUATION_ADAPTER_ADDRESS ||
      (configuredChainId === PUBLIC_TESTNET.chainId
        ? PUBLIC_TESTNET.contracts.graduationAdapter
        : ""),
    liquidityLocker:
      process.env.NEXT_PUBLIC_FORTUNE_LIQUIDITY_LOCKER_ADDRESS ||
      (configuredChainId === PUBLIC_TESTNET.chainId
        ? PUBLIC_TESTNET.contracts.liquidityLocker
        : ""),
  },
  primaryQuote: {
    address:
      process.env.NEXT_PUBLIC_FORTUNE_PRIMARY_QUOTE_ADDRESS ||
      (configuredChainId === PUBLIC_TESTNET.chainId
        ? PUBLIC_TESTNET.contracts.mockQuote
        : ""),
    symbol:
      process.env.NEXT_PUBLIC_FORTUNE_PRIMARY_QUOTE_SYMBOL ||
      (configuredChainId === PUBLIC_TESTNET.chainId ? "fUSD" : ""),
    decimals: Number(
      process.env.NEXT_PUBLIC_FORTUNE_PRIMARY_QUOTE_DECIMALS || 18
    ),
  },
} as const;

export const FORTUNE_NETWORK_CONFIGURED =
  (FORTUNE_NETWORK.chainId === 56 ||
    FORTUNE_NETWORK.chainId === 97) &&
  Boolean(
    FORTUNE_NETWORK.contracts.factory &&
      FORTUNE_NETWORK.contracts.registry &&
      FORTUNE_NETWORK.contracts.graduationAdapter &&
      FORTUNE_NETWORK.contracts.liquidityLocker &&
      FORTUNE_NETWORK.primaryQuote.address
  );
