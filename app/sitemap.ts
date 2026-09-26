import type { MetadataRoute } from "next";

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
    "/testnet",
    "/burns",
    "/rewards",
    "/stats",
    "/docs",
    "/status",
    "/developers",
  ];

  return routes.map((route) => ({
    url: FORTUNE_SITE_URL + route,
    changeFrequency: route === "/status" ? "hourly" : "daily",
    priority: route === "/" ? 1 : route === "/testnet" ? 0.9 : 0.7,
  }));
}
