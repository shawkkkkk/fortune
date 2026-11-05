# Creator character wallet adapter

The browser rehearsal now obtains pins through the actual operator CLI, then
passes the exact downloaded envelope to the existing registry verifier. It
checks wrong-creator rejection, a single durable acceptance, reopen and replay
rejection. The wallet returns the existing arbitrary fixture tuple and the two
read clients supply fixture factory state; this does not demonstrate independent
providers, live approval, publication, or audit readiness.

## Loopback Studio wallet handoff (P01/P02/P06)

On a top-level HTTP page at `localhost` or `127.0.0.1`, open the local wallet
handoff after choosing the project and filling its exact character draft. The
public site does not offer this handoff. Obtain the operator's prepared request
and a **separate, trusted** JSON object containing `policy`, `registryId`, and
`account`. The account is the expected existing creator wallet; the policy is
the existing chain-97 factory/runtime/index/token policy. Do not derive these
pins from the request being reviewed.

An operator can export those pins without preparing a draft or reading a profile:

```sh
FORTUNE_CREATOR_CANON_ENABLED=true node --import ./scripts/register-ts.mjs scripts/operate-creator-canon.mjs studio-pins "$REGISTRY" "$POLICY" "$EXPECTED_CREATOR_WALLET"
```

The command opens the existing protected registry read-only, matches its policy,
and emits only the Studio pin object. Supply a separately reviewed, nonzero
wallet address. It is an operator assertion; the command does not contact a
wallet or RPC provider or verify current ownership. Send the pins through the
trusted operator channel independently of the prepared request, with permission
before disclosing the wallet address or project association.

To also check the prepared revision before prompting the wallet, use:

```sh
FORTUNE_CREATOR_CANON_ENABLED=true node --import ./scripts/register-ts.mjs scripts/operate-creator-canon.mjs studio-head-pins "$REGISTRY" "$POLICY" "$EXPECTED_CREATOR_WALLET"
```

This variant adds only the stored head revision and digest to the same pins.
It does not read the profile, signature or evidence. Studio rejects a prepared
request unless its revision is exactly the next one and its previous digest
matches the separate snapshot. A full registry cannot prepare another revision
through head-checked Studio review. Legacy three-field pins still work and are
explicitly labeled as lacking a predecessor check. The snapshot can become stale
after export; final operator acceptance still checks the actual head and the
original expiry. Keep the head export in the same trusted channel as the legacy
pins. Neither export grants authorization or permission to share profile data.

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

`reviewCanonSigningRequest(raw, policy, registryId, fields)` accepts only the
existing operator `prepare` output. The trusted pins and all ten reviewed fields
must be supplied separately. Import/review again after any profile, token, wallet,
policy or registry change; a digest is a byte binding, not proof of human review.

`signReviewedCanon(wallet, review, {enabled: true, reviewedDigest, expectedAccount})`
uses only getAddresses, getChainId and signTypedData on the supplied wallet client.
The wallet is caller-selected trusted context, not supplied by the request file.
It returns an envelope for explicit operator `accept`; it never calls accept,
publishes the profile, persists a bearer session or renews an expired signature.
Do not save signed envelopes to browser drafts. Before sharing real identity or
profile text with any service/model, obtain the corresponding privacy permission.

Tests cover the actual adapter→unchanged authorization/RPC verifier→real SQLite
commit/reopen/replay rejection, malformed signing data, off/digest/brand rejection
before wallet calls, before/after account switches, wrong chain/signature, frozen
snapshots, clock reversal, original-expiry hung-wallet/late-follow-on fencing and
independent registry rejection of a wrong fixture creator. One initial NEW test
cleanup closed the old registry twice after reopening; only that fixture cleanup
was corrected. No production guard, deadline or existing engine was weakened.

The selected wallet/provider receives the FULL character typed data and may retain
it. Call only with permission to disclose that real profile to the selected
wallet/provider. This adapter does not promise secrecy or anonymity.
