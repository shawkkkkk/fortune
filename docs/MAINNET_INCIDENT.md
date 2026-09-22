# Fortune Mainnet Incident Runbook

This runbook applies only after a real-value BNB Smart Chain deployment exists. The checked-in release manifest must remain blocked until this procedure has been exercised against a safe canary environment or paused production deployment.

## Priorities

1. protect users from new exposure;
2. preserve onchain evidence;
3. distinguish an RPC/UI outage from a protocol failure;
4. avoid duplicate transactions or rushed contract changes;
5. communicate concrete facts and transaction hashes.

Fortune is non-custodial. Pausing launch creation does not confiscate user tokens or allow an operator to withdraw curve reserves.

## Severity

**SEV-1** — possible loss of funds, incorrect accounting, compromised governance/deployer, malicious adapter, broken graduation, or oracle manipulation affecting executable trades.

**SEV-2** — degraded RPC/readiness, delayed graduation, indexer failure, incorrect UI state, or one unhealthy external dependency without evidence of fund loss.

**SEV-3** — cosmetic, analytics, documentation, or optional-provider issues with no transaction impact.

## Immediate SEV-1 actions

### 1. Stop new launches

Submit the governance transaction:

```
FortuneFactory.setLaunchesPaused(true)
```

Verify the transaction on BscScan and independently read `launchesPaused() == true` through at least two RPC providers.

Do not attempt emergency upgrades: the current production design is not proxy-upgradeable.

### 2. Preserve evidence

Record:

- incident start time;
- affected factory / curve / token / adapter addresses;
- transaction hashes and block numbers;
- current governance owner;
- current graduation adapter;
- oracle/feed observations;
- readiness endpoint output;
- relevant GitHub deployment commit;
- recent protocol events.

Do not post secrets, private RPC credentials, or wallet recovery material.

### 3. Classify the fault

Check independently:

- BSC chain ID and finality;
- at least two RPC providers;
- factory bytecode and owner;
- launch pause state;
- registry configuration;
- oracle price and timestamp;
- curve accounted reserves versus raw balances;
- graduation status and failure code;
- Pancake pool / position state;
- permanent LP locker custody.

A failed website read is not evidence that an onchain transaction failed.

## Oracle incident

If a production feed is stale, incorrect, or disputed:

1. pause new launches;
2. do not add or replace a feed under time pressure;
3. determine which existing curves snapshot that oracle;
4. verify whether trading naturally fails closed on stale data;
5. document the first affected block;
6. require an asset-policy review before resuming.

Registry changes do not silently rewrite the snapshotted oracle configuration of existing curves.

## Graduation incident

If graduation repeatedly fails:

1. keep the launch transaction history and `graduationStatus`;
2. do not repeatedly spam finalize transactions;
3. reproduce the adapter preflight failure;
4. confirm reserves remain on the curve after a failed atomic graduation;
5. only submit a corrected retry when the exact failure is understood.

The seven-day permissionless reserve-rescue mechanism is the terminal fallback for a launch that cannot graduate. Do not bypass it with manual reserve transfers.

## RPC / website incident

If RPC or the website is degraded but the chain is healthy:

- do not automatically resubmit user transactions;
- recover known transaction hashes and receipts first;
- switch reads to a verified fallback provider;
- keep transaction signing paths independent of analytics/indexer failures;
- label stale or unavailable data.

## Governance or deployer compromise

If the production governance wallet may be compromised:

- treat as SEV-1 even if no malicious transaction is visible;
- preserve all pending Safe/multisig transactions and signer changes;
- do not use the suspected signer or deployer key;
- coordinate recovery according to the governance wallet's own documented recovery process.

The deployer key should have no continuing protocol ownership after the Ownable2Step handoff.

## Recovery criteria

Do not unpause new launches until:

- root cause is documented;
- affected contract state is understood;
- independent RPC reads agree;
- all relevant release/readiness checks pass;
- governance ownership is intact;
- the remediation has been tested;
- the incident log includes the recovery transaction.

Unpause only through contract-based governance.

## Monitoring

After activation, enable the **Fortune Mainnet Monitor** GitHub workflow. A failed scheduled run is an alert requiring triage. It checks:

- chain ID 56;
- factory / registry / governance bytecode;
- factory and registry ownership;
- launch pause state;
- the public production readiness endpoint.

This workflow is a baseline alerting layer, not a substitute for independent infrastructure monitoring.

## Required drill before activation

Before marking `incidentRunbook` or `monitoringAlerts` complete in `mainnet-release.json`:

1. deploy/configure the monitor against the paused production stack with `FORTUNE_MAINNET_MONITOR_MODE=paused`;
2. configure two distinct BSC RPC provider secrets;
3. manually run **Fortune Mainnet Monitor** with `drill_failure=true`;
4. confirm the normal checks pass first and the intentional final step makes the run fail;
5. confirm maintainers receive the workflow failure notification;
6. manually rerun with `drill_failure=false` and confirm success;
7. exercise the pause-state verification procedure through both RPC providers;
8. record the successful and intentionally failed workflow runs as release evidence.

After governance activation, switch `FORTUNE_MAINNET_MONITOR_MODE` to `active`.
