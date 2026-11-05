# Testnet implementation ledger

## Strategy receipt block timestamp agreement (M01/M07/M08)

The fill verifier checks the confirmed receipt block timestamp across both
read clients and their final rereads. Vault deadline checks use the validated
timestamp. Historical receipt digests and journal rows keep their existing
schema; provider independence and finality remain unverified.

## Strategy receipt RPC redirects (M01/M07/M08)

The direct journal, journal-only queue, and budget reconciliation commands
reject HTTP redirects from their reviewed RPC origins. Two loopback servers
verify that the destination receives no requests and that existing failure
state is preserved. No independence or public route attestation follows.

## Bounded strategy operator policy files (M01/M07/M08)

The queue, direct fill journal, and gas reconciliation commands require regular
UTF-8 JSON policy files and cap each actual read at 16 KiB. Writerless pipes fail
before SQLite or RPC work; regular symlinks still work. Existing RPC, economic
and release gates remain unchanged. This is not a general file-system deadline.

## Receipt client admission before queue claim or gas hold (M01/M07/M08)

Journal-only observation uses the same admission check before a queue claim
and before a direct refresh can enter its quarantine path. Missing methods
leave existing rows and attempts unchanged, including after reopening SQLite.
Actual read failures still quarantine observations and follow existing backoff.

The existing strategy coordinator now checks all required read methods on both
clients and captures them with their original receivers before taking durable
work. Invalid local configuration leaves the queue, gas budget, and journal
unchanged; actual provider failures after a hold still quarantine. Journal
commit before gas charge and queue completion remains unchanged. This neither
attests provider independence nor recovers a hold or authorizes execution.

## Studio predecessor review (P01/P02/P06)

The read-only creator operator CLI can export the current revision and digest
alongside the existing Studio pins. Studio checks the exact successor and
predecessor digest before offering wallet consent when those pins are supplied.
Legacy pins remain supported and explicitly unbound to the head. The export
reads no profile, signature or evidence. It is a point-in-time host snapshot,
so a concurrent advance still requires rejection by the unchanged registry
accept path. This adds no RPC, signing, writes, publication or current login.

## Studio operator round-trip rehearsal (P01/P02/P06)

The browser rehearsal now obtains pins through the actual operator CLI, then
passes the exact downloaded envelope to the existing registry verifier. It
checks wrong-creator rejection, a single durable acceptance, reopen and replay
rejection. The wallet returns the existing arbitrary fixture tuple and the two
read clients supply fixture factory state; this does not demonstrate independent
providers, live approval, publication, or audit readiness.

## Studio operator pin export (P01/P02/P06)

The explicitly enabled creator operator CLI exports the exact Studio pin object
from an existing read-only registry matched against the reviewed policy. The
operator supplies a separately reviewed, nonzero wallet address. There is no
profile or draft read, RPC, signing, registry write, or publication. A pin
export is not an ownership or login check; the existing accept flow still
verifies the recovered signer and factory creator. Deliver pins separately from
the prepared request through a trusted operator channel. See
[creator wallet adapter](CREATOR_CANON_SIGNING.md).

## Loopback Studio wallet handoff (P01/P02/P06)

On a top-level HTTP page at `localhost` or `127.0.0.1`, open the local wallet
handoff after choosing the project and filling its exact character draft. The
public site does not offer this handoff. Obtain the operator's prepared request
and a **separate, trusted** JSON object containing `policy`, `registryId`, and
`account`. The account is the expected existing creator wallet; the policy is
the existing chain-97 factory/runtime/index/token policy. Do not derive these
pins from the request being reviewed.

Review the project, expected wallet, registry, revision, original expiry and
digest. Only after explicitly permitting disclosure of all ten fields can you
request the wallet signature. The injected wallet must already expose the
expected single account on chain 97. The adapter uses one typed-data request and
checks identity before and after it; there is no connect, switch, fallback or
automatic retry. Editing the draft or closing the panel discards the old
review, consent and output, and fences late wallet results.

A successful wallet response offers one explicit local envelope download. It is
not saved to browser storage, uploaded, posted or accepted by Studio. Keep the
file private and give it only to the intended operator. The existing registry
accept command independently checks the signature, factory creator, revision,
original expiry and durable write. A local download is not creator ownership,
a session, financial authority or publication. A wallet or its provider can
retain the text; a prompt already opened may outlive the browser review.

The browser regression uses an existing arbitrary tuple returned by a fixture,
not a generated signature or a real wallet approval. This local path does not
deliver hosted authentication, a public creator lifecycle, or testnet/audit
readiness.

## Wallet SDK to creator registry rehearsal (P01/P02/P06)

The UNCHANGED creator signing adapter is now exercised with the installed, locked
viem WalletClient over actual loopback JSON-RPC HTTP, then actual PublicClient
factory ABI reads and the unchanged CreatorCanonRegistry/real SQLite store.
The fixture asserts exact eth_signTypedData_v4 account/domain/types/message and
EIP-712 digest, all ten literal fields (including untrusted text), and only the
allowed wallet/read methods. Successful acceptance persists one original record;
reopen preserves it and replay rejects before another RPC. Default-off/digest
mismatch performs zero requests. Before/after account and chain changes produce
no envelope or record; wallet rejection has exactly one v4 attempt without
fallback/retry. A consistent wallet tuple still fails independent factory-creator
verification and leaves no record when the fixture creator differs.

This is actual SDK/HTTP/ABI/SQLite integration evidence, NOT a real wallet approval
or independent providers. The loopback wallet fixture RETURNS an existing arbitrary
r/s/v tuple; it does not sign, create an account/key, send a public transaction or
prove control of the recovered address. Both read clients share ONE synthetic
HTTP fixture with asserted chain/time/code/factory data. No public providers,
funds, real profiles, credentials or services are used. No production adapter,
registry, UI, workflows, root pins/dependencies, economics or release gates change.
Full P01/P02/P06/Studio/hosted auth/creator approval and full readiness remain
unfinished. Real profile text would be disclosed to the selected wallet/provider
and requires the corresponding privacy permission; that boundary is unchanged.

## Reviewed creator-wallet signing adapter (P01/P02/P06)

An explicit library adapter now validates the operator CLI's prepared character
request against separately supplied trusted policy/registry pins and exact reviewed
fields, reconstructs the existing EIP-712 schema and rejects extra signing data.
The detached review is frozen and branded locally. Signing is off by default;
explicit enablement, matching reviewed digest and one expected wallet account are
required. It checks chain97/account before and after one signTypedData request,
canonical low-s EOA signature recovery and the ORIGINAL five-minute expiry.
One rejecting wall timer uses remaining original lifetime; monotonic safe host
clock checks fence late completions. There is no network switch, alternative
signature method, automatic renewal/retry, server write or financial request.

The returned exact update/signature envelope is consumed by the UNCHANGED creator
registry, which independently checks current factory binding, two read clients,
revision/predecessor and durable commit freshness. Adapter recovery is NOT creator
ownership, current login, IP/license or financial authority. Policy/registry pins
must come from reviewed operator context, never from the imported request itself.
40KiB prepared-input cap may reject otherwise valid large preparations. Imported
text remains untrusted. A wallet prompt may finish after timeout; late signatures
are discarded, not automatically sent or signed again. Host/provider/event-loop
trust and changes after the final observation remain limitations.

This delivers the wallet-adapter-to-registry component, NOT a connected Studio
button, browser download flow, public HTTP/auth service, live creator approval or
full P01/P02/P06 readiness. No UI or service is enabled. Actual SQLite/recovery
fixtures use an existing arbitrary r/s/v tuple and a fixture factory assigned its
recovered address; no private key, account or signature is generated and no public
transaction/provider is used. Real creator wallet/hosting/privacy/security review
remain separate. Frozen Standard/root dependencies and financial gates unchanged.

## Bounded shared creator/API body reads (P01/P06/P23)

readLimitedBytes now rejects stalled reads after one real ten-second lifetime,
checks safe nonnegative monotonic host time around every read and final assembly,
and permits at most4096nonfinal fragments including empty chunks. Existing byte
ceilings and declared-length rejection remain. Cancellation is best effort and
never awaited; a non-cooperating stream cannot delay rejection. Pending reads may
continue; ended fences prevent late returned bytes. Event-loop/host-clock trust
remains; this is not a process memory bound or a whole request/Sharp/upload deadline.

Actual consumers are upload ingress before wallet/quota/storage, browser metadata
response bodies and the public asset-check request body. Their authorization,
fixed storage providers, quota, parsing and RPC policies are unchanged. In
particular this does NOT bound the browser metadata fetch before its response,
JSON/form parsing or native Sharp; a valid slow/overfragmented body can now reject.
The upload still maps malformed bodies to400 and the asset checker to400.

Old-source six-group regression:1PASS5FAIL, including real stalled-read and
non-cooperating-cancel hangs, empty/tiny fragments, clock reversal/unsafe clocks,
and actual handleImageUpload ingress rejection with zero provider calls. Test-only
unused provider labels are not real credentials/configuration or creator approval.
Focused controls cover original byte limits and exactly4096valid fragments.
No keys/accounts/signatures/public broadcasts, service activation, economic or
frozen Standard/root dependency changes. Full features and readiness remain gated.

## Bounded image storage and retrieval (P01/P06/P23)

After unchanged enablement/origin/wallet authorization, quota reservation and
Sharp normalization, handleImageUpload now calls the extracted internal
pinAndVerifyTokenImage engine. Its two FIXED HTTPS providers, multipart filename/
WebP/CIDversion1,8192byte pin reply,2MiB retrieval limit and exact SHA256 comparison
are retained. Each stage now has one rejecting wall timer at its ORIGINAL20/10
second budget, safe nonnegative monotonic host-clock fences around fetch/every
read/projection,4096nonfinal chunks including EMPTY and nonawaited best-effort
abort/cancel. Pin JSON is strictUTF8; malformed/late/unsafe provider errors are
private503. No new caller URLs, redirect/retry policy, credentials or enablement.

A pin POST may complete after timeout and quota may already be consumed. Failure
is NOT rollback/nonpublication proof. Inspect existing provider/proof state before
explicit retry; no blind duplicate pin, quota reset/release or renewed wallet
approval. Native Sharp/request-body reading and the whole upload are NOT covered
by a certified overall deadline. Inflight operations/event-loop/host-clock trust
remain. Old wallet verification and quota engine bodies are byte-preserved.

The EXACT old storage body was first extracted without behavior changes for
local comparison (not an old public API/authentication proof):1PASS4FAIL in5groups,
including actual20/10second abort-ignoring fetch/read regressions and strictUTF8/
fragment/private-error rejection. Final6new groups exercise actual storage code,
original byte caps, clock reversal, late-stage fencing and actual Sharp→multipart
POST→localHTTP retrieval/digest. Transport fixtures send no credentials locally;
no accounts/keys/signatures, real provider, paid pinning or real profile were used.
These tests do not establish creator approval, live Redis/IPFS hosting, recovery,
auth sessions, independent providers, fullP01/P06/P23 or audit readiness. Frozen
Standard/root dependencies and all financial/mainnet/privacy gates are unchanged.

## Bounded creator-upload quota reservation (P01/P06/P23)

The ACTUAL authenticated image-upload path now bounds reserveUpload's existing
Redis POST and body decoding with one rejecting five-second wall timer and
safe nonnegative monotonic host-clock checks before/after fetch, every stream
read and result projection. Responses are capped at4096 declared/actual bytes,
4096 nonfinal fragments including empty ones, and strictUTF8 JSON. Hung fetch,
read or cancellation cannot keep the caller pending; abort/cancel are best effort
and not awaited. Inflight operations may still complete, and event-loop/host-clock
trust remains. This is per-reservation, not a whole-upload/native-Sharp deadline.

Original Lua, proof dedup, wallet-hour/global-day keys,10/250 limits and600/3600/
86400 expiries are unchanged. Allowed/replay409/limited429 semantics remain;
invalid/late/unsafe responses return private503. No retry, quota reset or release.
A timeout/error DOES NOT prove Redis did not commit. Inspect existing proof/quota
state before explicit retry; do not blindly replay a write or renew authorization.
Wallet proof, file normalization, pin/retrieval and enablement gates are unchanged.
No credentials, keys, signing, paid provider call, public configuration or service
enablement was used. Tests call the ACTUAL reservation engine: ignored abort,
hung body/noncooperating cancel, byte/fragment/UTF8 bounds, unsafe/reversed clocks,
old result/key controls and a credential-free localHTTP EVAL roundtrip.
Four groups failed old source (first5group run); final6groups cover the fix.
Fixtures are not liveRedis/pinning/creator approval/hosting/auth-session/recovery
or fullP01/P06/P23 readiness. Frozen Standard/root pins and all gates remain.

## Complete batch-decline receipt coverage (P19)

`inspectAllWorkBatchDeclines` requires complete 1–16 ordered policies for one
chain97 direct `declineMany` call. Every policy, canonical sorted ID list,
selected index, shared worker/call/runtime/roles and repeated-asset pin/cap is
validated before RPC. Caller policies are cloned before awaits. It calls the
UNCHANGED selected receipt engine for EVERY job under one real20second safe
monotonic deadline, all7 original-receiver RPC fences and finally fences.
All receipt reads must share a normalized bounded3N-log digest, including empty
JobDeclined data, and every result must share a header and distinct settlement
ID. This checksum is consistency only, not authentication. Irrelevant gas fields
are excluded. Each refund retains its own client, asset, amount and stable
MUST-deduplicate ID; there is no cross-asset total or consumed settlement ledger.

Only the complete result reports allCallEntriesObserved:true; each selected
result still says otherBatchJobsVerified:false. Historical receipt-height state
is not current consent, pre/post balance proof, independent-provider/finality,
capital origin, identity/delivery/IP/legal/fairness, global solvency or recovery.
Authorization remains null and all financial/readiness authority false. No CLI,
service, real configuration, signing, broadcast, badge or full P19 completion.
Six new tests cover1/2/16 mixed-client/asset batches, completeness and0RPC
preflight, later-job/refund/state and receipt drift, own framing, input mutation,
original receivers, clock reversal, real deadline and failed-peer late fences.
The compiled zero-account two-asset runtime now observes both ACTUAL refunds
through this API, replays identical IDs/digest and rejects incomplete/bad later
policies, reusing existing snapshot-restored confirmations and unchanged-state
assertions. No extra transaction/mining/clock change. One VM is not independent
providers/public custody or audit evidence. Old readers/contracts/runtime checks,
Standard/root dependency pins, economics and release gates remain unchanged.

