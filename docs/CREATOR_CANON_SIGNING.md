# Creator character wallet adapter

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
