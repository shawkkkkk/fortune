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

- Token: `0xDCb92C2B3062F246D93a0BF1712c17a2Be4d39FE`
- Curve: `0x48A7353F28e5A237bdA85E73217cc670fCf58e17`
- Pancake V3 pool: `0xFBDC7FF79687F4F3866Ed586E52F98c7C992608f`
- Permanently locked V3 LP NFT: `37520`

### Verified tax-token lifecycle reference

- Tax token: `0x99801f077Ecca030898664c7708Ba9857b8E5EFe`
- Tax curve: `0xb7f86e7E71Fc08E1c3cC4306DC33684D88e4019d`
- Pancake V2 pair: `0xB13F241D37Ea74854a8D45bF195cFcd6342535d6`
- Tax processor: `0xf2eB2e59e44bA658C0eD62c04eBEBc60206d8BBc`
- Holder dividend vault: `0x37B7E38fFE164b6c0775ba212a4ca6F4B57427F3`

### PancakeSwap BSC Testnet references

- Pancake V2 Factory: `0xB7926C0430Afb07AA7DEfDE6DA862aE0Bde767bc`
- Pancake V2 Router: `0x9ac64cc6e4415144c455bd8e4837fea55603e5c3`
- Pancake V3 Factory: `0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865`
- Pancake V3 NonfungiblePositionManager: `0x427bF5b37357632377eCbEC9de3626C71A5396c1`

## Final release verification

GitHub Actions run `35541179283` (**Fortune Finalize Verified Public Alpha**) completed successfully on 2026-09-20 and published the verified stack to `lib/public-testnet.ts` in commit `d482b6a3bde3dc858fb01034582900b6644b9ee4`.

The final verifier re-read the completed lifecycle state directly from BSC Testnet and required all of the following before publishing the addresses:

- standard launch completed;
- standard creator first buy completed;
- standard Pancake V3 graduation completed;
- the V3 LP-position NFT is permanently locked;
- tax-token launch completed;
- tax-token creator first buy completed;
- tax accounting is non-zero;
- Pancake V2 graduation completed;
- V2 LP is permanently locked;
- anti-farmer protection is active;
- a real post-graduation taxed sell completed;
- DEX tax processing produced non-zero tax;
- direct/token burn produced non-zero burned tokens;
- at least one holder-dividend epoch was created;
- both `STANDARD_ONCHAIN_EXECUTION_COMPLETE_AND_SUCCESSFUL` and `TAX_ONCHAIN_EXECUTION_COMPLETE_AND_SUCCESSFUL` lifecycle markers were emitted.

The same verifier recorded:

- standard token: `0xDCb92C2B3062F246D93a0BF1712c17a2Be4d39FE`;
- standard pool: `0xFBDC7FF79687F4F3866Ed586E52F98c7C992608f`;
- standard LP NFT: `37520`;
- tax token: `0x99801f077Ecca030898664c7708Ba9857b8E5EFe`;
- tax pair: `0xB13F241D37Ea74854a8D45bF195cFcd6342535d6`;
- non-zero V2 LP lock amount;
- non-zero curve tax;
- non-zero burned token amount;
- one dividend epoch.

The verification artifact was uploaded as `fortune-final-public-alpha-verification` (artifact ID `10615200301`).

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
