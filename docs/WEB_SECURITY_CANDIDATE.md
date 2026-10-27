# Web security remediation candidate — October 27, 2026

The production dependency gate failed in [mainnet-readiness run 40535152363](https://github.com/shawkkkkk/fortune/actions/runs/40535152363) at main `2556a447adc31a9804ed417b75ae857487429aed`. npm reported three vulnerable production packages: Next.js (critical), sharp (high) and source-map-js (high). A passing frontend build or Vercel deployment does not clear this failure.

## Active source hardening

The token-share artwork reader previously trusted a PNG/JPEG MIME header and buffered the entire response before applying its byte limit. It now streams through a 1.5 MB byte budget and a bounded chunk count, cancels rejected/oversized bodies, and requires a matching PNG/JPEG signature before returning a data URI. SVG/HTML disguised by a raster MIME header is rejected. The existing fixed IPFS gateway, redirect refusal, three-second timeout and monogram fallback are preserved. The approved frontend style and Standard contracts are unchanged.

This narrows input and memory-exhaustion paths. A magic-byte check is not a full safe-image decoder or a substitute for patched dependencies. No exploit was run against Fortune, and this change does not establish that every advisory is unreachable.

## Proposed dependency refresh (not applied to the frozen baseline)

`security/web-runtime/package.json` and `package-lock.json` contain the concrete proposed web dependency set:

| Package | Proposed version | Evidence |
| --- | --- | --- |
| Next.js | 16.4.3 | Current npm remediation target in the failed gate; tested as a complete runtime, rather than mixing Next versions |
| sharp | 0.35.5 | Explicit override across the graph; [vendor advisory](https://github.com/advisories/GHSA-wq5f-xc86-pv6w) identifies this patched version |
| source-map-js | 1.2.2 | Explicit override across the graph; [advisory](https://github.com/advisories/GHSA-68fv-2mgg-jv7q) identifies this patched version |

The [critical next/og advisory](https://github.com/advisories/GHSA-vcvr-r3jv-pc5j) identifies 16.3.6 as its fix, but the gate listed additional Next advisories. This proposal tests 16.4.3 against the full current production audit rather than assuming the one-advisory minimum fixes all findings. The advisories were checked October 27, 2026. Package findings and conditional exploitability are different facts: the next/og advisory specifically describes attacker-controlled SVG content/attributes/styles in Node ImageResponse. Fortune uses ImageResponse for share images; the new raster checks are defense in depth and do not waive the package gate.

Root `package.json`, root `package-lock.json`, release/dependency manifests and the frozen 63-file Standard fingerprint are **unchanged**. The root and deployed dependency audit therefore remain unresolved by merely merging this candidate. Vercel continues to use the root dependency set. The proposed files are not a deployment, automatic promotion, accepted new release fingerprint or mainnet approval.

## Reproducible isolated verification

`scripts/check-web-security-candidate.mjs` archives the staged git tree into a disposable directory, substitutes only the two candidate dependency files there, and runs a clean install, production npm audit, all web tests, production build, eight runtime smoke checks, and desktop/mobile creator/catalog/planner browser flows. It fixes the build to testnet with mainnet UI disabled, performs no wallet operations and verifies the original tracked source files did not change. The result includes the source commit/tree and explicitly reports `deployed: false` and `mainnetApproved: false`.

Stage intended source files before a local run; otherwise the archive intentionally omits unstaged changes. Provide an isolated Playwright module with a working Chromium installation:

```bash
FORTUNE_PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs FORTUNE_SECURITY_REPORT_DIR=.tmp/web-security-candidate node scripts/check-web-security-candidate.mjs
```

The dedicated **Patched Web Dependency Candidate** workflow performs the same checks without secrets and retains the audit, verification result and browser screenshots. Its failure is not ignored. Normal root CI and mainnet-readiness gates continue to run independently; this candidate check never bypasses their pinned dependency rules. A zero-finding npm report is point-in-time registry evidence, not a smart-contract audit or proof that no vulnerabilities exist.

## Release-owner action

Review the exact candidate dependency files and isolated verification evidence, then explicitly authorize replacing the web dependency baseline. Applying those two files at the root changes the frozen fingerprint and requires recording a **new** reviewed candidate, rerunning dependency/release/build/runtime/browser checks, and updating all evidence that is bound to the old dependency fingerprint. Do not edit a gate to accept the new hashes or copy old audit/governance approval onto the new candidate. Keep the old frozen candidate available unchanged for comparison.

Until that rebaseline is authorized and verified, do not call the deployed runtime patched or the production-dependency gate passed. Mainnet contract deployment/activation remain blocked independently by audit, legal, governance, infrastructure and operator evidence. No credentials or signatures are requested by the isolated verification tool.
