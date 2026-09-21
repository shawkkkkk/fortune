import type { MetadataRoute } from "next";

import { FORTUNE_SITE_URL } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/"],
    },
    sitemap: FORTUNE_SITE_URL + "/sitemap.xml",
    host: FORTUNE_SITE_URL,
  };
}
