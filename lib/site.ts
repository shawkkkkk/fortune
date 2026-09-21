export const FORTUNE_SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ||
  "https://fortune-rho-snowy.vercel.app"
).replace(/\/$/, "");
