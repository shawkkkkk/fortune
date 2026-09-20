# Fortune Public Alpha Launch Runbook

This runbook is for the BSC Testnet public alpha only. It does not authorize BSC mainnet activation.

## Release source of truth

- Network: BNB Smart Chain Testnet, chain ID 97.
- Published contract addresses: `lib/public-testnet.ts`.
- Human-readable deployment proof: `docs/PUBLIC_TESTNET.md`.
- Public user path: `/testnet`.
- Runtime health: `/api/health`.
- Full stack readiness: `/api/ready`.

The website config is the canonical list consumed by the live verifier. Do not keep a second hand-maintained set of Fortune deployment addresses in release workflows.

## Go-live gates

A public-alpha release is considered deployable only when all of the following are true:

1. Fortune CI passes the Next.js production build.
2. The built production server boots successfully.
3. The release smoke test passes `/api/health`, `/api/public/v1/meta`, `/testnet`, and `/launch`.
4. The Foundry suite passes with 1,000 fuzz runs.
5. `/api/ready` reports the entire published testnet stack has bytecode and at least one healthy RPC.
6. The live-stack verifier confirms both standard and tax-token bounded lifecycles.
7. The standard V3 LP NFT and tax-token V2 LP are permanently locked.
8. Mainnet remains disabled.

## User recovery rules

The chain is authoritative. A browser/RPC refresh failure must never be interpreted as a failed transaction by itself.

The `/testnet` page therefore:

- tracks the most recent submitted transaction as pending, confirmed, or unknown;
- links directly to BscScan;
- saves up to 10 public launch records in local browser storage;
- lets the tester restore a saved token/curve lifecycle after refresh;
- exposes a copyable diagnostic packet containing public addresses and transaction state only.

Never ask a tester for a seed phrase, private key, wallet backup, or API secret.

## Incident triage

When a tester reports a problem:

1. Check the transaction hash on BscScan first.
2. If BscScan shows success, do not ask the user to resubmit solely because the UI failed to refresh.
3. Check `/api/ready`.
4. If readiness is degraded or unavailable, treat the problem as infrastructure until chain state proves otherwise.
5. For a confirmed launch, recover the saved token/curve and continue from the next lifecycle action.
6. For a confirmed graduation, verify the pool and LP lock before any retry.
7. Use the diagnostic packet and public testnet bug template for reproducible UI/RPC failures.
8. Move potentially exploitable findings to private security reporting.

## Rollback posture

The public alpha is a testnet release. If the web release is broken, roll back the website to the latest production artifact that passed the release smoke gate. Do not redeploy contracts merely to repair a frontend incident.

If the published contract stack itself fails readiness or lifecycle verification, stop directing new testers to create launches until the failure is understood. Existing confirmed launches remain onchain and should be recovered from their public addresses.

## Mainnet boundary

Mainnet remains governed by `docs/MAINNET_RELEASE.md`. Public-alpha success does not waive independent security, economic/MEV, governance, monitoring, legal/compliance, or production-asset review.
