# Complete batch-result payment observation

The default-disabled local command invokes the existing unchanged
`inspectAllWorkBatchResultPayments` engine. It observes every job in one direct
`approveResultsMany` receipt; it never pays, approves, signs or submits anything.
The older direct-payment command and selected-job library remain unchanged.

## Operator inputs

After reviewing the actual escrow, transaction, roles, assets and job terms, set
`FORTUNE_WORK_BATCH_PAYMENT_READ_ENABLED=true`. Supply reviewed read-only providers
with `FORTUNE_WORK_READ_RPC_URL` and `FORTUNE_WORK_SECONDARY_RPC_URL`, then run:

```sh
node --import ./scripts/register-ts.mjs scripts/inspect-work-batch-payments.mjs /absolute/reviewed-policy.json
```

The existing regular UTF8 JSON file is an array of complete
`WorkBatchResultPaymentPolicy` objects, one per call entry in exact ascending job
order (1–16). Each object has the existing chain97 escrow/runtime/role/client,
worker, asset/runtime/cap, job ID/amount/terms/transaction fields and the same
complete `approvals` list of literal `{id, revision, resultHash}` objects. Amounts,
IDs and revisions are canonical decimal strings; hashes and addresses follow the
existing library policy. No caller URLs or paths are accepted inside this JSON.
Missing, duplicated, unsorted or differing call coverage fails before RPC.

This separate policy has a64-KiB byte limit because complete sixteen-job policies
repeat the call binding. The descriptor is opened O_RDONLY|O_NONBLOCK, checked
regular, read into at most64KiB+1 bytes and closed in finally. Regular symlinks
remain supported. Literal bytes are checked again before and after observation.
This does not certify a filesystem deadline or prevent privileged-host swaps.

Both provider origins must be distinct HTTPS origins without userinfo/fragments.
Transport uses five-second timeouts, no retry/redirect and credentials omit. The
unchanged engine uses one real20-second monotonic lifetime, two-client agreement,
20confirmations/head-gap limits, exact calldata and3N canonical events, every
job's receipt-height state/pins and whole-receipt consistency. Inflight requests
may continue after rejection; later engine reads are fenced.

## Output and limits

Only after every job passes does stdout contain the unchanged complete
observation plus a SHA256 of policy bytes. The checksum is not authentication.
Failures discard the complete result and print a fixed private error; no partial
payment result, raw provider error, credential or local path is printed.

Payments retain separate asset units; never sum different assets. Stable per-job
evidence IDs require permanent downstream deduplication; repeated observation
is not a new payment. No consumed ledger, badge, current consent, content or IP
verification is added. Both command and observation retain null authorization
and false execution/readiness/provider independence/finality/capital-origin/
identity/delivery/global-solvency claims. Two clients of one fixture are not
independent providers. Height-based RPC calls do not prove EIP1898/finality or
pre/post balance changes. Stored results are historical observations, not login,
legal agreement, fairness, legitimate capital or approval of future actions.

No actual policy, provider configuration, service, signer, public custody or
financial action is enabled by this source. Review privacy before sharing real
identifiable job/wallet observations. Full P19 and release readiness remain
unfinished; Standard/root pins and all authority/release gates are unchanged.
