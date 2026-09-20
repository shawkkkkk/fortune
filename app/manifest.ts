import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Fortune Public Alpha",
    short_name: "Fortune",
    description:
      "Fortune public alpha on BNB Smart Chain Testnet.",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#e1262f",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
      },
    ],
  };
}