## Selected batch-decline receipt observation (P19)

inspectWorkBatchDeclineReceipt binds ONE selected refund in direct chain97
 declineMany calldata with 1–16 strictly sorted nonzero IDs. Exact worker/call,
transaction/receipt/block/log positions, receipt-height runtime/role/asset/job
pins and zero latest result revision must agree across both read clients.
Canonical selected Transfer/JobSettled/JobDeclined returns whole principal to
the original client. Stable settlement IDs MUST be deduplicated downstream.
The existing20-confirmation/head-gap10/real20second monotonic RPC fences,
original receivers, before/after rereads and finally fences remain unchanged.
Other entries' assets/amounts/parties/terms/state are NOT verified; output says
otherBatchJobsVerified:false. No complete-batch ledger, cash/badge, signer,
service, CLI or configuration is added; authorization null/all authority false.

Tests cover1/16 and first/last selection, malformed preflight0RPC, selected
call/event/refund/revision mutations, peer/reread own-topic slots, stable replay,
receiver binding, real timeout/late-follow-on fencing and direct-route separation.
The actual compiled zero-account two-client/two-asset decline drill now reads
both original refunds, rejects wrong amounts/direct routes and checks unchanged
height/nonces/balances/liabilities/history during observation. Twenty local
confirmation blocks are snapshot-restored; old runtime assertions remain.
One fixture is not independent providers, public custody, finality, capital,
identity/delivery/IP/legal/fairness/recovery, audit or full P19 readiness.
Contracts, old test groups/readers' routes, Standard/root pins and gates remain.

## Atomic unaccepted-job batch decline (P19)

`declineMany(uint256[])` adds an isolated chain97 worker action for 1–16 strictly
increasing nonzero job IDs. Every selected job must still be Funded and name the
caller as worker; every asset runtime pin is checked before the first refund.
The unchanged `_settle(id,0)` returns each whole principal only to its original
client, followed by the existing JobDeclined event. Mixed clients/assets are
allowed; unselected liabilities, terms, result history and funding IDs remain.
No recipient/amount selection, new administrator, fee or recovery authority.
Like single decline, this is voluntary rejection before or after acceptBy,
not automatic expiry settlement. Accepted/disputed/settled/missing jobs reject;
first valid accept/cancel/decline wins. A later failed exact transfer reverts
all earlier transfers, state, liabilities and events. After inspecting the
failure, explicit unchanged-calldata retry may succeed; successful replay rejects.
Pause, runtime/backing checks, non-reentrancy and chain97 restrictions remain.

Six compiled unit/fuzz groups cover 1–16 jobs, mixed clients/assets, acceptance
expiry, fixed-client refunds, unselected liabilities/history, late failures and
retry, roles/states/runtime/order/bounds/pause/chain rejection. A separate pinned
Anvil1.7.1 zero-account loopback drill uses ACTUAL compiled HTTP/ABI calls and
synthetic assets: two clients fund two unaccepted jobs while an unselected third
job stays accepted with result history. A tax on the SECOND asset causes a mined
whole-batch revert; exact original calldata then returns both principals with
six ordered Transfer/JobSettled/JobDeclined logs. Balances, reserved liabilities,
terms, funding IDs, result history, replay and old-route rejection are checked.
Owned artifact source keccak256 must match before execution. No clock override,
public RPC, key, generated account or public broadcast; impersonation stops after
the drill. Failure exits1 with a fixed stage label and no PASS JSON. CI adds an
independent three-minute step and log/JSON artifact; old steps/limits stay intact.

This changes isolated escrow bytecode and requires fresh deployment/review/audit
evidence; old deployment/audit approvals cannot transfer. Existing direct receipt
readers reject this batch outer call; no production batch-decline observer/book,
service, signer, real configuration or full P19 readiness is provided. One local
fixture is not independent providers, public custody, legitimate capital, party
identity, legal cancellation, delivery/IP/fairness or recovery evidence. Frozen
Standard/root pins, economics and every release gate remain unchanged.

## Disabled batch-waiver observation operator command (P19)

work-waiver-observations.mjs read <config> reads existing history without RPC.
An explicit capture <config> <request> requires separate
FORTUNE_WORK_WAIVER_BOOK_ENABLED and FORTUNE_WORK_WAIVER_BOOK_WRITE_ENABLED gates
and calls the unchanged waiver book and complete receipt reader exactly once.
The16KiB config pins the existing book ID/path/worker policy; the68KiB request
pins complete policies and the ORIGINAL expected predecessor. Bounded nonblocking
regular descriptors and strictUTF8/JSON reject FIFOs, excess bytes and extra fields.
Two distinct HTTPS origins,5second transport/no redirects/retries/credentials,
and literal config/request bytes checked before/after all7 awaited RPC methods
preserve the reader's20second lifetime and book's5second commit freshness.
No initialization, head refresh, repair, reset, loop, recovery or signing.

Actual child→HTTP/ABI→SQLite tests cover1/2/16 mixed-client/asset refunds,
read/reopen/retry times and IDs, gates/foreign IDs/stale heads, late failures,
changed inputs, private provider errors, strict bounds/UTF8 and writerless FIFOs.
The existing compiled zero-account drill invokes the actual command for read,
immutable retry and later-bad-policy rejection against its existing two refunds.
No new financial transaction, mining or clock change; old state/snapshot checks
remain. Synthetic HTTPS origins reach ONE local fixture, not independent providers.

Config SHA is a checksum, not authentication. Failure/output loss may follow
commit/quarantine: inspect history before explicit ORIGINAL retry; never renew
the predecessor. Trusted host/files/clock/RPC can change after the last check;
this is not a general filesystem deadline, power-loss or recovery certification.
Permission/privacy review is required before storing/sharing real wallet metadata.
No real config/service/cash totals/badges/financial authority; authorization null,
execution/readiness false. Full P19/audit/public deployment remain unfinished.
Standard/root pins, existing book/readers/commands and release gates stay unchanged.

## Durable batch-waiver observation book (P19)

The separately disabled WorkWaiverObservationBook calls the unchanged complete
batch-waiver reader and stores each original client's refund in its own asset
units. Explicit exclusive0600 initialization, existing protected absolute files,
read-only default, worker/runtime/role policy, WAL/FULL, expected predecessor,
64 batches of up to16 jobs, 96KiB documents and a5second commit freshness fence
constrain capture. Separate schema rejects result-payment books; no migration.
Full history/hash-chain/index validation, transaction/job/evidence deduplication,
immutable original retry records and permanent conflict quarantine survive reopen.
New positive conflicting observations quarantine; failed RPC/invalid policies
do not manufacture replacement evidence. No reset, repair, prune, recovery,
CLI, service, signing, cash totals, badges or financial authority.

Actual HTTP/ABI plus SQLite tests exercise mixed clients/assets,1/16 jobs,
capacity, concurrent handles, corruption, clock rollback/expiry, replay and
positive changed-block/job conflicts. The existing zero-account compiled drill
now captures its two actual refunds, reopens/replays original times/digests and
rejects a later bad policy without writes; existing snapshot/state assertions
remain. No added financial transaction, mining or clock override.

Host storage/clock/policy/RPC remain trusted; local hash chains are rewritable,
not independent anchors. Deduplication is per book only; separate payment and
waiver books are not atomic/global settlement. Uncertain output may follow commit
or quarantine: inspect existing history before explicit original retry. No silent
head renewal or unquarantine. Temporary drill DB is deleted; no retained storage,
power-loss certification, public reorg/recovery, independent providers, legitimate
capital, identity, delivery/IP/legal/fairness, audit or fullP19 readiness proof.
Authorization stays null; execution/readiness flags stay false. All gates remain.

## Complete worker batch-waiver receipt observation (P19)

inspectAllWorkBatchWaivers requires COMPLETE ordered policies for all1–16 call
entries before RPC: common batch/worker/runtime/roles, exact job IDs/revisions,
consistent per-asset code/cap pins, and each original client/amount/terms policy.
It calls the actual unchanged selected-job reader for EVERY entry under ONE
shared real20second monotonic lifetime, original RPC receivers and finally fences.
All receipt reads must share a bounded normalized whitelist digest and header;
every settlement ID is distinct and MUST be deduplicated downstream. Refunds
retain individual asset/base-unit amounts; no cross-asset total or consumed ledger.
The digest is consistency, not authentication. The selected API still reports
otherBatchJobsVerifiedfalse; the complete API marks allCallEntriesObserved only
after every selected observation passes. No CLI/service/signer/new configuration.

Tests cover1/2/16 entries, mixed clients/assets, complete-policy preflight with
zeroRPC, later failures, receipt changes, own slots, receiver binding, intermediate
clock reversal and shared timeout/late-follow-on fences. The existing compiled
zero-account waiver rehearsal reads both actual refunds through the whole engine,
checks replay digest/IDs, rejects incomplete/later wrong policies, and preserves
its original height/nonces/balances/liabilities via the existing snapshot restore.
No new financial transaction, mining or clock behavior. Existing selected engine,
contracts, root pins and old tests remain unchanged; workflow adds only two paths
in both triggers. One local fixture is not independent providers/public custody,
capital/identity/delivery/IP/legal/fairness/finality/recovery/audit/fullP19 proof.
Authorization remains null and execution/readiness false; all gates remain.


## Selected batch worker-waiver receipt engine (P19)

The explicit read-only inspectWorkBatchWaiverReceipt library API observes ONE
selected refund in direct chain97 waivePaymentsMany calldata containing 1–16
sorted job IDs and exact revisions0–32. It binds worker/call/receipt/block/log
indices, runtime/role/asset/job terms and receipt-height latest revision; exact
positional Transfer/JobSettled/PaymentWaived events must return whole principal
only to the selected original client. Shared two-client20confirmed/gap10,
20-second monotonic lifetime/fences and reread guards remain. Stable settlement
IDs MUST be deduplicated; repeated observations are not additional payments.
Other jobs' terms/assets/amounts/storage are NOT verified; otherBatchJobsVerified
stays false. No batch totals, consumed ledger, CLI, service, signer or new config.
Existing direct APIs, contracts, root pins and authority gates stay unchanged.

The zero-account compiled waiver drill uses a snapshot-restored block to observe
both existing refunds at20confirmations via actual HTTP/ABI, repeat stable IDs,
reject wrong amounts/direct-route confusion and preserve balances/liabilities,
height and role nonces during reads. The snapshot is restored before old replay
assertions. No extra financial transaction or clock override; two clients still
reach ONE local synthetic fixture, not independent providers or public custody.
Always null current authorization/false execution, provider independence,
finality, capital/identity/delivery/IP/legal/fairness and full-readiness claims;
full P19 and audit/deployment qualification remain unfinished.


## Work settlement receipt own-topic validation (P19/P10)

Both shared receipt topic validators now require own canonical bytes32 values at
all three expected slots; receipt rereads also require own slots before JSON
comparison (which would otherwise serialize inherited values). Missing slots and values supplied only by an array
prototype reject before canonical event comparison or batch digesting. Payment,
result, cancellation, expiry, worker refund, arbitration and selected/all-job
batch routes preserve their calldata, amount, runtime, role, confirmation,
20-second lifetime, reread, stable-ID and null/false authority rules. Tests cover
every log/slot, either peer, initial/reread/both observations, inherited slots
and dense controls. Two new groups fail on old source; dense controls pass.
JSON cannot encode holes; this is an in-process client-result boundary, not a
claimed public JSON-RPC exploit. No contract, schema, ledger recovery, signer,
configuration or financial authority change; full P19/P10 remains incomplete.


This ledger describes implementation, not audit or deployment approval. See RELEASE_HANDOFF.md for existing release evidence and owner-operated deploy/drill workflows. The expanded product direction is recorded in merged PR #61. Preserve the frozen Standard candidate.

## Compiled worker batch waiver RPC lifecycle (P19)

A separate zero-account local VM drill now executes the unchanged batch waiver
contract over actual HTTP/ABI: two clients/assets and revisions0/1, stale/foreign/
paused rejection, later inexact transfer rollback, identical-calldata retry,
canonical six-log refunds, immutable result/funding history and successful replay
rejection. Reverts have no receipt logs and preserve all financial state. The
new workflow step/artifact leaves old runtime, transactions and budgets unchanged.
Owned compiled source hashes are checked before execution; failure removes old
PASS JSON. This is synthetic local component evidence, not public deployment,
independent providers, capital/identity/delivery/IP/legal/fairness, a batch receipt
reconciliation engine or full P19/audit readiness. See SYNDICATE_WORK_ESCROW.md.
Standard/root pins, contracts, old readers and all release gates remain unchanged.

## Atomic worker batch payment waiver (P19)

The isolated chain97 WorkEscrow now lets one named worker voluntarily waive
1–16 accepted jobs at their exact latest revisions. All IDs/roles/states/runtime
pins are checked before refunds; existing exact settlement returns whole
principal only to original clients across supported assets. Any later failure
rolls back all earlier balances, states and liabilities; history and funding
bindings persist. Single-job APIs and direct receipt readers remain unchanged.
Compiled VM tests cover mixed clients/assets, events, stale/foreign/unaccepted
jobs, late transfer rollback/retry, ordering/bounds, pause/chain and bounded fuzz.
No signer, service, public deployment, batch receipt ledger or delivery/IP/legal
verdict; full P19 remains unfinished. New bytecode is not old audit/deployment
approval. See SYNDICATE_WORK_ESCROW.md; Standard/root pins and gates remain.

## Compiled custody lifecycle through project MCP (P03/M07)

The existing zero-account Pancake custody rehearsal now invokes the actual
stdio MCP tool/resource at its existing held, paused and released checkpoints.
Positive outputs must match direct unchanged engine reads except their own
observation times; released custody rejects privately. Policy SHA/bytes, fixed
project, null/false authority, unknown claimable/value and before/after chain,
role nonces, NFT/position and custody state are checked. No new transaction,
mining or clock override; old lifecycle/receipt assertions and budgets remain.
Two synthetic origins still reach one local fixture, not independent providers
or public custody. Full P03/M07, audit and operational readiness remain unfinished;
see PROJECT_LIQUIDITY_CUSTODY_MCP.md. Standard/root pins and all gates remain.

