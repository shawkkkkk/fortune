# fortunepad.fun cutover

The domain is managed at Squarespace. The Vercel project is `hoque-industries/fortune`.
This change must merge only after the domain is attached to that project and HTTPS works.
Until then the production canonical URL remains `https://fortune-rho-snowy.vercel.app`.

1. Add `fortunepad.fun` to the Vercel project's Domains settings. Also add `www.fortunepad.fun` as a redirect to the apex domain. Keep the existing Vercel deployment URL while validating.
2. In Squarespace DNS, set the apex A record and the `www` CNAME to the **exact values shown by this project's Vercel Domains screen**. Remove only conflicting `@`/`www` web records; preserve email and other unrelated records. If Vercel asks for a TXT ownership record, add that exact value too.
3. Wait for both entries to show valid configuration and for Vercel to issue the HTTPS certificate. Confirm the apex loads over HTTPS and `www` redirects to it. If a `NEXT_PUBLIC_SITE_URL` Vercel environment variable is present, set it to `https://fortunepad.fun` for production and redeploy.
4. Merge the domain cutover and wait for the production deployment to reach READY. Verify `/`, `/launch`, `/status`, `/api/public/v1/release`, `/robots.txt`, and `/sitemap.xml` at the new origin. Check that the homepage canonical URL and Open Graph image use `https://fortunepad.fun`, the social image loads, and the release API still reports mainnet blocked. Run `FORTUNE_BASE_URL=https://fortunepad.fun NEXT_PUBLIC_SITE_URL=https://fortunepad.fun npm run smoke:release` from an environment with HTTPS access.

DNS ownership and web deployment are separate from authorization to deploy contracts. No mainnet release gate changes during this cutover.
