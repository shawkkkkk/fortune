# fortunepad.fun cutover

The domain is managed at Squarespace. The authenticated Vercel project is `hoque-industries/fortune` (`prj_QwYhAacsiUZe6B6uuWL79mYu0gZG`).

## Verified pre-merge state — 2026-10-04

- Vercel lists both `fortunepad.fun` and `www.fortunepad.fun` on the Fortune project with `verified: true`.
- Vercel configures `www.fortunepad.fun` as an HTTP 308 redirect to `fortunepad.fun`.
- The apex loads over HTTPS, and a public navigation to the `www` hostname lands at `https://fortunepad.fun/`.
- Production `NEXT_PUBLIC_SITE_URL` is `https://fortunepad.fun`.
- The public homepage canonical URL and Open Graph image use `https://fortunepad.fun`; `/`, `/launch`, and `/status` load from the apex, and the official X link remains `https://x.com/fortunepad`.
- Main `8fa46ded9fa3ee866a52f02518c2c859ce2226dd` has READY production deployment `dpl_5C8jDun99khriPJdTMr6y7kk4cmW`.

The attachment, DNS verification, HTTPS, redirect, and production site URL prerequisites are therefore complete. Do not replace the working Squarespace DNS records. This PR changes repository defaults and monitoring to match the already verified custom domain; it does not authorize a contract deployment or mainnet activation.

## Remaining merge and post-merge verification

1. Merge the domain cutover and wait for the production deployment to reach READY.
2. Verify `/`, `/launch`, `/status`, `/api/public/v1/release`, `/robots.txt`, and `/sitemap.xml` at the new origin. Confirm the release API still reports mainnet blocked.
3. Run `FORTUNE_BASE_URL=https://fortunepad.fun NEXT_PUBLIC_SITE_URL=https://fortunepad.fun FORTUNE_REQUIRE_READY=true FORTUNE_REQUIRE_ONCHAIN=true npm run smoke:release` from an environment with HTTPS access.
4. If the GitHub repository variable `FORTUNE_PUBLIC_SITE_URL` exists, update it to `https://fortunepad.fun`; otherwise the monitor's new default applies.
5. Run the Public Site Monitor and retain its artifact. Confirm the canonical URL, social image, and official X link remain correct.

DNS ownership and web deployment are separate from authorization to deploy contracts. No mainnet release gate changes during this cutover.