## Project custody-state MCP integration (P03/M07)

A separately disabled tool/resource now invokes the actual unchanged custody
engine and its same-snapshot LP reader. Fixed project/asset binding, separate
disclosure review, bounded literal policy, restricted two-origin read transport
and policy pins around all awaited RPCs preserve null/false authority. Existing
tools remain; all readers share four reads/minute. Actual child stdio/HTTP ABI
tests cover held-state data, wrong/released states, coexistence, quotas, policy
changes and timeout/failure fences. No current custody/creator/capital/provider/
finality or full-readiness approval; no signer, public service, ledger or real
configuration. See PROJECT_LIQUIDITY_CUSTODY_MCP.md. Full P03/M07 remains
unfinished; old engines, contracts, Standard/root pins and gates are unchanged.

## LP MCP policy descriptor admission (P03/M07 security)

The actual optional LP adapter now opens policy paths read-only/nonblocking
before its existing regular-descriptor check. Writerless FIFO and FIFO-symlink
policies reject at startup and before/after actual engine observations; valid
regular-file symlinks and exact16KiB policies remain supported. Linux child
regressions reproduce original blocking opens and exercise actual MCP startup.
Only the import/open mode changes; old engine/body/tests, byte/UTF8/schema bounds,
transports, quota, outputs and false authority remain. No generic filesystem
deadline, host-swap defense or Windows FIFO certification. Full P03/M07 remains
unfinished; see PROJECT_LIQUIDITY_MCP.md. Standard/root pins and gates remain.

## Counter receipt required topic slots (M06/P10 security)

The actual direct and complete-batch claim readers now require own values at
every expected Transfer/Claimed topic slot, including receipt rereads. Two
old-source groups accepted sparse/inherited in-process adapter arrays; tests
cover all slots, peers and read stages plus dense controls. JSON cannot encode
holes, so this is adapter validation rather than a demonstrated public RPC
exploit. Four comparisons change; contracts, old reader bodies, IDs, accounting,
CLIs/books, deadlines and authority remain. Full M06/P10 readiness is unfinished;
see COUNTER_CLAIM_RECEIPTS.md. Standard/root pins and all release gates remain.

## Disabled custody receipt operator integration (M07)

An explicit default-disabled local command now invokes the unchanged deposit or
release receipt engine using a bounded strict16KiB input, two reviewed HTTPS
origins and literal byte pins around all7 awaited read methods. Both modes retain
original receipt provenance/dedup IDs, null auth and false financial/readiness
authority. Actual child HTTP/ABI tests cover modes/replay/preflight/private errors
and policy mutation; the existing compiled zero-account Pancake drill consumes
its actual deposit/release receipts through the command and preserves current
chain/NFT/custody state. No ledger, signer, service, real config or financial
action is added. See LIQUIDITY_CUSTODY_RECEIPT_OPERATOR.md; full M07 remains
unfinished. Contracts, old readers, Standard/root pins and gates are unchanged.

## Complete custody receipt topic slots (M07 correctness)

Both actual deposit/release readers now compare every expected canonical topic
index and require an own present value before normalization. Two genuine old-source
regressions accepted a missing signature topic from in-process clients; final
tests reject holes, inherited values, null and undefined at every topic position
while preserving valid dense receipts/replay. Ordinary JSON cannot encode holes;
this is an adapter-boundary correctness fix, not public-RPC or financial-exploit
evidence. Existing contracts, runtime, workflows, clocks, IDs, Standard/root pins
and authority gates remain unchanged. Full M07 readiness remains unfinished;
see the deposit/release receipt docs for limits and exact evidence.

## Historical managed-liquidity deposit receipts (M07)

A separate explicit read-only engine binds direct governor deposit calldata to
canonical manager Approval/Transfer and custody deposit logs, full receipt-height
policy/position and recorded held state. The actual unchanged position body and
custody validator run under one30-second monotonic lifetime, two-client
confirmation/agreement and receipt/header rereads. Stable IDs require dedup; no
ledger, badge, fee processing, signer, service, real config or financial authority.
The existing compiled zero-account Pancake drill reads its actual deposit receipt
after release, checks stable replay, wrong governor, mutual route rejection and
unchanged current chain/NFT/custody state. This is historical component evidence,
not current custody, capital origin, independent providers, full M07, audit or
activation approval. See LIQUIDITY_CUSTODY_DEPOSIT_RECEIPTS.md. Old readers,
contracts, Standard/root pins and gates remain unchanged.

## Historical managed-liquidity release receipts (M07)

A separate explicit read-only engine binds a direct governor release call to the
exact manager Approval/Transfer and custody release events, receipt-height full
position/role/runtime policy, treasury ownership and terminal custody state.
It reuses the actual unchanged position observation body under one30-second
monotonic lifetime and two-client confirmation/agreement/reread checks. Stable
IDs require downstream deduplication; no ledger, badge, fee processing, signer,
service, real config or financial authority is added. The existing compiled
zero-account Pancake fork drill consumes its actual release receipt and preserves
prior assertions. This is historical component evidence, not independent providers,
treasury control, capital origin, full M07, audit or activation approval. See
LIQUIDITY_CUSTODY_RELEASE_RECEIPTS.md. Standard/root pins and gates remain.

## Counter observation operator integration (M06/P10)

A default-disabled local command now reads existing protected Counter history
offline or, with a separate write gate, captures one explicitly reviewed complete
batch through the unchanged book/receipt engine. Literal bounded input pins,
read-only preflight, existing book identity and original predecessor constrain
capture; replay retains original times and positive conflicts persist quarantine.
Actual child HTTP/ABI/SQLite tests and the compiled zero-account two-asset drill
exercise the command. No initialization, reset, automatic retry/recovery, service,
signer, real configuration or financial authority is added. Raw asset units are
not balances/totals/badges or verified eligibility/funding. Full M06/P10 remains
unfinished; see COUNTER_CLAIM_OBSERVATION_BOOK.md. Standard/root pins/gates remain.

## Durable Counter batch-claim observations (M06/P10 reconciliation)

A separate disabled local observation book connects the unchanged complete batch
claim reader to protected WAL/FULL SQLite. It binds one escrow/recipient policy,
retains per-asset raw units and stable IDs, deduplicates transactions/rounds,
preserves original retry times and quarantines positive conflicts without
rewriting history. A compiled zero-account two-asset rollback fixture exercises
the actual Counter/reader/book path. No balances, totals, badges, global claim
consumption, current eligibility or financial authority follow. No public service
or automatic recovery; see COUNTER_CLAIM_OBSERVATION_BOOK.md. Full M06/P10 remains
unfinished; contracts, old readers/drills and frozen Standard are unchanged.

## Compiled work observation rollback/conflict drill (P19 reconciliation)

A separate zero-account local VM connects actual compiled two-asset batch
payments to the unchanged all-job reader and durable observation book. Missing
receipts after VM rollback reject without changing history; an actually valid
alternate payment for the same jobs must trigger persistent conflict quarantine.
Original times/head/entries survive reopen, and quarantined capture fails before
RPC. Readers preserve chain state. This is one local fixture, not independent
providers, public reorg/finality, retained storage, recovery or full P19 readiness.
See WORK_BATCH_OBSERVATION_BOOK.md; contracts/readers/book/old drills unchanged.

## Notebook Buffer memory-path guard (P03/P18 security)

The notebook's existing memory-target guard now includes Buffer paths before
filesystem/SQLite access while preserving ordinary Buffer disk paths. Actual
old-source regressions reproduced successful ephemeral initialization and later
schema failure; they do not establish an accepted note in that connection.
Append/reopen/original retry identity remains intact. Two comparison changes
preserve schema, clocks, history, interfaces and false authority. No automatic
repair, reset or recovery. See PROJECT_RESEARCH_NOTEBOOK.md.

## Creator registry filesystem target binding (P02/P06 security)

The actual creator registry now rejects SQLite memory/URI targets before filesystem
or policy/SQLite access. A real old-source fixture imported authorization history
into shared memory behind an empty literal file, then lost it on close; ordinary
disk paths preserved records and replay rejection. Two early predicates preserve
schema, signatures, clocks, RPC fences and null/false authority. URI configurations
need operator inspection, never silent stripping, reinitialization or revision
reset. See CREATOR_CANON_REGISTRY.md; no migration/recovery or real creator proof.

## Agent contribution and release qualification guides (P24 documentation)

Root agent instructions, contribution/setup guidance, an implementation work queue,
a PR evidence template and a testnet/mainnet qualification checklist now point to
the full M01-M08/P01-P24 scope and actual engine entrypoints. Readiness stages,
mainnet fork early-return limits and separate audit/activation gates are explicit.
README setup follows existing CI pins. This documentation adds no engine,
deployment, audit approval, accepted baseline or financial authority.

## Research notebook filesystem target binding (P03/P18 foundation)

Initialization and opening now reject SQLite memory/URI targets before filesystem or
SQLite access, preserving ordinary relative/absolute paths and all existing
schema, history, retry, clock and authority rules. Real SQLite regressions cover
URI initialization and a shared-memory target behind an unrelated literal file;
ordinary disk reopen/retry remains a positive control. URI configurations require
operator inspection, never silent stripping, empty replacement or history reset.
See PROJECT_RESEARCH_NOTEBOOK.md. This is not recovery, independent timestamp,
verified research, full Arena/workspace or public-service readiness.

## Research notebook commit-clock fence (P03/P18 foundation)

The actual durable append now checks a safe positive clock after metadata writes
and before COMMIT. Invalid/reversed time rolls back note and metadata atomically;
valid advances preserve original timestamps/digests and exact retries. Schema,
limits, correction/history rules, operator/MCP interfaces and authority remain
unchanged. See PROJECT_RESEARCH_NOTEBOOK.md; this is not independent timestamp,
research verification, full Arena or public-service readiness.

## Precise local LP custody failure locations (M07 diagnostics)

The unchanged local fork lifecycle now labels each custody substep and reports
only a bounded initial public fork height on failure. Calls, assertions, budgets,
failure exits and pass-artifact rules remain unchanged; errors and RPC payloads
stay private. These diagnostics do not classify PR187's two failed main LP jobs
or establish readiness. See MANAGED_LIQUIDITY_READER.md.

## Disabled funding-receipt operator integration (P19 component)

The explicit `inspect-work-funding.mjs` CLI calls the unchanged direct funding
reader with a bounded strict policy, two reviewed HTTPS read origins and literal
before/after policy-byte pins. It preserves historical provenance, null auth and
false execution/readiness; no signing, ledger consumption, service or real config.
Actual child HTTP/ABI tests and the existing compiled zero-account escrow drill
cover legacy/ID-bound receipts, stable replay, wrong terms and read-only state.
See [WORK_FUNDING_RECEIPTS.md](WORK_FUNDING_RECEIPTS.md). This component does not
complete P19 or establish independent providers, legitimate capital or readiness.

## Historical direct work funding receipts (P19)

A separate read-only engine binds direct legacy/ID-scoped funding calldata to
whole client-to-escrow principal transfer, canonical JobFunded/optional FundingBound
and receipt-height runtime/role/asset/job terms. Stable IDs require downstream
deduplication; no current consent, capital origin, solvency or financial authority
is inferred. Existing compiled zero-account first/second funding receipts exercise
both routes without new transactions or time changes. Old settlement/book engines
are preserved. See WORK_FUNDING_RECEIPTS.md; full P19 readiness remains incomplete.

## Explicit work observation-book operator (P19)

A default-disabled local command reads an existing protected book without RPC or,
with a separate write gate, captures one explicitly reviewed complete result batch
through the unchanged book/reader. It pins book identity, literal input bytes and
original expected head; reopen/replay preserve original receipt history/times.
No initialization, automatic retry/recovery, service, signer or financial authority
is added. See WORK_BATCH_OBSERVATION_BOOK.md for exact bounds, uncertain-commit
handling and privacy/host/provider limits. Full P19 readiness remains incomplete.

## Compiled escrow → durable observation book integration (P19)

The existing zero-account compiled WorkEscrow drill now captures its actual
two-asset paid result batch through the unchanged observation book. Receipt
digest/IDs, per-asset units and SQLite index match; reopen/replay retain original
timestamps/history, and a wrong later-job policy writes nothing. Before/after
chain height, nonces, balances and liabilities stay unchanged during book reads.
Only the temporary book is written. The old ten-job/worker-batch cases and all
reader/contract/root/clock/authority gates remain. One local VM is not independent
providers, real capital/public custody, reorg recovery or full P19 readiness; see
WORK_BATCH_OBSERVATION_BOOK.md for evidence scope and remaining limits.

## Durable work batch observation book (P19)

An explicit default-disabled local SQLite book calls the unchanged all-job batch
reader before atomic historical record/receipt/job-index writes. Expected-head
rechecks, exact replay without timestamp renewal, five-second commit freshness
and final clock checks preserve history; conflicting positive observations or
duplicate jobs across transactions permanently quarantine without replacement.
Actual HTTP ABI/SQLite tests cover replay/reopen, two-handle dedup, later-job
failures, clock rollback, corruption and capacity. This is not financial
settlement, independent-provider proof or current authorization; no service,
signer, real config, recovery/reset or full P19 readiness is added. See
WORK_BATCH_OBSERVATION_BOOK.md. Standard/root pins and all gates remain.

## Complete batch payment operator integration (P19)

A separate default-disabled local command now invokes the actual unchanged
all-job result-payment observer. Complete1–16 policies, bounded strict UTF8 and
literal before/after pins bind the existing two-provider read engine; output
retains per-asset units, stable dedup IDs, null authorization and false authority.
Actual child CLI/HTTP ABI tests cover1/2/16jobs, replay, later-job failures,
preflight, provider restrictions and64-KiB/FIFO bounds. No writes, financial
actions, ledger, service or real configuration added; fixture evidence is not
provider independence, legitimate capital, public custody or full P19 readiness.
See WORK_BATCH_PAYMENT_CLI.md. Standard/root pins and release gates remain.

## Reported-profit append completion clock (M01/M07/M08)

