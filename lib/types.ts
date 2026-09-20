export type AssetCategory =
  | "Majors"
  | "BNB Chain"
  | "Stablecoins"
  | "xStocks"
  | "China Stocks"
  | "NASDAQ Penny Stocks"
  | "PreStocks"
  | "RWAs"
  | "DeFi"
  | "Memes"
  | "BSC 400"
  | "Custom";

export type AssetCapability = "quote" | "reward" | "graduation";

export type FortuneAsset = {
  id: string;
  symbol: string;
  name: string;
  category: AssetCategory;
  icon: string;
  chain: "BSC" | "Solana" | "Other";
  verification: "Canonical" | "Verified" | "Provider Verified" | "Approved" | "Unverified" | "Unavailable";
  capabilities: AssetCapability[];
  address?: string;
  note?: string;
};

export type FeeRoute = {
  label: string;
  bps: number;
  destination: "creator" | "holders" | "buyback" | "liquidity" | "treasury" | "protocol";
  rewardAsset?: string;
};

export type LaunchStatus = "Curve" | "Graduating" | "Graduated";

export type FortuneLaunch = {
  id: string;
  name: string;
  symbol: string;
  description: string;
  creator: string;
  status: LaunchStatus;
  quoteAssets: string[];
  primaryQuote: string;
  rewardAsset?: string;
  marketCap: number;
  volume24h: number;
  graduationProgress: number;
  creatorFeeBps: number;
  holderRewardBps: number;
  launchedAt: string;
};
