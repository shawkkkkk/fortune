import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Stock Rewards launch",
  description: "Launch a Fortune token paired with up to five tokenized stocks. Holders earn every one of them, claimable onchain at any time. Unaudited beta on BSC Testnet.",
  alternates: { canonical: "/launch/stock-rewards" },
};

export default function StockRewardsLaunchLayout({ children }: { children: React.ReactNode }) {
  return children;
}
