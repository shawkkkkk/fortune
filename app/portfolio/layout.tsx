import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Portfolio",
  description: "Every Fortune token in a wallet, read from BNB Chain and valued at live curve or pool prices.",
  alternates: { canonical: "/portfolio" },
};

export default function PortfolioLayout({ children }: { children: ReactNode }) {
  return children;
}
