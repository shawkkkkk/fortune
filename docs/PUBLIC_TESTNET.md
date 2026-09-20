# Fortune Public Testnet

Fortune's public testnet is the final open validation phase before any production/mainnet launch.

## Current release gate

The existing BSC Testnet stack has already passed:

- a real end-to-end Pancake V3 graduation;
- permanent LP-position NFT custody;
- opening-price continuity against the frozen graduation anchor;
- 39/39 contract tests with 1,000 fuzz runs;
- a 7,500-request launch storm with 100% request success;
- three additional real BSC Testnet graduations while the web load test was running;
- pre- and post-storm readiness checks.

Before the public testnet is promoted broadly, Fortune runs a concurrent-graduation ladder at 10, 25, 50, and 100 launches. Each ladder step uses one shared Fortune protocol deployment, prepares independent curves at GraduationReady, then submits permissionless finalizations concurrently through independent ephemeral keeper wallets.

## Concurrent-graduation acceptance criteria

A wave passes only when:

1. every requested finalization transaction succeeds;
2. every curve reports `graduated() == true` and `phase() == PoolCreated`;
3. the permanent locker contains one new Pancake V3 position per launch;
4. the Pancake position manager reports the locker as owner of every resulting LP NFT;
5. the heavy web-load gate passes at the same time;
6. readiness checks remain healthy after the wave.

The workflow stores machine-readable graduation and HTTP reports as GitHub Actions artifacts.

## Ladder

Run **Fortune Concurrent Graduation Wave** manually with:

- 10 launches / 10 concurrent submissions;
- 25 launches / 25 concurrent submissions;
- 50 launches / 50 concurrent submissions;
- 100 launches / 100 concurrent submissions.

The workflow performs a conservative tBNB balance check before spending testnet gas. If a stage is underfunded, it stops before deploying the stress environment.

## Public beta posture

Until the 100-launch wave is green, public-facing language should describe Fortune as an upcoming or limited BSC Testnet beta. After the 100-launch gate passes, the testnet can be opened broadly while production/mainnet remains separately gated by security review, deployment/key controls, monitoring, incident procedures, and verified production configuration.
