# Web security remediation — October 27, 2026

The production dependency gate failed in [mainnet-readiness run 40535152363](https://github.com/shawkkkkk/fortune/actions/runs/40535152363) at main `2556a447adc31a9804ed417b75ae857487429aed`. npm reported three vulnerable production packages: Next.js (critical), sharp (high) and source-map-js (high). A passing frontend build or Vercel deployment does not clear this failure.

## Active source hardening

The token-share artwork reader previously trusted a PNG/JPEG MIME header and buffered the entire response before applying its byte limit. It now streams through a 1.5 MB byte budget and a bounded chunk count, cancels rejected/oversized bodies, and requires a matching PNG/JPEG signature before returning a data URI. SVG/HTML disguised by a raster MIME header is rejected. The existing fixed IPFS gateway, redirect refusal, three-second timeout and monogram fallback are preserved. The approved frontend style and Standard contracts are unchanged.

This narrows input and memory-exhaustion paths. A magic-byte check is not a full safe-image decoder or a substitute for patched dependencies. No exploit was run against Fortune, and this change does not establish that every advisory is unreachable.

## Promoted dependency refresh

The root `package.json` and `package-lock.json` now use the tested versions from `security/web-runtime`:

| Package | Proposed version | Evidence |
| --- | --- | --- |
| Next.js | 16.4.3 | Current npm remediation target in the failed gate; tested as a complete runtime, rather than mixing Next versions |
| sharp | 0.35.5 | Explicit override across the graph; [vendor advisory](https://github.com/advisories/GHSA-wq5f-xc86-pv6w) identifies this patched version |
| source-map-js | 1.2.2 | Explicit override across the graph; [advisory](https://github.com/advisories/GHSA-68fv-2mgg-jv7q) identifies this patched version |

The [critical next/og advisory](https://github.com/advisories/GHSA-vcvr-r3jv-pc5j) identifies 16.3.6 as its fix, but the gate listed additional Next advisories. This proposal tests 16.4.3 against the full current production audit rather than assuming the one-advisory minimum fixes all findings. The advisories were checked October 27, 2026. Package findings and conditional exploitability are different facts: the next/og advisory specifically describes attacker-controlled SVG content/attributes/styles in Node ImageResponse. Fortune uses ImageResponse for share images; the new raster checks are defense in depth and do not waive the package gate.

The root production audit now reports zero findings at high severity or above. Fortune also bundles licensed Fraunces and Plus Jakarta Sans variable fonts locally, so the production build no longer fetches Google Fonts. This changes the source candidate and its 63-file fingerprint. It is not a deployment, an accepted audit baseline, or mainnet approval. Any running Vercel deployment must be checked separately after this source is deployed.

## Reproducible isolated verification

`scripts/check-web-security-candidate.mjs` archives the staged git tree into a disposable directory, substitutes only the two candidate dependency files there, and runs a clean install, production npm audit, all web tests, production build, eight runtime smoke checks, and desktop/mobile creator/catalog/planner browser flows. It fixes the build to testnet with mainnet UI disabled, performs no wallet operations and verifies the original tracked source files did not change. The result includes the source commit/tree and explicitly reports `deployed: false` and `mainnetApproved: false`.

Stage intended source files before a local run; otherwise the archive intentionally omits unstaged changes. Provide an isolated Playwright module with a working Chromium installation:

```bash
FORTUNE_PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs FORTUNE_SECURITY_REPORT_DIR=.tmp/web-security-candidate node scripts/check-web-security-candidate.mjs
```

The dedicated **Patched Web Dependency Candidate** workflow performs the same checks without secrets and retains the audit, verification result and browser screenshots. Its failure is not ignored. Normal root CI and mainnet-readiness gates continue to run independently; this candidate check never bypasses their pinned dependency rules. A zero-finding npm report is point-in-time registry evidence, not a smart-contract audit or proof that no vulnerabilities exist.

## Release boundary

The owner authorized completing the repository and mainnet preparation, including repository changes and PR merge. The new source still needs a reviewed candidate fingerprint and evidence bound to that exact source before mainnet deployment. Do not edit a gate to accept new hashes or copy old audit/governance approval onto this candidate. The prior commit remains available for comparison.

The current local source passed `npm audit --omit=dev --audit-level=high`, the 268 web tests (266 passed, two skipped), production build, eight route smoke test, and desktop/mobile creator and catalog browser flows. These local checks do not establish that the deployed runtime is patched. Mainnet contract deployment and activation remain blocked independently by audit, legal, governance, infrastructure and operator evidence. No credentials or signatures are requested by the isolated verification tool.
