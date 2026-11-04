# Disabled liquidity-custody receipt operator (M07)

`inspect-liquidity-custody-receipt.mjs` connects a local operator command to the
actual unchanged deposit and release receipt readers. It is read-only and off by
default. It does not initialize a store, submit a transaction, approve an NFT,
claim fees, start a service or manage a position.

## Explicit invocation

After separate review of the custody policy, read providers and disclosure of
real identifiable provenance, use Node22 and the existing TS loader:

```sh
FORTUNE_LP_CUSTODY_RECEIPT_READ_ENABLED=true \
FORTUNE_LP_READ_RPC_URL=<reviewed-https-origin-one> \
FORTUNE_LP_SECONDARY_RPC_URL=<reviewed-https-origin-two> \
node --import ./scripts/register-ts.mjs \
  scripts/inspect-liquidity-custody-receipt.mjs deposit <reviewed-input-file>
```

Use the explicit `release` mode for a release receipt. There is no inferred mode,
route fallback, automatic retry or loop. The input is exactly the existing
reader envelope `{policy, transactionHash}`: the full exact chain97
`LPCustodyPolicy` and a nonzero32-byte transaction hash. See
[deposit receipts](LIQUIDITY_CUSTODY_DEPOSIT_RECEIPTS.md) and
[release receipts](LIQUIDITY_CUSTODY_RELEASE_RECEIPTS.md) for all pins/roles/NFT
fields, canonical call/log/state bindings, confirmation and historical limits.
No real configuration or credentials are provided or enabled by this change.

The gate and exact mode/argument count are checked before opening input. The
operator opens an O_RDONLY|O_NONBLOCK descriptor, requires a regular file, reads
at most16KiB+1 bytes and closes it in finally. Declared or actual data above16KiB,
invalid UTF8/JSON, missing files/directories/FIFOs and malformed exact policies
reject privately. Regular-file symlinks remain supported; this is not a generic
filesystem deadline, privileged path-swap defense or Windows FIFO guarantee.

Two supplied HTTPS origins must be distinct, without URL userinfo or fragments.
Each transport has a5-second timeout, zero application retries, redirect:error
and credentials:omit. Distinct origins do not establish independent providers.
The original literal input bytes are reread before the engine, before and after
EVERY awaited method (all7 read methods, preserving receivers), and after the
engine before output. A shared safe nonnegative monotonic30-second clock also
checks around the per-RPC file reads before the actual method is called; every
engine outcome closes that wrapper fence. Changes discard the observation; the original reviewed
policy is never silently refreshed. A trusted host can change files after the
last sample. Host storage/clock/policy/provider assumptions remain.

The unchanged engine supplies its own real30-second monotonic RPC lifetime,
20-confirmation/head-gap10 checks, receipt-height complete policy/position state,
canonical logs and header/receipt rereads. Filesystem/startup/output time is not
claimed inside that RPC lifetime. Inflight reads are not canceled by a fence;
there is no generic host/event-loop or filesystem liveness certification.

## Output and authority

One JSON result contains source `operator-liquidity-custody-receipt`, the explicit
kind, SHA256 of the literal input and the unchanged original observation. The
checksum is consistency, not authorization, an independent anchor or a signed
policy approval. Raw liquidity/lastComputedOwed are not value or claimable fees;
TVL and claimable fees remain null. Receipt block provenance and stable evidence
IDs remain original. Repeated reads MUST be deduplicated by that ID, never summed.
`observedAtMs` is read time, not renewed receipt time or current ownership.

`currentAuthorization` stays null and execution/full-managed-liquidity readiness
stay false at both wrapper and observation levels. Existing project consent,
capital origin, treasury control, independent-provider/finality/pre-state flags
stay false. A historical deposit can be read after the NFT has been released;
it is not current custody, economic ownership, funding origin, profit or consent.
Failures print only a fixed private error, no raw provider errors, paths, URLs or
credentials. No financial action is submitted or automatically retried.

There is no ledger consumption, total, badge, recovery, signer, HTTP/MCP service,
model or scheduling/configuration enablement. Launch-token-side fees remain
burn-only; creator/holder/LP liabilities and launch reserves are never strategy
capital. Contracts, old readers/commands, Standard/root pins/economics and all
release gates remain unchanged. Audit alone is not activation approval.

## Component evidence

Actual child CLI→viem HTTP/ABI→unchanged readers tests cover both modes, stable
replay, wrong route/NFT, gate/arguments/exact input, invalid UTF8/16KiB boundary,
regular descriptors/FIFO, unsafe providers/private errors and literal policy
mutation during RPC. A TEST-ONLY preload maps two synthetic HTTPS origins to ONE
loopback fixture; production never loads that hook automatically.

The existing fresh-compiled zero-account Pancake fork drill additionally consumes
both ORIGINAL existing receipts through the command, compares full observations
to direct-reader outputs except their own observedAtMs, checks replay/wrong mode
and unchanged current head/nonces/NFT owner/custody flags. The original runtime
is byte unchanged outside the marked operator block and five report flags. No
extra financial transactions, mining, clock override or wider guards/budgets.
Exact-source CI determines whether that drill passed; source alone is not proof.
One synthetic-asset fixture is not independent public providers, public custody,
real capital, retained operations, legal/audit approval or complete M07 readiness.
Management/multi-wallet execution, cost/inventory/profit accounting, public
operations and all custody/funding/asset/provider/signer/governance/privacy/
failure/recovery/deployment/audit/mainnet gates remain separate and fail closed.
