import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Custom pair launch",
  description: "Launch a Fortune token paired with any BEP-20, including tokenized stocks and transfer-tax tokens. Unaudited beta on BSC Testnet.",
  alternates: { canonical: "/launch/custom" },
};

export default function CustomPairLaunchLayout({ children }: { children: React.ReactNode }) {
  return children;
}
