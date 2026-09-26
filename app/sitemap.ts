import type { MetadataRoute } from "next";

import { universePageIds } from "@/lib/pair-universe";
import { FORTUNE_SITE_URL } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const routes = [
    "/",
    "/explore",
    "/search",
    "/markets",
    "/assets",
    "/portfolio",
    "/launch",
    "/launch/custom",
    "/testnet",
    "/burns",
    "/rewards",
    "/stats",
    "/docs",
    "/status",
    "/developers",
  ];

  const pages: MetadataRoute.Sitemap = routes.map((route) => ({
    url: FORTUNE_SITE_URL + route,
    changeFrequency: route === "/status" ? "hourly" : "daily",
    priority: route === "/" ? 1 : route === "/testnet" ? 0.9 : 0.7,
  }));
  // One page per verified BNB Chain pair asset (tokenized stocks, gold, crypto).
  const assets: MetadataRoute.Sitemap = universePageIds().map((id) => ({
    url: `${FORTUNE_SITE_URL}/assets/${id}`,
    changeFrequency: "daily",
    priority: 0.5,
  }));
  return [...pages, ...assets];
}