The actual durable reported-profit book checks its clock after metadata writes
and before commit. A reproduced late reversal now rolls back all three tables;
reopen/explicit retry and a valid advancing final clock preserve original record
time, digest and retry semantics. No schema, reducer, allocation, recovery or
authority changes. Host time remains trusted and can change after the final
sample; no global clock/power-loss certification is implied. See
REPORTED_STRATEGY_PROFIT_BOOK.md. Standard/root pins and release gates remain.

## Character-policy descriptor bounds (P02/P03/P06 security)

The actual historical reader, pinned provenance reader and revalidator now read
policy bytes from nonblocking regular descriptors with a16-KiB+1 allocation and
finally-close. Three actual writerless-FIFO child regressions failed old source;
final tests cover direct/symlink FIFOs, valid16-KiB regular policies, strict UTF8,
oversize rejection before RPC and unchanged SQLite. Existing policy pins, clocks,
RPC limits, signatures, schema and null/false authority remain. Regular symlinks
stay supported; no general filesystem deadline or host-swap guarantee is claimed.
See CREATOR_CANON_REGISTRY.md; Standard/root pins and release gates are unchanged.

## Creator provenance completion freshness (P02/P03/P06)

The actual shared revalidator now checks both RPC block ages against the same
final observation time after peer and local-history/policy checks. Two old-source
regressions reproduce119→121-second acceptance during factory reads and final
peer completion; final checks reject both while retaining the120-second boundary
and unchanged SQLite bytes. Existing20-second lifetime, stored evidence,
signatures, currentAuthorization null and execution false remain. MCP/Co-Pilot
inherit the fix without service/configuration or Standard/root changes. See
CREATOR_CANON_REGISTRY.md; full authenticated creator readiness remains unfinished.

## Saved character + live project Co-Pilot integration (M02/P02/P06)

An explicitly enabled local Co-Pilot mode combines the actual saved-character
reader, public project brief and two-client provenance revalidator. Policy and
history preflight, creator/factory binding, final record/policy rereads and one
shared lifetime discard stale or changed inputs. A deterministic announcement
copies literal saved wording with a source revision/digest and required review;
blanks remain blank. Separate plaintext disclosure review is required; no model,
registry write, public canon, publishing, login or financial authority is added.
Actual child CLI/HTTP ABI/SQLite tests cover the composition, private failures
and disabled gates. One fixture is not independent-provider/real-creator proof;
full M02/P02/P06 and release readiness remain unfinished. See
CREATOR_CHARACTER_BRIEF.md. Existing modes/Standard/root pins and gates remain.

## Creator import commit checks (P02/P06)

The actual creator registry now checks its original observation window, signed
expiry and monotonic host clock after version insertion and after clock update,
before commit. Failures roll back both writes; valid imports preserve original
accepted-at and RPC evidence. Two old-source regression groups exercise real
SQLite writes, rollback/reopen, explicit retry and valid clock persistence.
No schema, signature payload, RPC limits, service, publication or execution
permission changes. Full authenticated creator integration remains unfinished;
see CREATOR_CANON_REGISTRY.md for trust and final-sample limitations.

## Complete Counter batch payout observation (M06)

A separate read-only library now verifies every entry of an exact1–32-round
direct claimMany receipt under one shared20-second monotonic lifetime. Complete
policy/calldata and2N canonical transfer/claim pairs bind all selected recipients,
assets, amounts and receipt-height round state. Both clients and rereads must
agree on the whole normalized receipt checksum; per-round evidence IDs require
permanent downstream deduplication. No cross-asset total, ledger, badge, signer
or execution authority is added. Actual compiled local two-asset integration
checks replay, a wrong later amount and direct-route separation; old direct
source/previous lifecycles and all release gates remain. See COUNTER_CLAIM_RECEIPTS.md.

## Direct Counter claim receipt observation (M06)

An explicit read-only library now binds a successful direct single-round payout
to canonical transfer/claim events, caller/recipient/amount/round, receipt-height
runtime/roles/asset pins and transaction/block indices. Two-client confirmation,
agreement and reread checks share one real20-second monotonic lifetime. Stable
evidence IDs require downstream deduplication; no ledger, badge or current claim
authority is implied. Actual compiled local Counter HTTP/ABI integration covers
replay, wrong amounts and batch exclusion while preserving prior lifecycles.
Provider/finality/eligibility/capital/solvency/execution/full-readiness flags remain
false. No contract or Standard/root pins change; see COUNTER_CLAIM_RECEIPTS.md.

## Local reported-profit operator integration (M01/M07/M08)

A default-disabled local command now reads or explicitly appends to the actual
unchanged durable reported-profit book/reducer. Separate write enablement, pinned
book identity/policy, read-only history preflight, bounded strict inputs and the
original expected head constrain operator reports. Real child/SQLite tests cover
loss carry, historical retries, stale heads and invalid inputs. No initialization,
repair, automatic retry, RPC, signer, cash/buyback/burn or verification authority is
added. Reports remain unverified assertions; full strategy readiness is unfinished.
See REPORTED_STRATEGY_PROFIT_BOOK.md; Standard/root pins and all gates remain.

## Receipt-store literal disk paths (M01/M07/M08)

The actual fill journal, receipt queue and schema2 native-gas book now reject
SQLite URI strings before opening, including URI memory databases. Three actual
child-process regressions fail old source and verify rejection/no file creation,
while ordinary relative disk paths/reopen retain their existing behavior. No
normalization, migration, reset, recovered history or filesystem durability proof
is implied. Schemas, policies, holds, clocks, accounting and release gates remain
unchanged. See RECEIPT_STORE_PATHS.md; full engine readiness remains unfinished.

## Durable reported strategy-profit accounting (M01/M07/M08)

An explicitly enabled local library now persists operator-reported cycles through
the unchanged profit reducer, with pinned policy, expected-head transactions,
receipt-label uniqueness, full-history replay and atomic rollback. Exact historical
retries preserve original time/digest without another allocation. Real SQLite,
reopen, clock/corruption/capacity/overflow and two-process tests cover the slice.
The bounded256-report book defaults read-only and has no reset/prune/recovery,
signer, service or real configuration. Costs, receipts and closed inventory remain
assertions; realized-profit verification/financial execution/readiness stay false.
No percentage or release baseline is adopted. Full M01/M07/M08 remains unfinished;
see REPORTED_STRATEGY_PROFIT_BOOK.md for all authority/storage/review limits.

## Queue lease and clock commit fences (M01/M07/M08)

The actual receipt queue rechecks safe monotonic time and persists the final
observed clock before each mutation commit. Claim/completion/retry also reject a
lease expired at that final check, using the stored deadline for finishes. Failed
checks roll back state, attempts, fences and clock together; explicit retry is
possible without resetting history. Three corrected old-source regression groups
cover real SQLite rollback/reopen and exact expiry. Schema1, 120s leases, capacity,
backoff, terminal deduplication and observer ordering remain. This is a local
commit guard, not atomic three-store settlement or runtime readiness. See
RECEIPT_OBSERVER_QUEUE.md; all release gates remain unchanged.

## Native-gas charge commit freshness (M01/M07/M08)

The actual schema2 native-gas book rechecks safe nonnegative monotonic wall time
and original verified-fill age before its charge transaction, after the write
lock and immediately before successful charge/replay commit. Expiry rolls back
charge, evidence and hold deletion together; reservations/holds remain blocked.
Three corrected old-source regressions include actual separate-process SQLite
contention and replay/reopen. Original budget-clock policy, ceilings, loss of
trust/quarantine, permanent deduplication and WAL/FULL remain. This is per-charge
commit admission, not atomic journal/book/queue settlement, recovery, signer
limits or full strategy readiness. See STRATEGY_NATIVE_GAS_BUDGET.md.

## Journal commit freshness under write contention (M01/M07/M08)

The actual durable fill journal validates a safe nonnegative monotonic host clock
and receipt age before opening its transaction, after the SQLite write lock, and
before successful insert/revalidation commit. An expired or reversed observation
rolls back; conflict quarantine commits remain conservative. Two old-source
regressions include a real competing SQLite writer across the 60-second boundary.
This is local commit validation, not atomic multi-store settlement, signing,
provider independence, recovery or complete strategy readiness. Existing schema,
WAL/FULL, deduplication and release gates remain. See OMNICHAIN_ARBITRAGE.md.

## Strict realized-profit cycle identities (M01/M07/M08)

The actual pure reducer requires literal string cycle IDs and validates all stored
cycle IDs as dense, canonical and unique before allocation. Coerced inputs and
malformed history fail closed without rewriting balances/history. Two regression
groups fail old source; existing receipt deduplication, full costs, loss carry and
allocation policy remain. This is replay validation, not receipt authentication,
durable settlement, capital provenance or execution. No buyback rate is adopted;
Standard/root pins and all release gates remain unchanged. See OMNICHAIN_ARBITRAGE.md.

## Atomic worker result batches (P19)

The isolated default-paused chain97 WorkEscrow adds 1–16 strictly sorted worker
result submissions with exact expected revisions. Every named-worker role, Accepted
state, per-job deadline, asset runtime, nonzero/nonrepeated hash and 32-revision cap
is checked before any append/event. Any failure rolls back all entries; no funds,
liabilities, recipients, terms or settlement state change. Existing single/batch
client approval and all prior paths remain; worker commitments never grant client
payment consent or prove content/delivery/IP/identity/legal fairness. New bytecode
requires fresh exact-source evidence, never old deployment/audit approval. Tests
and a separate compiled two-job/two-asset fixture cover history/replay/late failure,
explicit retry and latest client payment while preserving the original ten jobs.
No Standard/root pins, economics, signer/service/configuration or release gates
change. Full P19 remains unfinished; see SYNDICATE_WORK_ESCROW.md.

## Combined V3 route observation (M01/M07/M08 component)

An explicit read-only library now invokes the actual V3 buy/sell readers on two
distinct testnets and combines their quotes with the unchanged spread/cost model.
Full identity/precision/accounting policy preflight precedes RPC; one shared real
20-second lifetime fences both legs and final header rereads, with both quotes
rechecked for age at the same completion time. Costs/cash/inventory stay supplied
assertions; all execution/provider/finality/realized-profit/readiness flags remain
false. No wallet, CLI/service/config, financial settlement or public route is
enabled. Actual two-server HTTP/ABI tests are synthetic component integration,
not independent providers or full engine readiness. Existing readers/economics/
Standard/root pins and gates remain. See ARBITRAGE_V3_QUOTES.md.

## Canonical realized-profit receipt identities (M01/M07/M08)

The actual pure profit reducer rejects leading-zero log-index aliases in new
cycles and rejects noncanonical or duplicate stored receipt history without
rewriting it. Two regressions failed old source. Original loss carry, full-cost
subtraction, policy-bound allocation, totals and canonical receipt format remain.
This is accounting replay hardening, not authenticated settlement, durable
accounting, legitimate capital, buyback execution or full engine readiness. No
Standard/root pins, economics, signer/configuration or release gates change.
See OMNICHAIN_ARBITRAGE.md for legacy-history and trust boundaries.

## Coherent all-entry Syndicate result-batch observation (P19)

An explicit library API now requires one fully validated policy per call entry,
preflights all policies before RPC, then invokes the actual selected-payment
engine for every job under one shared20-second failure/clock lifetime. All
receipts must share one bounded byte-consistency digest and receipt header;
per-job payment units and stable IDs stay separate. No partial result, totals,
consumed ledger, signing, execution, capital/provider/finality/identity or full
readiness claim. Existing selected/direct readers and contract behavior remain.
The compiled two-asset ten-job runtime consumes all-entry observation, replay and
late-amount rejection while preserving previous assertions. No Standard/root
pin/economic/configuration/authority/release gate changes. See
SYNDICATE_WORK_ESCROW.md for checksum, custody and historical trust boundaries.

## Selected Syndicate batch-result receipt integration (P19)

A separate explicit read-only API verifies one selected job in exactly bound
1–16-entry direct approveResultsMany calldata and3N-log receipt framing, reusing
the actual pinned two-client result-payment engine and its20sec failure fences.
Selected amount/recipient/terms/stored revision/hash and stable settlement ID are
checked; other jobs remain explicitly unverified, never a complete batch ledger.
Existing direct routes/CLI/contract behavior and false authority are preserved.
The compiled ten-job/two-asset runtime consumes actual selected observations,
replay and wrong-amount/direct-route rejection while preserving old assertions.
No contracts, root pins, economics, signer/service/config or release gate changes;
full P19/capital/provider/finality/custody/audit readiness remains incomplete.
See SYNDICATE_WORK_ESCROW.md for selected-only and historical trust boundaries.

## Creator-canon operator input bounds (P02/P06 security)

The actual creator operator now bounds policy/draft/signed-update reads on an
opened regular descriptor with nonblocking open, limit-plus-one allocation,
strict UTF8 and guaranteed close. Three writerless FIFO CLI regressions failed
old source; existing signed authorization/revision/storage semantics remain.
No signatures are generated, real profiles enabled or publication/execution
permission granted. This is input/runtime hardening, not hosted authentication
or full creator readiness. See CREATOR_CANON_REGISTRY.md for limits and filesystem
trust boundaries. Frozen Standard/root pins and all release gates remain.

## Actual V3 quote-to-local-venue execution (M01/M07/M08 component)

The existing zero-account Pancake fork runtime now calls the actual unchanged
V3 quote reader for both directions at one twenty-confirmed snapshot, rejects
wrong runtime/precision and verifies that reads leave local state unchanged.
Separate reversible local router swaps compare exact-input sell and exact-output
buy transfer amounts with those quotes, then restore the original fixture before
all existing swap/journal/queue/gas/replay/rollback assertions. Required engine CI
now follows quote source/tests too. No reader, contract, dependency, signer,
service, economics, authority or release gate changes. Synthetic assets and
self-observed fixture pins are compatibility inputs, not independently reviewed
assets, capital, provider/finality, public routes, full engine readiness or audit
proof. See ARBITRAGE_V3_QUOTES.md for timing, scope and remaining gates.

## V3 quote engine shared RPC lifetime

The actual V3 reader now has one fixed20sec rejecting wall deadline, monotonic
safe-clock fences around every RPC and finally fencing for all outcomes. Three
old-source clock/hung-head/hung-simulation regressions failed. The snapshot/math
engine body is preserved; original gas/freshness/block pins/false authority and
CLI remain unchanged. Late results cannot begin follow-on reads; in-flight RPC
is not canceled. This is read-runtime hardening, not executable venue/route,
independent-provider, profit or complete agent/managed-liquidity readiness. See
ARBITRAGE_V3_QUOTES.md.

