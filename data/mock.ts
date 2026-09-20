import type { FortuneLaunch } from "@/lib/types";

export const launches: FortuneLaunch[] = [
  {
    id: "1",
    name: "Banana Capital",
    symbol: "BANANA",
    description: "BNB-native meme market with a three-asset graduation basket.",
    creator: "0x8d2a...91F2",
    status: "Curve",
    quoteAssets: ["BNB", "USDT", "CAKE"],
    primaryQuote: "BNB",
    rewardAsset: "CAKE",
    marketCap: 438200,
    volume24h: 94820,
    graduationProgress: 78,
    creatorFeeBps: 25,
    holderRewardBps: 25,
    launchedAt: "18m"
  },
  {
    id: "2",
    name: "Chip Stack",
    symbol: "CHIP",
    description: "Tech-basket launch paired with BNB, USDT and tokenized equity markets.",
    creator: "0x1f0b...60A9",
    status: "Graduating",
    quoteAssets: ["BNB", "USDT", "NVDAx", "QQQx"],
    primaryQuote: "USDT",
    rewardAsset: "BNB",
    marketCap: 1120000,
    volume24h: 312400,
    graduationProgress: 98,
    creatorFeeBps: 20,
    holderRewardBps: 30,
    launchedAt: "2h"
  },
  {
    id: "3",
    name: "Gold Rush",
    symbol: "RUSH",
    description: "RWA-themed launch with a fixed BNB / USDT / XAUT basket.",
    creator: "0x7721...B441",
    status: "Graduated",
    quoteAssets: ["BNB", "USDT", "XAUT"],
    primaryQuote: "BNB",
    rewardAsset: "USDT",
    marketCap: 2840000,
    volume24h: 527900,
    graduationProgress: 100,
    creatorFeeBps: 15,
    holderRewardBps: 35,
    launchedAt: "1d"
  },
  {
    id: "4",
    name: "Cakewalk",
    symbol: "WALK",
    description: "Simple BNB / CAKE launch with automatic LP reinforcement.",
    creator: "0xc310...72d0",
    status: "Curve",
    quoteAssets: ["BNB", "CAKE"],
    primaryQuote: "BNB",
    marketCap: 196000,
    volume24h: 44200,
    graduationProgress: 44,
    creatorFeeBps: 10,
    holderRewardBps: 0,
    launchedAt: "37m"
  }
];

export const analytics = {
  volume24h: 12840000,
  launches24h: 286,
  graduations24h: 31,
  uniqueCreators: 4842,
  totalLiquidity: 21600000,
  basketReserves: 7920000,
  rewardsDistributed: 1184000,
  buybacks: 624000,
  protocolRevenue: 278000
};

export const automations = [
  { name: "Holder rewards", status: "Healthy", detail: "Batch distributions every 15 minutes", amount: "$1.18M distributed" },
  { name: "Buyback & burn", status: "Healthy", detail: "Executes when vault threshold is reached", amount: "$624K routed" },
  { name: "Liquidity reinforcement", status: "Healthy", detail: "Adds depth to graduated Fortune pools", amount: "$2.04M reinforced" },
  { name: "Graduation queue", status: "Running", detail: "3 launches awaiting finalization", amount: "3 pending" },
  { name: "Oracle freshness", status: "Healthy", detail: "Registry assets checked against configured feeds", amount: "99.98% fresh" },
  { name: "Failed actions", status: "Clear", detail: "Retriable execution queue", amount: "0 unresolved" }
];
