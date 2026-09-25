import type { Metadata, Viewport } from "next";
import { Fraunces, Plus_Jakarta_Sans } from "next/font/google";
import "@/app/globals.css";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import ScrollRevealRoot from "@/components/ScrollReveal";
import { LanguageProvider } from "@/components/LanguageProvider";
import { ThemeProvider } from "@/components/ThemeProvider";
import { FORTUNE_NETWORK } from "@/lib/fortune-network";
import { FORTUNE_SITE_URL } from "@/lib/site";

// next/font downloads these at build time and serves them from Fortune's own
// origin; no browser request reaches a font CDN.
const displayFont = Fraunces({
  subsets: ["latin"],
  axes: ["SOFT", "opsz"],
  display: "swap",
  variable: "--font-fraunces",
});

const sansFont = Plus_Jakarta_Sans({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-jakarta",
});

// Apply a stored dark preference before first paint to avoid a light flash.
const themeScript =
  'try{var t=localStorage.getItem("fortune-theme");if(t==="dark"||t==="light"){document.documentElement.dataset.theme=t;document.documentElement.style.colorScheme=t}}catch(e){}';

// Enable scroll-reveal hiding only when it can be undone: JavaScript runs,
// IntersectionObserver exists and the visitor has not asked for reduced
// motion. If the reveal observer has not started within 3.5s, show everything.
const motionScript =
  'try{var d=document.documentElement;if("IntersectionObserver"in window&&!matchMedia("(prefers-reduced-motion: reduce)").matches){d.dataset.motion="on";setTimeout(function(){if(!window.__fortuneReveal)delete d.dataset.motion},3500)}}catch(e){}';

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

export const viewport: Viewport = {
  themeColor: "#b80d15",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      data-theme="light"
      className={displayFont.variable + " " + sansFont.variable}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <script dangerouslySetInnerHTML={{ __html: motionScript }} />
      </head>
      <body>
        <ThemeProvider>
          <LanguageProvider>
            <Header />
            {children}
            <Footer />
            <ScrollRevealRoot />
          </LanguageProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