## Holder-index Redis REST response lifetime

The actual UpstashStore now rejects hung fetch/body reads at a real10-second
per-call lifetime, with monotonic safe-clock fences and bounded8MiB/4096-chunk
strictUTF8 JSON response reading. Two old abort-only hang regressions failed old
source. Existing index/storage commands, Lua scripts, leases, return values and
authentication remain unchanged; no automatic retry/configuration is added.
Timeouts leave any submitted write outcome uncertain, not rolled back. See
HOLDER_INDEX.md for exact limits and reconciliation boundaries. No holder-index,
service, custody, provider/finality or full P09 readiness is inferred.

## Syndicate direct whole-payment CLI integration

Default-disabled inspect-work-payment.mjs calls the unchanged pinned two-client
receipt engine with bounded literal policy and private read-only transports.
Actual child HTTP/ABI tests and compiled escrow runtime compare the original
observation, stable replay evidence and wrong-amount rejection. No signing,
ledger or authority; other settlement routes remain separate. The old job
observer's NULL payment fields are preserved. See SYNDICATE_WORK_ESCROW.md.

## Syndicate arbitrated settlement receipt integration

A separate read-only API binds exact direct fixed-arbitrator resolve(id,uint128)
calldata, selected worker amount0–principal, settled immutable job terms and
canonical payout transfers/JobSettled. It handles zero/full amounts with one
transfer and intermediate splits with ordered worker/client transfers; principal
is conserved and recipients cannot be replaced. Existing receipt routes/output
and old job observer/CLI NULL fields remain intact. The original compiled ten-job
rehearsal supplies its60/40 split, and a separate two-job compiled escrow supplies
zero/full boundaries without changing original balances/count assertions.
No contract/signer/service/root pin/economics/authority/release gate changes.
This is historical receipt observation, not dispute fairness, legal approval,
independent providers, capital origin, custody or full P19 readiness. Batch and
smart-wallet outer-call receipt integrations remain separate. See
SYNDICATE_WORK_ESCROW.md.

## Syndicate worker decline and waiver receipt integration

A separate read-only worker-refund API binds exact direct named-worker decline
or revision-bound waivePayment calldata to whole-principal Transfer back to the
original client, adjacent JobSettled and canonical JobDeclined/PaymentWaived.
Receipt-height latestResultRevision must be zero for decline or the explicitly
expected0–32 waiver revision. Other receipt APIs retain their exact routes/output;
old job observer/CLI payment fields remain NULL. Actual compiled ten-job worker
refund receipts and rejection paths are integrated. Test-only bounded real-clock
alignment precedes the unchanged20sec reader; no contract/workflow limits change.
No signer/service/config/root pin/economics/authority/release gate changes.
Matching receipts are not independent providers, capital origin, current consent,
identity, delivery, IP, fairness, legal or full P19 approval. Arbitrated splits,
batches and smart-wallet outer calls still require separate receipt integrations.
See SYNDICATE_WORK_ESCROW.md.

## Syndicate expired-job third-party refund receipts

A separate explicit read-only API verifies a direct caller other than the original
client cancel(id), requiring receipt-block timestamp strictly after the stored
acceptBy deadline, caller-bound transaction/JobSettled and whole principal
Transfer back to the original client. Existing direct-client cancellation and
payment/result APIs retain their exact routes. The compiled rehearsal feeds job
four's governor-triggered expired refund after the existing bounded real-clock
alignment, without changing the20sec reader or any contract/workflow time limit.
Old observer/CLI payment fields remain NULL; no signer/service, financial
execution, root pin, economics or release gate is enabled. Caller labels and
matching receipts do not prove independent providers, pre/post balances,
legitimate capital, current consent, legal approval, public custody or full P19.
Worker decline/waiver, arbitration and batch receipt integration remain separate.
See SYNDICATE_WORK_ESCROW.md.

## Syndicate direct client cancellation receipts

A separate explicit read-only cancellation API uses the existing pinned receipt
engine to bind direct original-client cancel(id) calldata to the whole principal
Transfer back to that client and adjacent JobSettled(0, principal, client).
Payment/result readers retain their exact routes and reject cancellation receipts.
The compiled ten-job rehearsal now feeds job two's actual cancellation into the
reader, rechecks stable evidence identity, rejects wrong amounts and proves route
separation. Old storage observer/CLI payment fields remain NULL. No contract,
signing/service, root pin, economics or release-gate change. Third-party expiry,
worker decline/waiver, arbitrated split and batch receipt readers remain separate
unfinished work. Two clients of one local fixture do not establish independent
providers, public custody, capital provenance, audit or full P19 readiness.
See SYNDICATE_WORK_ESCROW.md for exact bindings and limitations.

## Syndicate revision-bound payment receipt integration

A separate read-only result-payment API consumes the actual shared pinned
receipt engine, requiring exact direct approveResult job/revision/hash calldata,
receipt-height stored latest revision/hash and a canonical adjacent third
ResultApproved event. Legacy direct-payment two-event behavior stays exact;
old observer/CLI NULL payment fields and every contract method remain intact.
Actual compiled ten-job integration observes job five, stable identity, wrong
revision and legacy-reader rejection. The fixture waits at most60sec for its
preexisting expiry-shifted timestamp to become historical; the production
20sec clock/confirmation/failure gates and workflow budgets remain unchanged.
No contract, signer/service, custody, authority, economics, root pin or release
gate changes. Other settlement receipt routes/full P19 remain unfinished;
ONE fixture is not public custody/providers/audit proof. See SYNDICATE_WORK_ESCROW.md.

## Syndicate direct whole-payment receipt integration

A separate explicit read-only two-client engine binds an actual direct client
approvePayment receipt to exact calldata, mined block/transaction/indices,
pinned receipt-height runtimes/roles/job terms and canonical adjacent whole
worker-transfer/zero-refund settlement events. Rereads and real20-second monotonic
failure fences reject changed or late observations. Stable evidence IDs require
consumer deduplication; no ledger, authority or readiness is granted. The old
job observer/CLI keeps NULL payment fields. Compiled ten-job HTTP/ABI integration
consumes the actual first payment, stable replay and wrong-amount rejection while
preserving every prior job/batch/refund/split test. Other settlement methods reject
in this narrowly scoped reader; contracts and prior capabilities are unchanged.
ONE local zero-account fixture is not independent providers/public custody/capital
or full P19/audit readiness. Standard/root pins/economics/gates unchanged. See
SYNDICATE_WORK_ESCROW.md for historical-height and trust limits.

## Syndicate atomic revision-bound result approvals

The isolated WorkEscrow adds client-only atomic approval of1–16 sorted job IDs,
each bound to its exact latest submitted revision/hash before any payment.
Existing exact whole-payment settlement preserves fixed workers, runtime/backing/
liability checks and receipts; any later failure rolls back all earlier effects.
Explicit retry/replay rejection and all legacy job paths/history/funding IDs are
preserved. Unit/boundary/foreign-client/reentry/conservation fuzz tests and the
compiled ten-job/two-asset local HTTP/ABI rehearsal cover stale rejection, late
transfer rollback, exact retry and receipt fields. ONE zero-account fixture does
not establish identity/delivery/IP/fairness/legal/legitimate capital/providers/
public custody or full P19 readiness. Changed isolated runtime requires fresh
deployment/audit evidence; no Standard/root pin/economic/authority/configuration
or release-gate changes. See SYNDICATE_WORK_ESCROW.md.

## Local strategy deployment failure visibility

The existing venue-fork rehearsal retains its failure status and all deadlines,
while submitted deployment failures add five bounded read-only loopback
observations with strict transaction binding and sanitized quantity-only output.
A real three-second diagnostic deadline fences late results. Actual zero-account
standalone pending/mined transaction tests exercise the reader without treating
an intentionally stalled fixture as reproduction of prior fork CI failures.
Earlier PR150 timeouts remain unclassified and unapproved; no retry, mining,
fee/nonce change, mock fallback, contract/dependency/root-pin/economic/authority
or release-gate change is introduced. See STRATEGY_EXECUTOR.md for non-atomic,
in-flight/event-loop and evidence limits. This does not complete M01/M07.

## Counter atomic-batch operator review CLI

A separate default-disabled one-shot CLI now consumes the unchanged actual
multi-asset funding review engine using a bounded16KiB strict literal policy
and restricted read providers. Output retains unsigned per-asset amounts/dust,
consecutive IDs and original block/deadline; checksum is not authentication,
authorization null and execution/readiness false. Actual child HTTP/ABI tests
and the compiled zero-account escrow rehearsal consume CLI bytes through
rollback/exact retry/replay rejection and recorded claims. No contract, signer,
approval, persistence, automatic retry, service or real configuration is added.
ONE fixture is not public custody/providers/legitimate capital/holder eligibility
or full M06/P04/audit approval. Standard/root pins/economics/gates unchanged.
See COUNTER_ROUND_ESCROW.md.

## Counter unsigned atomic-batch runtime integration

An explicit read-only library API prepares the existing isolated multi-asset
snapshot funding call through the actual allocation engine for each asset.
Whole-policy preflight, same-snapshot/round agreement, final header/age checks
and one shared20-second clock/failure fence reject partial or late reviews.
Per-asset amounts/dust and consecutive IDs remain separate. Actual compiled
zero-account HTTP/ABI integration executes the returned bytes and preserves
late transfer rollback, exact retry, replay rejection and recorded claims.
No contracts, signer, approval, CLI/service/configuration or financial authority
added. ONE fixture is not public custody, independent providers, eligibility,
fee/capital origin or full M06/readiness/audit approval. Standard/root pins,
economics and every release gate remain. See COUNTER_ROUND_ESCROW.md.

## Counter atomic snapshot funding batch

The isolated chain97 Counter escrow adds governor-only paused atomic funding
of2–10 sorted distinct payout assets, each retaining its own exact newly funded
round/rights/liability and SAME original block/hash/deadline reference with its
actual round ID. Any later failure rolls back every earlier transfer, allowance,
event, snapshot and entitlement; explicit retry and successful-batch replay
rejection preserve the original reference. Legacy single-round/claim behavior
is unchanged. Unit/boundary/conservation fuzz tests and actual compiled zero-
account HTTP/ABI funding rollback/retry/receipt/claim integration cover the slice.
No automatic basket selection/rotation, eligibility/fee/capital proof, gas-cost
optimization, recovery, public custody or full M06/readiness/audit approval is
established. Changed isolated runtime needs fresh deployment/audit evidence;
Standard/root pins/economics/authority/configuration/release gates unchanged.
See [COUNTER_ROUND_ESCROW.md](COUNTER_ROUND_ESCROW.md).

## Syndicate operator job-reader CLI

Default-disabled `inspect-work-job.mjs` consumes the unchanged actual two-client
job reader using a bounded literal16KiB policy and restricted HTTPS transports.
Policy mutation discards output; checksum is only a byte binding, snapshot times
remain original and all authorization/payment/readiness limits are preserved.
No signer, calldata, financial action, persistence, service or real configuration
is added. Actual child HTTP/ABI tests and the compiled eight-job local runtime
compare Funded/Accepted/paused/Disputed/Settled data and result history with the
library, while retaining all earlier settlement/rollback/retry checks. ONE local
zero-account fixture is not independent providers, public custody, verified
parties/capital or full P19/audit/mainnet readiness. Contracts/Standard/root pins,
economics and all gates unchanged. See [SYNDICATE_WORK_ESCROW.md](SYNDICATE_WORK_ESCROW.md).

## Social ownership stream work bound

The actual shared social ownership HTTP reader now caps non-final fragments at
4,096 per attempt, including empty fragments, before byte counting/decoding or
ownership projection. Empty/tiny regressions failed unchanged source; boundary,
retry/cleanup and existing actual HTTP/deadline tests cover the fix. Body limits,
eight-second attempt clock/failure fences, one retry and platform fallbacks remain
unchanged. Highly fragmented valid responses may reject; this is not an upstream
memory or whole-verification time/work bound. No attestor/binding/claim/financial
authority, configuration, contract, dependency or frozen Standard changes. Full
M04 and all release gates remain incomplete. See [SOCIAL_FEES.md](SOCIAL_FEES.md).

## Syndicate pinned job-state integration

An explicit chain97 read-only `inspectWorkEscrowJob` library API checks supplied
escrow/asset runtime and immutable role pins, intended job terms, all bounded
result revisions and reported selected liability/backing through two clients
at one twenty-confirmed, rechecked fresh block. Funded/Accepted/Disputed/Settled
and pause state are observed; real twenty-second lifetime/monotonic clock fences
late work. Settled storage does not reconstruct payment receipts: paid/refund/tx
stay null and authorization/delivery/fairness/provider/finality/global-solvency/
capital/execution/full-readiness remain unknown or false. No signer, service,
CLI/HTTP/MCP, real configuration or financial action added. The actual compiled
eight-job HTTP/ABI local rehearsal consumes the reader and preserves previous
settlement/rollback/retry checks. ONE zero-account fixture is not independent
providers, public custody or full P19/audit/mainnet approval. Standard/root pins,
economics and gates unchanged. See [SYNDICATE_WORK_ESCROW.md](SYNDICATE_WORK_ESCROW.md).

## Bitcoin serialized size and supplied-byte rate accounting

The actual legacy/SegWit transaction parser adds exact base/witness-related
byte counts, BIP141 serialized weight and ceiling virtual bytes. The existing
supplied-parent engine uses that actual child size as an exact rational
denominator for its unverified input-minus-output arithmetic. No floating
rounding or live fee/payment claim: fees/rate and sigop-adjusted policy size
stay null; mempool policy and all earlier authority/readiness flags stay false.
Tests include genesis, mixed witness, CompactSize boundaries, all ceiling
residues, changed witness/unchanged txid, existing 100kB bound and actual gated
CLI modes. Primary BIP141/Core v30 source was read; no executed Core differential,
provider/UTXO/issuance/custody/bridge/fullM05/audit/mainnet approval follows.
No contracts/rootpins/configuration/economics/authority/gates changed. See
[BITCOIN_TRANSACTION_INSPECTION.md](BITCOIN_TRANSACTION_INSPECTION.md).

