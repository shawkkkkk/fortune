# Fortune Public BSC Testnet Alpha

Fortune's public testnet is the open validation phase before any production/mainnet launch.

**Network:** BNB Smart Chain Testnet  
**Chain ID:** 97  
**Gas token:** tBNB  
**Explorer:** https://testnet.bscscan.com  
**Official BNB testnet faucet:** https://www.bnbchain.org/en/testnet-faucet

tBNB and Fortune's mock fUSD are test assets and have no intended financial value.

## Current public alpha deployment

The website source of truth for these addresses is `lib/public-testnet.ts`.

### Core launch stack

- Standard FortuneFactory: `0x70641975E43c5807621146874022fd9d1b735AA1`
- Tax FortuneFactory: `0xB4510F1F134B0582298934fdFbCc77bECED8d0f5`
- FortuneAssetRegistry: `0x49eb59EB418b4552F56791ECe81338769e90fa19`
- FortunePoolRegistry: `0x7ac440219A1475Bdd0F1C88e1d4f8E1CA80Ecf35`
- Standard Pancake V3 graduation adapter: `0x474f13dF3179cE7f26b3b3344b3E74643f6ebe2F`
- Standard permanent V3 LP locker: `0xa502027AC3e7BF732ecce3108837837aC3559304`
- Tax-token Pancake V2 graduation adapter: `0xAA1B2d5ebB6A5f212E1b7bDCd975cf866b2739Fb`
- Tax-token permanent V2 LP locker: `0xB03ff39306449ab42bb8Af2CFF25B28B4E6E76e2`
- Fortune mock fUSD: `0x1bDcF1500866E273Cb11E99cC1832Aa2436Db17d`

### Verified standard lifecycle reference

- Token: `0xF2A934B924C50566eCAB90ea8D5644378237D9fE`
- Curve: `0xE768cc50dC03Bf9CF838953a4b76057D63D8995D`
- Pancake V3 pool: `0xB2B28583bE3A47D1E147d2C5E8624594Edf7FaA1`
- Permanently locked V3 LP NFT: `37523`

### Verified tax-token lifecycle reference

- Tax token: `0x586C005C7D82d2255Ee82Cbf3047743290e67Ffe`
- Tax curve: `0x16912134E11db9EbEE26E1259F3e67722c4Fbb18`
- Pancake V2 pair: `0xd5810cA5042154A756bd08E7702AE9945f977925`
- Tax processor: `0x398254722c7B8dC56F35e73E3F9A987025048E11`
- Holder dividend vault: `0x334fFbf0EFA8c7C3Bef587CA403E1f620FEDbe61`

### PancakeSwap BSC Testnet references

- Pancake V2 Factory: `0xB7926C0430Afb07AA7DEfDE6DA862aE0Bde767bc`
- Pancake V2 Router: `0x9ac64cc6e4415144c455bd8e4837fea55603e5c3`
- Pancake V3 Factory: `0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865`
- Pancake V3 NonfungiblePositionManager: `0x427bF5b37357632377eCbEC9de3626C71A5396c1`

## Final release verification

GitHub Actions run `35544366546` (**Fortune Verify Existing Public Alpha**) completed successfully on 2026-09-20 against the currently deployed BSC Testnet stack. It executed fresh standard and tax-token lifecycle proofs, required both completion markers, and published the newest reference addresses.

The verifier required all of the following before the release manifest was accepted:

- standard launch + creator first buy completed;
- standard Pancake V3 graduation completed;
- the V3 LP-position NFT is permanently locked;
- tax-token launch + creator first buy completed;
- Pancake V2 graduation completed with non-zero locked LP;
- a real post-graduation taxed sell completed;
- curve and DEX tax processing were non-zero;
- token burn processing was non-zero;
- at least one holder-dividend epoch was created;
- both `STANDARD_ONCHAIN_EXECUTION_COMPLETE_AND_SUCCESSFUL` and `TAX_ONCHAIN_EXECUTION_COMPLETE_AND_SUCCESSFUL` were emitted.

The latest proof recorded:

- standard token: `0xF2A934B924C50566eCAB90ea8D5644378237D9fE`;
- standard curve: `0xE768cc50dC03Bf9CF838953a4b76057D63D8995D`;
- standard Pancake V3 pool: `0xB2B28583bE3A47D1E147d2C5E8624594Edf7FaA1`;
- standard LP NFT: `37523`;
- tax token: `0x586C005C7D82d2255Ee82Cbf3047743290e67Ffe`;
- tax curve: `0x16912134E11db9EbEE26E1259F3e67722c4Fbb18`;
- tax Pancake V2 pair: `0xd5810cA5042154A756bd08E7702AE9945f977925`;
- tax processor: `0x398254722c7B8dC56F35e73E3F9A987025048E11`;
- holder dividend vault: `0x334fFbf0EFA8c7C3Bef587CA403E1f620FEDbe61`;
- locked V2 LP: `31622760790315255754`;
- curve tax recorded: `20618556701030927`;
- DEX tax tokens processed: `1499999250000000000`;
- tokens burned: `6892246585519629987`;
- dividend epochs: `1`.

The evidence artifact is `fortune-existing-public-alpha-verification` (artifact ID `10616740471`).

The verifier output is normalized before it reaches TypeScript configuration, and the publishing workflow explicitly refuses to commit generated dependency metadata or any file other than `lib/public-testnet.ts`.

## Load and reliability evidence

The earlier public-alpha release drill, GitHub Actions run `35526356782`, also completed successfully on 2026-09-20.

That drill verified:

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
3. Use Fortune's in-app faucet to mint mock fUSD.
4. Choose either the standard or tax-token launch mode.
5. Create a test launch and optionally include the creator's first buy in the launch flow.
6. Approve and buy mock fUSD on the launch curve.
7. Once the curve reaches `GraduationReady`, call the permissionless finalize action.
8. Standard launches graduate into Pancake V3; tax-token launches graduate into Pancake V2.
9. Verify the resulting token, curve/pair, tax components, LP lock, and transactions through BscScan.

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
