import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Fortune",
    short_name: "Fortune",
    description:
      "Meme coins, paired with the BNB economy.",
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
