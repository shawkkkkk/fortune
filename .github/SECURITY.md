# Security reporting

Fortune's public alpha runs on BNB Smart Chain Testnet with valueless test assets. The repository remains pre-audit and mainnet activation is separately gated.

For an ordinary reproducible testnet bug, use the **Public testnet bug** issue template and include the diagnostic packet from the `/testnet` page when possible.

For a potentially exploitable security issue:

1. Do **not** post exploit details, private keys, seed phrases, API secrets, or active attack instructions in a public issue.
2. Prefer GitHub's private vulnerability reporting / Security Advisory flow for this repository when it is available.
3. If private reporting is unavailable, open a minimal public issue stating only that you need a private security contact. Do not include the exploit details.
4. Include affected contract addresses and testnet transaction hashes only after a private reporting channel is established.

A passing test suite, lifecycle drill, or public-alpha verification is evidence of tested behavior; it is not an independent security audit.
