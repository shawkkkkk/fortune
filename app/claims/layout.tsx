import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Claim creator fees",
  description:
    "Claim creator fees that Fortune launches route to your wallet or your X, GitHub, TikTok, Telegram, YouTube, Farcaster, Bluesky, Weibo, Bilibili or WeChat Official Account. Verify once, claim across every launch.",
  alternates: { canonical: "/claims" },
};

export default function ClaimsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
