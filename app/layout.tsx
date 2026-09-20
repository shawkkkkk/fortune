import type { Metadata } from "next";
import "@/app/globals.css";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { LanguageProvider } from "@/components/LanguageProvider";
import { ThemeProvider } from "@/components/ThemeProvider";
import { FORTUNE_NETWORK } from "@/lib/fortune-network";

export const metadata: Metadata = {
  title: {
    default: FORTUNE_NETWORK.isMainnet
      ? "Fortune — Launch on BNB Smart Chain"
      : "Fortune — Public Alpha on BSC Testnet",
    template: "%s · Fortune",
  },
  description: FORTUNE_NETWORK.isMainnet
    ? "Fortune is a non-custodial token launch protocol on BNB Smart Chain."
    : "Fortune is a non-custodial launch protocol running a public alpha on BNB Smart Chain Testnet.",
  applicationName: "Fortune",
  icons: {
    icon: "/icon.svg",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="light">
      <body>
        <ThemeProvider>
          <LanguageProvider>
            <Header />
            {children}
            <Footer />
          </LanguageProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