## Counter unsigned claim-review CLI

Default-disabled `prepare-counter-claims.mjs` calls the unchanged actual
two-client `buildCounterClaimBatch` engine using an existing bounded literal
policy and restricted HTTPS read providers. It returns original observation
data and unsigned batch bytes; policy mutation discards output. Calldata stays
unbound to amounts/snapshot/expiry, authorization null and execution/readiness
false. No signing/submission/approval/retry/service/configuration added. Actual
child-CLI HTTP/ABI tests and the compiled two-asset local escrow rehearsal
exercise returned bytes and spent-claim rejection. ONE zero-account fixture
is not public custody, legitimate funding, independent providers, consent or
full M06/P04/audit/mainnet approval. Standard/root pins/contracts/economics and
all gates unchanged. See [COUNTER_ROUND_ESCROW.md](COUNTER_ROUND_ESCROW.md).

## Rune index stream allocation bound

The actual fixed-origin Rune index reader now caps retained non-final chunks
at 4,096, counting empty chunks before push/projection. Empty/tiny response
regressions failed unchanged source; boundary/cleanup and existing actual
child-CLI HTTP tests cover the fix. The independent 32 KiB limit and ten-second
clock/failure fences remain unchanged. Valid fragmented responses may reject;
this is not an upstream/process-memory bound or successful public index proof.
No new Bitcoin issuance/custody/bridge authority, configuration, contract,
dependency or frozen Standard change. Full M05 and all release gates remain
incomplete. See [BITCOIN_RUNE_INDEX.md](BITCOIN_RUNE_INDEX.md).

## Managed-liquidity held custody observation

An explicit chain97 `inspectLiquidityCustody` library API integrates the actual
unchanged LP reader with same-block custody runtime, immutable roles, stored
route/position policy, held/released/pause state and zero token approval. Exact
raw liquidity/ticks and two-client header/state agreement fail closed. One
outer real30sec monotonic-clock lifetime includes the nested reader and fences
late work on every outcome. Historical snapshots are supported; no fresh-state,
independent-provider, finality, project-consent, legitimate-capital, treasury
control or execution approval follows. Raw liquidity/owed values remain separate
from null TVL/claimable fees. Initial/unrecorded/released custody is rejected;
this does not reconstruct lifecycle receipts. No contract, Standard/root pin,
economics, authority, service, CLI, MCP or real configuration changes. Existing
zero-account Pancake runtime exercises actual held/open, held/paused, wrong
fixed-treasury rejection and rejection after release. Local fixtures/fork are
not public custody or complete M07 readiness; exact CI/runtime evidence and
all audit/legal/privacy/capital/provider/failure/recovery/ops gates remain
separate. See [MANAGED_LIQUIDITY_CUSTODY.md](MANAGED_LIQUIDITY_CUSTODY.md).

## Syndicate worker decline before acceptance

The isolated chain97 WorkEscrow adds `decline(id)`: only the named worker can
settle a still-Funded job with zero worker payment and a whole original-client
refund, before or after the acceptance deadline. Existing exact transfer,
runtime/backing/liability, pause and non-reentrancy gates apply. First valid
accept/cancel/decline wins; inexact refunds roll back for explicit retry.
Funding IDs and terms remain stored; Accepted payment/waiver/dispute paths are
unchanged. Unit/fuzz/invariant tests and the existing zero-account HTTP/ABI
runtime exercise decline and all six earlier jobs. One local synthetic fixture
does not verify identities, legal cancellation, delivery, fairness, independent
providers or public custody. New runtime requires fresh deployment/audit
evidence; full P19 and release gates remain incomplete. No fee allocation,
capital authority, dependency or frozen Standard baseline changes. See
[SYNDICATE_WORK_ESCROW.md](SYNDICATE_WORK_ESCROW.md).

## Project API stream allocation bound

The actual shared canon/snapshot HTTP reader rejects more than 4,096 non-final
stream chunks, counting empty chunks too, before retaining another chunk or
projecting JSON. The independent 32 KiB byte bound and existing real deadlines,
clock/failure fences and non-awaited cancellation remain unchanged. Both empty
and tiny over-fragmentation regressions failed old source; boundary and actual
local HTTP tests cover the fix. Chunk boundaries are transport-dependent, so an
over-fragmented valid response may be rejected. This bounds retained chunk-array
entries, not upstream buffering or process-wide memory. No provider, service,
authority, financial, dependency or frozen Standard/release gates change.


## Complete feature coverage

The owner's full MEME OS reference is mapped in [MEME_OS_PARITY.md](MEME_OS_PARITY.md):
eight launch blocks plus project/platform features P01–P24. That coverage is the
product target; recent arbitrage/receipt/budget work is only one subset. Preserve
all existing Fortune presets/capabilities. Documentation records scope, not parity
completion, deployment or approval.

## Implemented in the launch-catalog change

- `/launch/types`: ten presets with explicit builder, configuration-required and development states; navigation opens the catalog without removing `/launch` or changing Standard signatures.
- `/launch/omnichain`: plain-token global-supply planning over BNB Testnet and EVM testnet allocations. Local previews and bounded public API validation share the same validator. Plan responses never authorize transactions.
- Exact bigint fee-allocation helpers: received-fee allocations total 100%; launch-token fees only burn; rounding remains explicit; protocol recirculation is a subset of protocol earnings.
- Supply/dust accounting helpers: local balances, authenticated in-flight obligations and permanent burns reconcile separately. These helpers do not verify chain receipts themselves.
- Web tests and desktop/mobile CI fixtures cover malformed input, duplicate/unsupported chains, global-supply conservation, immutable non-readiness, stale validation display and the actual local preview API.

## Engine completion matrix

| Engine | Present foundation | Required before calling its full lifecycle testnet-ready |
| --- | --- | --- |
| Standard | Existing public testnet curve/trading/graduation/rescue | Repeat retained rehearsal and failure drills against the exact deployed candidate; preserve mainnet gates |
| Custom Pair | Isolated contracts and builder | Protected deployment/drill, configured factory, compatibility cases and operational evidence |
| Protected Launch | Merged custom-pair rules v2 from PR #54 | Deploy supported rules, test trade rejection, expiry and graduation against the exact deployed contracts |
| Social Fees | Custom-pair routing, social vault and proof service | Operator-provisioned attestor, exact identity/claim/recovery drills and configured vault |
| Basket Rewards | Isolated Stock Rewards contracts/builder | Protected deployment/drill, payout reconciliation and real multi-asset claims; arbitrary reward baskets need additional adapters |
| Burn + Rewards | Isolated token/accounting prototype | Infinity hook, factory, trade/graduation integration, indexer, settlement and audit scope |
| AI Assisted | Disabled operator-only source-card co-pilot and gateway adapter | Project-aware content drafts, public auth/quotas, protected model/privacy/spend/quality review, explicit wallet-reviewed action integration and injection tests |
| Autonomous Agent | Isolated testnet single-pair swap vault with contract-enforced caps/floors/expiry/revocation and local venue-fork/RPC-to-journal tests | Agent runtime, reviewed manifests, signer-bound/native/global limits, protected operator custody, durable orchestration and public testnet failure/recovery drills; SQLite native-gas books/holds are not wallet enforcement |
| Managed Liquidity | Read-only V3 quotes and pinned LP NFT inspector, profit-policy helpers, receipt journal and bounded testnet swap primitive | LP-management adapters, complete cycle/cost/inventory settlement, live deployment evidence, global limits, loss/conflict disclosures and economic tests |
| Omnichain | Supply planner, pinned isolated testnet OFT token engine, message/replay fixtures, read-only quotes and receipt journal | Exact network/security manifests, deployment/pool integration, durable job/payment/refund orchestration, real route and partial-deployment/recovery drills |

No amount of passing planner or UI tests substitutes for the missing engine implementations above. Solana and Robinhood Chain are not implemented by the EVM testnet planner. New engines cannot inherit another engine's audit or deploy authority.

The receipt journal is documented in `ARBITRAGE_RECEIPT_JOURNAL.md`. It verifies and persists individual fill observations, with retry deduplication and persistent quarantine. It does not allocate realized profit, convert native gas costs into settlement assets, close cross-chain inventory or authorize spending. Its adversarial provider tests use fixtures; SQLite restart/concurrency tests use real local files and worker processes. The bounded-vault change also adds real RPC receipt/journal integration against a local Anvil fork, with two clients of that same fixture rather than independent public providers. No live arbitrage or complete durable settlement is claimed.

`STRATEGY_EXECUTOR.md` describes the bounded testnet swap vault, fixed governor/guardian/treasury powers, expiring owner-reviewed price floors and exact test scope. Local Pancake V3 fork swaps are not a publicly deployed vault or a cross-chain arbitrage service. The public catalog remains gated; this source primitive does not make the full agent or managed-liquidity modes testnet-ready.

Recent merged #71–#78 add source-card assistance, queued actual local-fork receipts,
read-only health, revalidation/quarantine, retained local rollback drills, a pinned
LP-position reader and native-gas books/reconciliation with fenced holds. These
are component foundations. Budget schema2 rejects schema1 without explicit offline
migration (NATIVE_GAS_BUDGET_MIGRATION.md); crashed holds still have no reviewed
recovery tool. The complete project-facing modes,
public services, constrained signer integration and global settlement are not
made ready by those merges. See CREATOR_COPILOT.md, MANAGED_LIQUIDITY_READER.md,
STRATEGY_NATIVE_GAS_BUDGET.md and BUDGET_RECEIPT_RECONCILIATION.md.

## Burn-only inventory settlement (M01/M08)

A separate paused chain97 vault now permits only a pinned token's permanent burn
of existing inventory, with exact vault-balance/local-supply/permanent-counter
deltas and no transfer/approval/swap/sweep path. Unit/fuzz/invariant tests and the
actual local compiled-OFT route rehearsal cover this component. Anyone may burn
while governor-open; per-call caps are not daily limits. Received inventory has
no refund/recovery route, and donations do not prove fee origin or allocation.
Nested vault burns are outside the existing direct-burn receipt reader. No fee
collection, buyback/reward/recirculation, public deployment, full agent/omnichain
readiness or release approval follows. See BURN_ONLY_INVENTORY_VAULT.md.

## Isolated holder-round settlement (M06)

An optional `fundSnapshotRound` path now binds newly built calldata to the actual
next round, a recent EVM block hash (20–255 blocks behind execution), and a fixed
expiry. The snapshot builder and actual local RPC rehearsal use that path;
legacy `fundRound` and its builder are preserved. Exact successful bytes cannot
fund another round, but rebuilt allocations and the governor's legacy method
are not deduplicated. Hash binding does not prove historical holder balances,
eligibility, source of funds, independent providers or finality. New isolated
contract source requires fresh evidence; no old deployment or audit is upgraded.
See COUNTER_ROUND_ESCROW.md for bounds, tests and remaining wallet/release gates.


The bounded Counter allocation library now reads two supplied clients at a common
confirmed block, checks escrow/runtime policy and supplied balances against total
supply, applies explicit exclusions/minimum holdings, and generates exact pro-rata
`fundRound` calldata with unallocated dust separate. The actual local zero-account
escrow runtime consumes those bytes and verifies stored entitlements/claims.
Coverage arithmetic is not independent holder-index/eligibility approval; the
legacy calldata has no snapshot/expected-round/replay binding and authorizes no execution.
No fee origin, wallet/signer, public service, automatic rotation/carry-forward or
full Counter readiness is established. See COUNTER_ROUND_ESCROW.md for the real
wall timer, failure fences, asset/provider/finality and wallet-review boundaries.

`FortuneTestnetCounterEscrow` now implements actual separately funded payout
rounds, immutable explicit allocations, per-asset reserved liabilities and direct
recipient-bound claims. It starts paused on chain 97, rejects launched-token
payouts, requires fresh exact governor funding, preserves older entitlements
across payout-asset changes, and has no sweep/amendment/expiry/fee conversion.
Eligibility is supplied by the governor, not verified by this escrow. Bounded
1–128-recipient rounds are not a complete holder index or rotating-basket engine.
The existing isolated contract workflow includes unit/fuzz/invariant tests and a
zero-account local-EVM HTTP/ABI funding/claim/failure rehearsal with retained CI
reports. See COUNTER_ROUND_ESCROW.md for authority, asset and stranded-claim
risks. No public deployment, fee provenance, holder eligibility, full Counter
readiness, audit, mainnet activation or financial/release-gate approval follows.

## Receipt observation lifetime

The actual swap-receipt verifier now fences every awaited RPC action and enforces
its existing sixty-second limit with a real wall timer, including hung reads.
Failure/timeout ends both readers' shared lifetime; delayed responses cannot start
more reads or acquire a verified-fill marker. Host-clock rollback is rejected and
method receivers/duplicate-client identity checks are preserved. In-flight calls
are not cancelled. Real SQLite queued-coordinator timeout tests retain a blocked
budget hold and unfinished job, without a journal commit or automatic recovery.
Evidence/digest/schema/gas/economic and release gates remain unchanged. See
ARBITRAGE_RECEIPT_JOURNAL.md; this is a component safety fix, not full M01/M07
or public-service readiness.

## One-shot queued operator integration

The budget reconciliation CLI now explicitly accepts `--next <existing-queue>`
to run the actual queue-to-budget coordinator for at most one existing job.
Read-only matching-store preflight precedes writers, missing/aliased/foreign
stores fail, and no reservation or job is invented. Blocked restarts do not
claim or read RPC; done/idle report false execution/profit authority and a
point-in-time book status. Legacy single-hash reconciliation is preserved.
Actual child-process HTTP/ABI and temporary SQLite tests are component evidence,
not independent providers, a hosted supervisor, hold recovery, signer enforcement
or complete M01/M07 settlement. See BUDGET_RECEIPT_RECONCILIATION.md.

## Coordinator local-RPC and rollback rehearsal

The queued budget observer now connects an existing job lease to the actual
coordinator: hold before RPC, journal then gas charge before queue completion.
Blocked books do not claim work; quarantine and uncertain writes never mark a
job done or clear a hold. Expired completion can replay already committed evidence
without resetting gas charge time. The local venue-fork runtime calls this path
for its two swaps. Three SQLite stores remain non-atomic; no signer, automatic
hold recovery, hosted worker or complete strategy settlement is established.

