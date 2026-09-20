import type { FortuneAsset } from "@/lib/types";

export const assets: FortuneAsset[] = [
  { id: "bnb", symbol: "BNB", name: "BNB", category: "Majors", icon: "BNB", chain: "BSC", verification: "Canonical", capabilities: ["quote", "reward", "graduation"], note: "Native BNB; wrapped internally when an ERC-20 interface is required." },
  { id: "usdt", symbol: "USDT", name: "Tether USD", category: "Stablecoins", icon: "$", chain: "BSC", verification: "Verified", capabilities: ["quote", "reward", "graduation"] },
  { id: "usdc", symbol: "USDC", name: "USD Coin", category: "Stablecoins", icon: "$", chain: "BSC", verification: "Verified", capabilities: ["quote", "reward", "graduation"] },
  { id: "btcb", symbol: "BTCB", name: "Binance-Peg BTCB", category: "Majors", icon: "₿", chain: "BSC", verification: "Verified", capabilities: ["quote", "reward", "graduation"] },
  { id: "eth", symbol: "ETH", name: "Binance-Peg Ethereum", category: "Majors", icon: "Ξ", chain: "BSC", verification: "Verified", capabilities: ["quote", "reward", "graduation"] },
  { id: "cake", symbol: "CAKE", name: "PancakeSwap", category: "DeFi", icon: "C", chain: "BSC", verification: "Verified", capabilities: ["quote", "reward", "graduation"] },
  { id: "fdusd", symbol: "FDUSD", name: "First Digital USD", category: "Stablecoins", icon: "$", chain: "BSC", verification: "Approved", capabilities: ["quote", "reward", "graduation"] },
  { id: "xaut", symbol: "XAUT", name: "Tether Gold", category: "RWAs", icon: "Au", chain: "BSC", verification: "Approved", capabilities: ["quote", "reward", "graduation"], note: "Enable only after registry verification of the exact BSC contract and liquidity." },

  { id: "aaplx", symbol: "AAPLx", name: "Apple xStock", category: "xStocks", icon: "A", chain: "BSC", verification: "Approved", capabilities: ["quote", "reward", "graduation"], note: "Registry contract address must be verified against issuer deployment before activation." },
  { id: "tslax", symbol: "TSLAx", name: "Tesla xStock", category: "xStocks", icon: "T", chain: "BSC", verification: "Approved", capabilities: ["quote", "reward", "graduation"], note: "Registry contract address must be verified against issuer deployment before activation." },
  { id: "nvdax", symbol: "NVDAx", name: "NVIDIA xStock", category: "xStocks", icon: "N", chain: "BSC", verification: "Approved", capabilities: ["quote", "reward", "graduation"], note: "Registry contract address must be verified against issuer deployment before activation." },
  { id: "spyx", symbol: "SPYx", name: "SPDR S&P 500 xStock", category: "xStocks", icon: "S", chain: "BSC", verification: "Approved", capabilities: ["quote", "reward", "graduation"] },
  { id: "qqqx", symbol: "QQQx", name: "Invesco QQQ xStock", category: "xStocks", icon: "Q", chain: "BSC", verification: "Approved", capabilities: ["quote", "reward", "graduation"] },

  { id: "openai-pre", symbol: "OPENAI", name: "OpenAI PreStock", category: "PreStocks", icon: "O", chain: "Solana", verification: "Unavailable", capabilities: [], note: "Not pairable on Fortune until an official compatible BSC deployment exists." },
  { id: "anthropic-pre", symbol: "ANTHROPIC", name: "Anthropic PreStock", category: "PreStocks", icon: "AI", chain: "Solana", verification: "Unavailable", capabilities: [], note: "Not pairable on Fortune until an official compatible BSC deployment exists." },
  { id: "neuralink-pre", symbol: "NEURALINK", name: "Neuralink PreStock", category: "PreStocks", icon: "N", chain: "Solana", verification: "Unavailable", capabilities: [], note: "Not pairable on Fortune until an official compatible BSC deployment exists." },
  { id: "polymarket-pre", symbol: "POLYMARKET", name: "Polymarket PreStock", category: "PreStocks", icon: "P", chain: "Solana", verification: "Unavailable", capabilities: [], note: "Not pairable on Fortune until an official compatible BSC deployment exists." }
];

export const assetCategories = [
  "Majors",
  "BNB Chain",
  "Stablecoins",
  "xStocks",
  "PreStocks",
  "RWAs",
  "DeFi",
  "Memes",
  "BSC 400",
  "Custom",
] as const;
