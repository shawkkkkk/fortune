# Fortune Public BSC Testnet Alpha

Fortune's public testnet is the open validation phase before any production/mainnet launch.

**Network:** BNB Smart Chain Testnet  
**Chain ID:** 97  
**Gas token:** tBNB  
**Explorer:** https://testnet.bscscan.com  
**Official BNB testnet faucet:** https://www.bnbchain.org/en/testnet-faucet

tBNB and Fortune's mock fUSD are test assets and have no intended financial value.

## Public alpha deployment

- FortuneFactory: `0x9Eac6c6CdA0A19cbb0f8Abc51Ee968545E6EB415`
- FortuneAssetRegistry: `0x943176d26A332F4687d52695fe9625866c2c3A67`
- FortunePancakeV3GraduationAdapter: `0xF666487e58dEFB8584C7eAa2378DEe1BbAbe012C`
- FortunePermanentLiquidityLocker: `0x861Deb497eA845dda8727B11462d11Abe34E2AE8`
- Fortune mock fUSD: `0x871356a53Dd988EFDAa82261c9d212Ac08988fd0`
- Reference graduated token: `0xC27aF82E8A228a0167FbE1673CaD13cD35Ee16Fe`
- Reference curve: `0x5E7967bde6286aE030bFd45FbB8650df221F22e9`
- Reference Pancake V3 pool: `0x5c9fAB9ee5286fE5c071Bd547f9B308a550FA50f`
- Reference locked LP NFT: `37496`

Pancake V3 BSC Testnet references used by the adapter:

- PancakeV3Factory: `0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865`
- NonfungiblePositionManager: `0x427bF5b37357632377eCbEC9de3626C71A5396c1`

## Release evidence

GitHub Actions run `35526356782` completed successfully on 2026-09-20.

The release drill verified:

- 39/39 Foundry tests passed with 1,000 fuzz runs;
- the existing real BSC Testnet graduation passed all 16 state/invariant checks before the load run;
- the Fortune web application built and reported ready against live BSC Testnet;
- readiness dependency smoke checks passed before the load run;
- three additional real BSC Testnet Pancake graduation cycles completed while the HTTP storm was active;
- the HTTP storm completed 7,500/7,500 requests successfully:
  - 50 concurrent / 500 requests: p95 196 ms;
  - 200 concurrent / 2,000 requests: p95 391 ms;
  - 500 concurrent / 5,000 requests: p95 935 ms;
- the release p95 gate was 2,500 ms and success floor was 99.5%;
- post-storm readiness checks passed;
- the reference graduation again passed all 16 state/invariant checks after the storm.

This evidence supports opening a **public testnet alpha**. It is not a smart-contract audit and does not establish mainnet safety.

## How testers use the alpha

Open `/testnet` in the Fortune web app.

1. Connect an injected EVM wallet and switch to BSC Testnet.
2. Obtain a small amount of tBNB from the BNB Chain testnet faucet for gas.
3. Use Fortune's in-app faucet to mint 250 mock fUSD.
4. Create a test launch. The alpha uses a 1 billion fixed supply, one fUSD quote market, a tiny mock-$1 graduation threshold, and the tested Fee Matrix.
5. Approve and buy 250 fUSD on the launch curve.
6. Once the curve reaches `GraduationReady`, call the permissionless finalize action.
7. Verify the resulting transaction and contract addresses through BscScan.

The alpha page deliberately keeps this path narrow. The larger launch-builder surface contains experimental asset/engine concepts that are not all enabled on the public testnet registry.

## Reporting problems

Use the repository's **Public testnet bug** issue template for reproducible non-sensitive bugs. Include a testnet transaction hash when possible.

Never put a seed phrase, private key, wallet backup, API secret, or other credential in a GitHub issue.

Potentially exploitable security findings should not be posted publicly.

## Deferred capacity ladder

The repository also contains the **Fortune Concurrent Graduation Wave** workflow for later 10 → 25 → 50 → 100 concurrent-graduation testing. That exercise is useful for capacity characterization but is not a blocker for opening the current public testnet alpha.

## Mainnet remains separately gated

A green public alpha does not enable mainnet. Mainnet still requires, at minimum:

1. independent smart-contract/security review;
2. economic and MEV review;
3. production oracle and asset-policy review;
4. production deployment/key/multisig controls;
5. monitoring, alerting, and incident procedures;
6. verified production contracts and reproducible deployment records;
7. legal/compliance review where applicable.