The strategy runtime now calls the real budget coordinator over actual local
Pancake fork swap receipts: durable holds before RPC, journal commits before
charge, exact swap gas, reopen/replay without changing charge time, and permanent
holds/freezes after an actual local history rollback. It also restores #75's
reviewed revalidation/rollback drill, previously absent from main's runtime
despite merged PR metadata. Engine CI now follows the coordinator, budget and
revalidator source paths and retains the existing report/log. A source change
does not count as a passing rehearsal; inspect exact-head results.

See BUDGET_RECEIPT_RECONCILIATION.md. Both read clients use one local fixture;
temporary post-mining reservations are not signer enforcement or independent
providers. Other gas, hold recovery, durable operations and public deployment
remain outside this rehearsal. No operator book, wallet or release gate changes.

## Bitcoin Rune index observation (M05)

An additional offline output-script decoder now interprets real Runestone binary
payloads against a pinned ord source: pushdata, exact u128 varints, fields/flags,
delta edicts and cenotaphs. A separately disabled bounded local-file CLI calls the
actual decoder, with literal upstream-derived vectors and adversarial component
tests. Supplied output lists are not verified transactions or complete chain
data; etching/mint acceptance, balances, network/finality, custody/bridge backing,
execution and full M05 readiness always remain false. No wallet, network service,
transaction construction or financial activation is added. See
BITCOIN_RUNESTONE_DECODER.md for protocol pin, supported bounds and missing
Bitcoin validation/issuance/bridge lifecycle.

A separately disabled operator CLI now calls an actual fixed-origin ord Rune-ID
JSON adapter with lossless u128 integer parsing, strict requested-ID/block/schema
binding, bounded streaming and a real ten-second fenced read lifetime. It emits
whitelisted raw index labels/counts, unknown supply/market/backing fields and
false network/transaction/Runestone/finality/custody/bridge/execution readiness.
CLI/HTTP and timeout tests exercise the runtime; one fixture is not independent
Bitcoin/index verification or live deployment. No etching, wallet, bridge, fees,
public service or full M05 readiness is enabled. See BITCOIN_RUNE_INDEX.md for
pinned upstream schema, source-context runtime support and remaining gates.

## Voluntary worker waiver (P19)

The isolated work escrow now permits an Accepted job's named worker to waive all
payment and refund only the original client, bound to the exact current result
revision. Existing exact settlement/backing/pause/runtime checks and permanent
funding/result history remain. Disputed jobs still require arbitration; failed
refunds preserve liabilities for explicit retry. Unit/fuzz/invariant and actual
local HTTP/ABI settlement tests cover this additional path. This is voluntary
contract consent, not delivery/IP/identity/fairness or public service readiness.
See SYNDICATE_WORK_ESCROW.md for ordering, forfeiture and separate review gates.

## Worker result revision integration (P19)

The isolated escrow now stores up to 32 append-only worker result commitments
for Accepted jobs before their existing deadline. Expected revision fences
concurrent updates. Optional client approval binds the exact latest revision/hash
to existing whole-payment settlement; stale approvals and failed transfers retain
liabilities/history. Legacy unbound approval and all previous settlements remain.
The actual local HTTP/ABI rehearsal preserves four jobs and adds a fifth with
result/payment receipt bindings, stale and taxed-payment rejection and explicit
retry. Hashes are public supplied commitments, not verified delivery, identity,
authorship, IP/license, quality or complete P19 readiness. No public deployment,
signer, new fees, custody recovery or release authority follows. See
SYNDICATE_WORK_ESCROW.md for privacy and separate audit/operational gates.

## Client-scoped work funding IDs (P19)

The isolated work escrow adds optional `fundWithId` funding with permanent
client-scoped successful-ID binding, replay rejection before transfer and atomic
binding rollback on failed funding. Legacy funding and settlement remain intact.
Unit and actual local HTTP/ABI rehearsals cover funded/approved replay before
and after settlement, explicit failure retry and separate client namespaces.
Changing IDs or using legacy funding still creates new jobs; no signer, identity,
public deployment or complete Syndicate readiness is established. Changed source
requires fresh evidence. See SYNDICATE_WORK_ESCROW.md.

## Scoped-work settlement foundation (P19)

An isolated paused chain97 work escrow now implements exact client funding,
worker acceptance, explicit client payment approval, pre-acceptance cancellation,
expired unaccepted refunds and fixed-arbitrator dispute splits. Per-asset reserved
liabilities stay backed; final payment destinations are immutable and inexact
transfers revert all settlement state. Unit/fuzz/invariant and actual zero-account
HTTP/ABI rehearsals exercise this source. It is not an agent marketplace, identity,
work-delivery/fairness verification, public custody service or P19 readiness.
See SYNDICATE_WORK_ESCROW.md for trusted arbitration, stranded-fund/pause risks,
asset/capital review and independent audit/legal/operations gates.

## Single-position custody integration (M07)

An isolated chain97 custody component now locks one pinned V3 position policy,
accepts an explicitly approved governor NFT while open, and permits one terminal
fixed-treasury release while paused. It has no fee collection, liquidity mutation,
approval, arbitrary execution or recovery drain. The existing local Pancake fork
rehearsal connects actual NFT custody and treasury exit to the pinned LP reader;
old-owner policies reject and raw liquidity stays exact. This is source and test
integration, not a public deployment, legitimate capital proof, signer or complete
LP manager. See MANAGED_LIQUIDITY_CUSTODY.md for authority, stranded-asset risks,
local/independent-provider distinctions and separate readiness gates.

## LP reader request lifecycle

The separate paused omnichain route reader also rechecks both snapshots' age at
the combined result's completion time. Reads that age out while awaiting either
network fail closed; this does not enable transport or attest route readiness.
See OMNICHAIN_ROUTE_OBSERVATION.md.

The isolated position reader now enforces its thirty-second observation limit
with a real wall timer, including hung head reads. Every awaited RPC action is
fenced before and after it completes; after any result, delayed peer completions
cannot start more reads. Already in-flight calls are not cancelled. Ownership,
venue/runtime pins, unknown values, authority flags and release gates are unchanged.
See MANAGED_LIQUIDITY_READER.md for fixture tests and remaining operations limits.

## Pair-inspection provenance hardening

The existing public custom-pair inspector now reports a rechecked block hash and
timestamp, rejects incomplete proxy-slot/implementation reads, and qualifies its
simulation labels. See CUSTOM_PAIRS.md. This strengthens part of P08's existing
contract-intelligence foundation; it does not complete exhaustive admin/claim
analysis, independent-provider verification or a safety verdict. Local RPC/ABI
and state-override fixtures exercise the actual reader, without broadcasts.

## Share-card artwork deadline

The production share-card artwork reader now enforces its existing three-second
budget with a real fallback timer and late-read fences. Hung fetch/body reads or
cancellation cannot keep the artwork promise pending. Host-clock rollback fails
to the existing monogram fallback; trusted gateway/raster/byte/chunk restrictions
remain. Real and simulated timeout tests and loopback HTTP exercise the reader,
not public IPFS availability or full image decoding. No new service, credentials,
financial engine or release approval follows. See CREATOR_FLOW.md.

## Public project read lifetime

The actual canon/snapshot readers now enforce existing 10/30-second budgets with
a real rejecting timer and before/after response/chunk fences, even if transport
ignores abort. Failure/timeout/success closes the shared lifetime; best-effort
abort/cancellation never waits for stuck cancellation. Late results cannot start
new reads or return projected data. Safe nonnegative monotonic host clocks are
required. Fixed origin, 32KiB byte bounds, strict parsing, freshness/provenance and
shared MCP quotas remain unchanged. This strengthens existing MCP, research capture
and co-pilot consumers without authorizing models, publication, wallets or new
services. See PROJECT_MCP.md for event-loop and in-flight cancellation limits.

## Creator co-pilot public-project grounding

An explicit separately disabled `creator-copilot.mjs --brief <token>` mode now
runs the actual bounded public project snapshot reader and produces a whitelist
of exact facts, phase-specific review notes and pinned historical policy cards.
Creator prose is omitted, unknown analytics stay null and all creator/publication/
execution/full-readiness authority stays false. The source-card inference mode is
preserved; brief mode calls no model or Gateway. Real child-process HTTP tests
exercise the data path and private-safe failures. This is a one-shot operator
brief, not public authenticated AI, content publishing or complete M02/P06.
See CREATOR_COPILOT.md for limits and separate review gates.

## Owner-operated dependencies

`OMNICHAIN_PERMANENT_BURN.md` adds an explicit default-disabled receipt reader
for the isolated OFT's direct voluntary burn: pinned runtime/manifest, exact
transaction and matching Transfer/PermanentBurn events, rechecked receipt blocks
and two read-client observations. The local engine runtime exercises the actual
burn and wrong-amount rejection. Stable evidence IDs support deduplication but do
not provide a durable ledger or public badge/totals; buyback, fee funding,
independent providers, finality, global supply and spending remain unverified.

`OMNICHAIN_ROUTE_OBSERVATION.md` adds a default-disabled actual RPC reader for a
paused two-network OFT route: reciprocal identities/runtime pins, explicit message
libraries, raw/effective ULN and executor configuration, and bounded rechecked
per-network snapshots. The engine runtime uses the real OFT and pinned upstream
libraries on two separate zero-account local EVMs, with synthetic workers; it
does not send messages or verify public endpoints/providers/worker security.
Configuration matching always retains false execution/security/delivery/supply
readiness. No deployment, opening, payment, policy, root pin or release gate changes.

`CHARACTER_PROVENANCE_MCP.md` connects the actual provenance engine to a separately
enabled local MCP tool/resource, preserving offline history/canon readers. It pins
startup policy bytes, shares the existing read quota, returns no profile text and
always reports null current authorization/false execution authority. Actual child
stdio -> viem HTTP/ABI -> real SQLite fixtures are not public creator approval or
independent-provider/hosted-service evidence. No real config/profile is enabled.

`CHARACTER_PROVENANCE_RECHECK.md` adds an explicit default-disabled operator
read-only recheck of stored character history against current factory/creator
and recorded block hashes through two configured RPC clients. It detects changed
local revision/policy after reads, requires matching checked-block timestamps,
and fences late client completions after any outcome. It never renews signatures or persists trust,
and retains null current authorization/false execution authority. Fixture
SQLite/provider/CLI tests are not live creator approval or hosted integration.

`PROJECT_RESEARCH_NOTEBOOK.md` also documents an explicit, default-disabled
project API capture command: real bounded snapshot reader -> whitelisted exact
values/provenance -> expected-head SQLite append -> existing read-only MCP. It
rejects concurrent head changes and malformed/stale bindings, excludes creator
text and keeps unknown analytics null. This is recorded API attestation, not
independent verification, autonomous research, scoring or hosted service.

`PROJECT_RESEARCH_NOTEBOOK.md` adds a default-disabled local operator notebook:
expected-head/retry-ID append, correction-preserving hash-linked SQLite history
and a separate opt-in read-only MCP research tool/resource. Notes and host times
are unverified; no creator role, external timestamp, scoring or financial authority.
Full Arena/agent research, public authentication/moderation and hosted operations
remain missing. Real local CLI/SQLite/process/stdio tests are fixture evidence.

`CHARACTER_RECORD_MCP.md` connects the local stdio server to an explicitly selected
read-only character registry through a separate optional tool/resource. It checks
stored signature consistency and labels historical provenance/current authorization
unknown. It never fills public canon fields or grants publication authority.
Actual child stdio/SQLite fixture tests pass; live creator approval, current RPC
revalidation, hosted identity/privacy/quotas and public agent readiness remain open.

`CREATOR_CANON_REGISTRY.md` adds default-disabled operator-only EIP-712 character
imports and append-only SQLite version history for one reviewed Standard testnet
project. Two clients check pinned factory/creator/block bindings; replay and racing
revisions fail closed. It supports EOAs only and records historical authorization,
not current login, onchain metadata changes, public canon or publication authority.
Tests use signature/provider fixtures and actual files/processes/HTTP, not a real
creator's approval. Public Studio/MCP integration, smart-account support, live
creator evidence, revalidation and durable hosted operations remain outstanding.

`PROJECT_SNAPSHOT.md` adds a same-block Standard testnet metadata/curve API and
the MCP get_project_snapshot tool/resource. It binds creator/factory/token/block,
preserves exact supply and curve-accounting strings and hides retired curve prices.
It does not infer volume/holders/treasury/market cap or supply a trade quote, and
API attestations are not independent client RPC/finality or financial authority.

`CREATOR_STUDIO.md` adds `/studio`: browser-local character drafts, bounded
project-scoped JSON roundtrips and deterministic announcement wording with review
before download. It is not creator authentication, onchain canon, AI generation or
social publishing, and does not populate the MCP reader's missing character fields.

`PROJECT_MCP.md` adds the first project-facing canon/MCP developer slice:
an explicitly enabled local stdio server with real initialization/discovery/calls,
one process-bound Standard testnet token and a public-metadata projection. Empty
character/license fields remain null. This reads Fortune API attestations, not
independent RPC evidence, and has no treasury/wallet/write tools. Local HTTP/stdio
fixtures do not establish external-client interoperability or full agent readiness.
Creator-authenticated character editing, broader tools and hosted auth/quotas remain.

Use protected service/CI configuration for RPC, durable storage, holder cron, uploads and attestor provisioning. Do not share private keys in chat. Existing owner workflows need faucet tBNB and their explicit confirmation inputs, as documented in RELEASE_HANDOFF.md. Local fixtures are not provider, incident-alert or live cross-chain evidence.

Audit readiness additionally requires reproducible pinned builds, scoped contract inventory, lifecycle/invariant/fork evidence and retained deployment artifacts for each engine. Mainnet also needs independent audit remediation, legal/asset review, governance acceptance/signatures, funding, production operations and activation evidence. An audit alone does not establish mainnet readiness.

## Social claim amount units

The existing social-fee identity reader now fails closed if vault-token or curve
pair-token decimals are unavailable or malformed, instead of assuming 18 and
mis-scaling displayed amounts. Successful raw amounts and uint8 units are
preserved. Tests cover both detail paths and actual viem HTTP/ABI fixture reads;
this does not enable social routing, provision an attestor or establish public
claim/recovery readiness. See SOCIAL_FEES.md.

