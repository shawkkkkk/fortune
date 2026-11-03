# Local character-backed Co-Pilot brief

This optional operator flow connects existing saved character history, the
public project briefing reader and creator-provenance revalidation. It is not
a login, model assistant, public canon update or publication service. Full M02,
P02 and P06 remain unfinished.

The library `readCreatorCharacterBrief` requires literal `enabled: true` and
`discloseLocalCharacter: true`. The existing Co-Pilot command adds one mode:

```
node --import ./scripts/register-ts.mjs scripts/creator-copilot.mjs \
  --character-brief <chain97-token> <existing-registry.sqlite> <policy.json>
```

It requires both `FORTUNE_COPILOT_CHARACTER_BRIEF_ENABLED=true` and
`FORTUNE_COPILOT_CHARACTER_DISCLOSURE_REVIEWED=true`. The latter records operator
review of disclosing saved plaintext character wording to this local command;
it is not creator consent inferred from a flag. Obtain actual permission before
using real identifiable profiles. Any later sharing with a client/model needs
separate review. No real policy, profile, credentials or enablement is installed.
The old no-argument source-card mode and `--brief` mode remain available.

The two existing `FORTUNE_CANON_READ_RPC_URL` and
`FORTUNE_CANON_SECONDARY_RPC_URL` must use distinct reviewed HTTPS origins without
userinfo/fragments. CLI transports retain eight-second timeout, no retry and no
redirect. Distinct URLs/client objects do not prove independent organizations.
No Gateway/model credential is used by this mode, and no text is sent to a model.
The public API receives only the requested token; RPC receives fixed ABI reads.

Before network access, bounded regular-file/strict UTF8 policy parsing, project
binding and existing consistent nonempty history are required. The policy is
pinned and checked around asynchronous stages. The actual public reader supplies
whitelisted supply/phase/curve accounting; its creator/factory must match the
selected saved record/policy. Then the actual two-client revalidator checks the
factory creator, runtime and historical block. A final local reread must match
the original revision/digest/fields, preserving concurrent writers and discarding
the brief on change. No registry initialization, write, migration or trust cache.

One real 50-second outer lifetime and safe monotonic host clock cover asynchronous
composition and fence RPC follow-on reads on every outcome. Existing API30s and
revalidator20s budgets remain. At completion, API observation age is at most30s,
recheck observation age at most20s and checked RPC block age at most120s. API and
RPC contexts are separate heights/sources, not a common snapshot. In-flight calls
are not canceled; event-loop scheduling can delay timers. File opens use bounded
nonblocking regular descriptors here, but this is not a generic filesystem
deadline, privileged-host file-swap defense or independent clock/storage proof.

Character fields remain literal **untrusted data**, including identity prompts,
hard limits and license statements. No instructions are executed. The existing
deterministic announcement helper copies saved name/ticker/description only;
missing name/description yields no announcement. Every returned draft requires
wording, privacy, IP/license and moderation review before separate publication.
The draft binds its source revision/digest; it is not an approval or durable
review state. Output includes private wording but excludes raw signatures/paths.
Unknown treasury, market cap, volume, holder count and trade quote remain null.

Historical signature consistency and current factory observations do not renew
expired signatures, prove ownership of IP, authorize current login/publication or
financial actions, establish independent providers/finality or approve release.
`currentAuthorization` stays null; authentication/model/publication/execution/
provider/full-Co-Pilot-readiness flags stay false. Output is local stdout only;
no model/media/publishing/wallet/service/financial action is enabled. Protected
host/policy/clock/RPC trust and height-call/EIP1898/ABA limitations remain.

Tests exercise actual registry storage and signature recovery with an arbitrary
r/s/v fixture and its assigned recovered creator, not generated keys or signing.
The real CLI consumes public-API and viem HTTP/ABI responses from one loopback
fixture through test-only synthetic HTTPS origins. This is component integration,
not real creator approval, independent public providers or service readiness.
