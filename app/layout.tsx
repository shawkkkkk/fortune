import type { Metadata } from "next";
import "@/app/globals.css";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { LanguageProvider } from "@/components/LanguageProvider";
import { ThemeProvider } from "@/components/ThemeProvider";
import { FORTUNE_NETWORK } from "@/lib/fortune-network";
import { FORTUNE_SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  metadataBase: new URL(FORTUNE_SITE_URL),
  alternates: {
    canonical: "/",
  },
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
  openGraph: {
    type: "website",
    url: FORTUNE_SITE_URL,
    siteName: "Fortune",
    title: FORTUNE_NETWORK.isMainnet
      ? "Fortune — Launch on BNB Smart Chain"
      : "Fortune — Public Alpha on BSC Testnet",
    description: "Meme coins, paired with the BNB economy. No dumping, pair-asset holder rewards in research, and an expanding approved pair universe.",
    images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: "Fortune lucky cat and the BNB economy" }],
  },
  twitter: {
    card: "summary_large_image",
    title: FORTUNE_NETWORK.isMainnet
      ? "Fortune — Launch on BNB Smart Chain"
      : "Fortune — Public Alpha on BSC Testnet",
    description: "Meme coins, paired with the BNB economy. Standard is in public testnet alpha; Burn + Rewards v2 is in research.",
    images: ["/opengraph-image"],
  },
  robots: {
    index: true,
    follow: true,
  },
  icons: {
    icon: "/icon.svg",
    apple: "/apple-icon",
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
