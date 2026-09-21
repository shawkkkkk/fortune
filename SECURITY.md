# Security Policy

Fortune handles smart-contract and wallet interactions, so potentially exploitable findings should not be posted in a public issue before they are triaged.

## Reporting a vulnerability

Use GitHub's private vulnerability reporting flow under the repository's **Security** tab when it is enabled. Include:

- affected commit or deployment;
- affected contract / route;
- reproduction steps;
- expected impact;
- testnet transaction hashes where useful.

Do not include seed phrases, private keys, wallet backups, RPC credentials, API secrets, or other credentials.

If private vulnerability reporting is not available, do not publish exploit details in a normal GitHub issue. Contact the repository owner through a private channel and provide only enough non-sensitive information to establish contact.

## Public bugs

Non-sensitive BSC Testnet bugs can use the repository's **Public testnet bug** issue template.

## Mainnet status

A successful public testnet run is not equivalent to a security audit. Mainnet activation remains gated by `mainnet-release.json`, independent review, governance handoff, production monitoring, and the release process in `docs/MAINNET_READINESS.md`.
