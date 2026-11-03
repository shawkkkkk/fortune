# Historical work funding receipts

`inspectWorkFundingReceipt` is an explicit read-only library observer for the
isolated chain-97 WorkEscrow. It accepts the existing immutable job/asset/runtime/
role policy plus exact decimal uint64 `acceptBy`, `deliverBy` and `fundingId`:
`null` means direct legacy `fund`; a nonzero bytes32 means direct `fundWithId`.
The optional operator CLI below is disabled by default. There is no HTTP/MCP
endpoint, service, signer or enabled real configuration.

The two supplied distinct clients must agree on a common head with at least
20 confirmations and a head gap at most 10. The successful receipt, transaction,
block transaction index and every log must bind to the exact expected hash,
client and escrow. Only zero-native-value direct calls with exact canonical
calldata are supported; smart-wallet/batch/outer calls are rejected. Runtime,
immutable roles, asset policy and complete job terms are read at receipt height.
Deadlines must also match the contract's original one-day acceptance/seven-day
delivery limits at that block. Receipt-height job progress may be Funded,
Accepted, Disputed or Settled; this does not report its current status/consent.

Exactly two adjacent canonical logs are required: asset `Transfer` from original
client to escrow for the whole principal, then `JobFunded` binding ID, parties,
asset, amount, terms hash and both deadlines. ID-bound funding additionally needs
an adjacent empty-data `FundingBound` with the exact client-scoped ID and matching
receipt-height `fundingJobs(client,id)` mapping. Assets emitting extra logs and
other receipt shapes are intentionally unsupported. Payment/refund receipts are
not funding evidence; the legacy settlement readers remain unchanged.

Receipt and number/hash/timestamp/block-index bindings are reread, with two-client
agreement, one real rejecting 20-second timer and monotonic safe nonnegative
clock checks before/after every awaited RPC. Original method receivers are kept;
all outcomes fence late follow-on reads. Inflight RPC is not cancelled, event-loop
scheduling and synchronous work are not a hard real-time guarantee. Historical
receipts need not be recent, but cannot have future block times. Height calls
are not EIP-1898 hash calls, independent-provider consensus, finality or ABA proof.

The stable chain/escrow/transaction/JobFunded-log evidence ID is for downstream
deduplication. Repeated reads must not sum principal again. No consumed ledger,
current balances/allowances, pre/post transfer balances, global solvency, legitimate
capital origin, identity, delivery/IP/legal/fairness or current authorization is
established. Runtime pins and event claims are not independent asset/audit approval.
All execution/provider/finality/capital/identity/delivery/solvency/readiness flags
remain false and current authorization remains null. Privacy permission is still
required before sharing real identifiable provenance with a client/model.

The existing zero-account local compiled escrow drill now observes its already
created ID-bound first funding and legacy second funding receipts. It checks
stable replay IDs, wrong principal and wrong ID-mode rejection and unchanged
height/client latest+pending nonces/balances/reserved liabilities during reads.
No new chain transactions, mining, VM clock overrides or deadline changes are
added. The original ten-job, worker-batch, observation-book and settlement tests
remain. Two clients of this one VM and synthetic assets are not independent
providers, real parties/capital, public custody/deployment or full P19 readiness.
No source contract, frozen Standard/root pin, economics or release gate changes.

## Disabled operator CLI

With `FORTUNE_WORK_FUNDING_READ_ENABLED=true`, run:

```sh
node --import ./scripts/register-ts.mjs scripts/inspect-work-funding.mjs /absolute/reviewed-policy.json
```

`FORTUNE_WORK_READ_RPC_URL` and `FORTUNE_WORK_SECONDARY_RPC_URL` must be two
reviewed distinct HTTPS origins without userinfo or fragments. Transports have
five-second timeouts, no retries or redirects and omit credentials. The CLI calls
this unchanged reader once; the original shared twenty-second lifetime remains.

The existing policy file is opened nonblocking, checked through its descriptor
as a regular file, read up to 16 KiB plus one byte and decoded as strict UTF-8 JSON.
Literal bytes must match before and after the observer call. Missing, oversized,
malformed, foreign or unknown-field policies fail privately; no file is created.
This is not a general filesystem deadline or protection against a privileged host
swapping files between checks. The SHA-256 output is a policy-byte checksum, not
approval or authentication. Provider errors, URLs, policy paths and raw exceptions
are not printed. Successful output preserves the reader's original observation,
null authorization and false execution/readiness flags. No transaction, signing,
ledger consumption, retry, background loop or configuration write is added.

Child-process tests cover both direct funding modes through actual viem HTTP/ABI,
ID mapping, replay, foreign terms/transfers, provider failures and changed policy
bytes; disabled/invalid selections make zero RPC. Exact-size, strict UTF-8 and
Linux writerless-FIFO cases retain the same bound. The compiled zero-account drill
also runs the actual CLI against both existing funding receipts, matches every
reader field except each call's own observation time, checks replay and wrong
amount/mode rejection, and retains the original read-only chain-state assertion.
Synthetic HTTPS test origins map to one loopback VM through a test-only preload;
this is not independent-provider, public-service or legitimate-capital evidence.