## Creator import snapshot consistency

The same import engine also fences each awaited RPC before and after completion,
ends its shared lifetime on every outcome, and rejects inter-check host-clock
rollback. Late responses cannot start further reads after failure or the real
20-second timeout; in-flight calls are not cancelled. SQLite/actual-timer fixtures
preserve no-commit behavior, method receivers and client identity checks. This
does not enable a public identity service or change signed/stored evidence.

Creator-character imports additionally require matching provider timestamps,
number/hash/timestamp rechecks, and final snapshot age within 120 seconds before
the existing SQLite transaction can commit. Real-file and viem HTTP/ABI fixture
regressions cover rejection/preserved history; no signed-message, schema, expiry,
historical authorization, public login or release authority changes. This applies
to new imports, not renewed verification of old records. See CREATOR_CANON_REGISTRY.md.

## Known protected-launch rules disclosure

The existing custom-pair detail reader rejects failed or undecodable reads from
an already discovered rules contract instead of returning null rules. Holder-gate
units must be read successfully, while valid inactive settings and raw thresholds
remain disclosed. Actual viem HTTP/ABI fixture regressions cover all required
rule reads and gate metadata. Legacy getter-discovery fallbacks remain a separate
limitation; this does not complete M03/P16 enforcement, deployment or full lifecycle
readiness. No contracts, configured factories, signing or release gates change.
See LAUNCH_RULES.md.


## Social ownership-source request lifetime (M04)

Actual ownership/profile HTTP attempts now reject at their existing eight-second
budget even when transport ignores abort or cancellation hangs. Before/after
read fences reject late evidence and host-clock rollback; cleanup ends every
attempt. Existing single retry and platform fallbacks retain separate attempt
budgets, not a global verification deadline. Real-timer and HTTP projection tests
are component evidence, not live identity/attestor/claim/recovery or full Social
Escrow readiness. No contracts, credentials, public activation or gates change.
See SOCIAL_FEES.md.


## Project LP-position MCP integration (P03/M07)

A separate default-disabled local tool/resource now invokes the actual pinned LP
reader over two configured read clients. A bounded literal startup policy must
include the fixed project token as a position asset; identical policy bytes are
required before/after reads. All readers share the existing four-read quota.
Raw liquidity/last-computed owed fields retain null value/claimable fees and false
project-custody, provider-independence, full-readiness and execution authority.
Actual child stdio/viem HTTP/ABI tests exercise this path, not public providers
or creator/custody approval. Existing reader logic is unchanged apart from an
export of its validation function. No fee collection, management, signer or
public service is enabled. See PROJECT_LIQUIDITY_MCP.md.

## Serialized Bitcoin transaction / Runestone integration (M05)

A separately disabled offline CLI now parses bounded supplied legacy/SegWit
transactions, checks an expected txid, computes wtxid and passes every serialized
output script in order to the actual Runestone decoder. Canonical CompactSize,
byte/count/value bounds and witness framing fail closed. Matching hashes bind
supplied bytes, not signatures, chain inclusion, UTXO/Rune balances, issuance,
custody or bridge backing; those verification/readiness flags remain false.
Known historical bytes, adversarial synthetic serialization and actual child CLI
tests are component evidence, not a public Bitcoin provider or full M05 lifecycle.
See BITCOIN_TRANSACTION_INSPECTION.md. No network, signing, broadcasts, financial
activation, dependency or frozen Standard changes are introduced.

## Public project-data attachment (P23)

The actual public project reader now has an additive JSON download endpoint with
exact decimal strings and same-block provenance, excluding creator prose/links
and retaining unknown analytics. A bounded UTF-8 payload string and SHA-256 make
byte checks portable; they do not authenticate the source or grant authority.
All existing reader errors and false verification/authorization flags remain.
The production API/RPC/MCP rehearsal exercises attachment headers, checksum,
provenance, unknowns and invalid/unregistered-token errors. This is a data/export
component, not API-key/durable-quota/hosted-auth/indexer or full P23 readiness.
See PROJECT_DATA_EXPORT.md. No financial or frozen release gates change.

## Offline Bitcoin header / transaction Merkle integration (M05)

A separately disabled local-file CLI now consumes the actual serialized
transaction/Runestone engines and checks a supplied txid path against a supplied
80-byte header's root and expected header hash. Exact depth, index/count bounds,
odd-width duplication and visible equal-pair checks fail closed. Count and index
remain claims; opaque subtree mutation and SegWit witness commitments are not
verified. Matching caller-supplied bytes does not establish trusted headers,
proof of work, canonical-chain inclusion, network, finality, valid transactions,
Rune issuance, custody or bridge backing; all those authority/readiness flags
remain false. Historical genesis and synthetic full-tree/child-CLI tests are
component evidence, not public-provider or Bitcoin Core differential evidence.
See BITCOIN_MERKLE_OBSERVATION.md. No network, signing, broadcasts, financial
activation, dependency or frozen Standard/release-gate changes are introduced.

## Developer download inspection (P04/P23)

A default-disabled local-file CLI now consumes actual project-data exports,
checks bounded UTF-8 payload bytes/digest and typed project/factory/block/phase
bindings, then emits a strict whitelist. Unknown analytics remain null; input
prose is not emitted or followed. Historical inspection preserves the original
API timestamp and cannot refresh trust or authorize execution. Actual exporter
round-trip/adversarial/child-CLI tests are component evidence, not authenticated
source, independent RPC, current canonicality, full API/dev-tool readiness or
financial authority. Existing exporter and endpoints are unchanged. See
PROJECT_DATA_EXPORT.md for bounds, usage and missing service/release gates.


## Atomic recipient claim batches (M06)

`claimMany(ids, recipient)` delivers existing whole entitlements from 1–32
strictly increasing, nonzero round IDs to the same recorded recipient. Anyone
may relay it across payout assets; the relayer receives nothing. Duplicate,
unsorted, oversized lists and missing/already-claimed entitlements reject.
All IDs are validated before transfers. Each claim reuses runtime, solvency,
exact-transfer and liability checks under one chain97, unpaused, non-reentrant
call. Any later failure reverts every earlier transfer, event and accounting
change. Explicit retry or separate legacy claims remain available. No partial
progress, automatic retry, allocation change, fee, recipient override, sweep or
pause bypass is added; existing single claims are preserved.

Unit/fuzz tests cover two assets, the 32-round boundary, reentry and rollback;
the liability invariant includes batch actions. The zero-account local HTTP/ABI
rehearsal binds two round/recipient/amount receipts and checks that a taxed
second payout rolls back the first. One synthetic fixture is not independent
providers or public custody. This is a bounded settlement component, not cost-
aware scheduling, pot/carry-forward accounting, eligibility, fee funding or full
M06 readiness. Changed bytecode requires fresh deployment/audit evidence.
Frozen Standard and all release gates remain; launch-token fees only burn,
rewards and earned platform recirculation remain separate, and creator/holder/LP
liabilities are never strategy capital.

## Counter operator funding review integration (M06/P04)

A default-disabled one-shot CLI now runs the actual two-client snapshot funding
engine from an existing bounded strict policy file. It emits unsigned exact
allocations, dust, block/deadline bindings and false authority, with pre/post
policy-byte rechecks and restricted read transports. It cannot approve, fund,
sign or submit. Actual child HTTP/ABI tests and the existing zero-account compiled
escrow rehearsal consume its output. One local fixture is not independent public
providers/eligibility/fee provenance/capital/custody or full Counter readiness.
No real configuration, financial engine logic, frozen Standard/root pins or
release gate changes. See COUNTER_ROUND_ESCROW.md.

## LP observation header consistency (M07/P03)

The actual LP reader now checks matching number/hash/timestamp across both clients
and each final header reread, emits exact blockTimestamp and rejects invalid
host clocks before RPC. Reproduced header/clock regressions and the existing
MCP/HTTP/fork integrations cover this path. Historical reads remain supported;
this adds no freshness/finality/provider-independence or custody authority.
Raw liquidity and null value/claimable fees/false readiness remain unchanged.
See MANAGED_LIQUIDITY_READER.md. Frozen Standard and all gates are preserved.

## Supplied Bitcoin previous-output accounting (M05)

The existing offline transaction CLI has a separately disabled optional parent
mode. Actual parsed child outpoints bind to hash-checked supplied parent bytes;
unique required parents/outputs yield exact input/output totals and an implied
fee, with duplicates, missing outputs, money bounds and negative fees rejecting.
Original transaction/Runestone inspection remains available. Arithmetic does not
verify unspent/mature inputs, signatures, chain inclusion or miner payment;
feesSats remains null and authority/readiness flags remain false. Synthetic and
actual child CLI tests are component evidence, not Bitcoin Core differential,
public provider, issuance, custody or bridge proof. Full M05 and all release gates
remain incomplete. See BITCOIN_TRANSACTION_INSPECTION.md. No financial authority,
frozen Standard, root pins, real configuration or network actions change.

## Offline Bitcoin CLI nonregular-input rejection

The Runestone, transaction/prevout and Merkle CLIs now open read-only with
nonblocking flags before existing descriptor regular-file checks. All three
writerless-FIFO regressions failed original main by child-process timeout; Linux
actual FIFO/symlink/directory/disabled cases now reject privately. Existing valid
regular-file tests and all parsing/byte bounds/gates remain. This does not add a
general filesystem deadline or platform-independent I/O guarantee, Bitcoin
validation, public service or financial authority. See
BITCOIN_TRANSACTION_INSPECTION.md. Frozen Standard/root pins are unchanged.

## Burn-only inventory receipt integration (M01/M08)

A separate chain97 library observer now verifies the actual burn-only vault's
outer uint128 burn and three nested logs against supplied runtime/identity pins,
receipt-height policy/counters and rechecked two-client transaction/header data.
The existing compiled zero-account OFT/vault rehearsal consumes this observer for
both burns and replay/mismatch rejection. Direct-token observation/CLI remains
strictly separate. Event and block-end counters are distinct, evidence IDs need
consumer deduplication, and fee funding/buyback/finality/supply/execution claims
remain false. This is no consumed ledger, badge, public service, fee-origin proof
or full M01/M08 readiness. Shared20-second fencing now rejects invalid host clocks
before RPC; no financial authority, frozen Standard/root pins or gates change.
See OMNICHAIN_PERMANENT_BURN.md.

## Durable local vault-burn research capture (M01/M08/P10 foundation)

An opt-in library path now calls the actual vault receipt observer and appends
its observation to the existing protected research notebook using the original
expected head. Concurrent changes reject without overwriting; deterministic
per-notebook transaction IDs and exact policy checks allow historical retries
without RPC, timestamp renewal or duplicate notes, including records older than
the recent-ten read window. The existing MCP notebook reader consumes that history.
Actual ABI/SQLite/MCP tests and the compiled zero-account OFT/vault rehearsal cover
the integration. This is local untrusted research, NOT a consumed financial ledger,
totals, badge, fee/buyback proof, current authorization, reorg recovery, public
service or full M01/M08/P10 readiness. No contracts, root pins, real configuration,
financial authority or release gates change. See OMNICHAIN_PERMANENT_BURN.md.

## Revision-bound Syndicate disputes (P19 component)

Optional disputeResult binds a party's dispute to the exact latest submitted
revision/hash, rejects stale prepared calldata, and retains that reference through
existing fixed-arbitrator split settlement. Legacy dispute and its deadline/role
semantics remain unchanged; its zero binding is explicitly unknown. Solidity tests
and the actual compiled eight-job local HTTP/ABI rehearsal cover stale rejection,
events and retained history/liabilities. No content/delivery/legal/fairness proof,
public custody, signer, deployment or full P19 readiness follows. Changed isolated
runtime needs fresh deployment/audit evidence; frozen Standard/root pins and all
release gates remain. See SYNDICATE_WORK_ESCROW.md.

## Sentinel optional-rule discovery failures (M03/P16 component fix)

Token/factory rule-address discovery now propagates transport and malformed ABI
failures and explicit-reason reverts instead of silently reporting no rules.
An actual multicall/detail-API malformed-getter regression failed old source200
and now requires generic503; focused HTTP/ABI and typed legacy-error tests pass.
Empty-data/empty-revert legacy compatibility remains explicitly unverified, not
proof of no rules, contract generation, enforcement or safety. No contracts,
root pins, configuration, signing authority or release gates change. Full M03/P16
remains incomplete. See LAUNCH_RULES.md.

## Counter unsigned claim-batch runtime integration (M06)

An isolated read-only builder now checks selected round entitlements, exact
recipient, payout/runtime/role pins, open state and selected reported liabilities/
backing through two clients at a fresh common block. It produces unsigned existing
claimMany bytes with explicit false snapshot-binding/authority/eligibility/global
solvency/finality-readiness claims. The actual compiled two-asset Counter runtime
consumes those bytes, preserves batch transfer rollback/retry and rejects consumed
claims on a new snapshot. No signer, service, public deployment or full M06
readiness follows; no contracts/root pins/economics/gates change. See
COUNTER_ROUND_ESCROW.md.


### P24: bounded web regression CI execution

Fortune CI now assigns its existing web regression step a 20-minute fail-closed
budget. Only that workflow field changes; commands, tests, individual deadlines,
pins, permissions and subsequent build/runtime/browser gates remain unchanged.
This limits future step execution; it does not diagnose PR195's unclassified
run41723886807/job126223476063 or certify control-plane termination/log delivery.
No overrun drill, new engine runtime, public testnet, audit or activation evidence
is claimed. Exact-head CI and independent post-merge checks are still required.


## Distinct receipt queue and journal files (M01/M07/M08)

The journal-only receipt observer checks real paths and existing device/inode
identities before SQLite initialization. Separate new files remain supported.
This preflight does not migrate old databases or prevent concurrent host
filesystem changes.

## Standard testnet CREATE2 vanity observation (P17)

The read-only library computes the first frozen suffix candidate from pinned
creation bytes and compares it with factory/deployer reads at one pinned block.
CI runs a separate local Forge differential against the unchanged Standard
contracts, checking the artifact, creator and launch nonce, and code-only and
nonce-only collisions. Local evidence does not establish public availability,
artifact provenance for live deployments, or the full P17 catalog.
