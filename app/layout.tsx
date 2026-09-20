import type { Metadata } from "next";
import "@/app/globals.css";
import Header from "@/components/Header";
import { LanguageProvider } from "@/components/LanguageProvider";

export const metadata: Metadata = {
  title: "Fortune — Launch against anything",
  description: "A configurable BNB Chain launch protocol with multi-asset basket curves."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <LanguageProvider>
          <Header />
          {children}
        </LanguageProvider>
      </body>
    </html>
  );
}
