# Read-only creator co-pilot foundation

This adds a disabled-by-default operator CLI and a Vercel AI Gateway HTTP adapter. The model can select up to three IDs from seven reviewed Fortune help cards. The application supplies all displayed wording and pinned documentation links; it never renders model-written prose, URLs, commands, contracts or transactions. Empty selection means no supported answer. This is a source-card selector, not the complete AI Assisted launch mode, content-draft editor or autonomous agent.

The cards cover Standard scope, fee separation, custom-pair beta, rewards, omnichain boundaries, release review and official project identity. Sources pin main commit `07bed2da8bf76cb1270c6bb84f9287f3f0dcab8e`. These are reviewed summaries of that snapshot, not live release-state retrieval. Refresh wording and pinned sources together when policies change. The model may select irrelevant cards; users still need to review applicability. Returned `executionAuthorized` and `readinessAttested` are always false.

## Provider boundary

The adapter uses only the fixed `https://ai-gateway.vercel.sh/v1` origin. It checks the public model catalog before making a completion request: the configured exact ID must be a text-input/text-output language model supporting `max_tokens`. There is no guessed default model or automatic model fallback. Model availability is checked afresh per invocation. The public catalog was reachable on October 27, 2026; that check does not establish paid inference access, model quality or team/provider approval.

Requests have one 15-second total deadline, a 1,200-character / 4,096-byte question limit, 256 requested output tokens, a 2 MiB catalog limit and 16 KiB completion limit enforced while streaming. Redirects are rejected. There is no application retry, tool declaration, web retrieval, wallet, RPC, approval, spending or execution tool. A single complete assistant choice must match the configured model and contain exactly JSON with an `ids` array. Unknown/duplicate IDs, extra keys, prose, tool calls, refusals, truncation and invalid responses fail closed. Strict model-ID matching may reject provider aliases; verify the chosen model end to end before operational use.

Prompt instructions help routing, but output allowlisting establishes the rendering boundary. Even injected questions or provider prose cannot replace reviewed wording. Selection can still be wrong, and neither a source card nor model choice is release evidence. No tokens, balances, valuations, profit estimates, unverified Fortune CA or audit status are inferred.

## Manual operator use

Requires the existing Node 22.15+ loader and root locked dependencies; no package changes or SDK install:

```bash
node --import ./scripts/register-ts.mjs scripts/creator-copilot.mjs < /path/to/non-private-question.txt
```

Keep `FORTUNE_COPILOT_ENABLED` off until access and spending are reviewed. Operator configuration requires:

- `FORTUNE_COPILOT_ENABLED=true` for an intentional manual inference request;
- `FORTUNE_COPILOT_MODEL` set to an exact approved text model ID from the live catalog;
- protected `AI_GATEWAY_API_KEY` for local/operator use, or `VERCEL_OIDC_TOKEN` in a properly scoped Vercel runtime.

Do not paste secrets into chat, command arguments, source or input questions. This CLI sends the question to AI Gateway and its model provider; review privacy, retention, provider policy and budgets first. It does not read `.env` files itself or print upstream errors. Configure a restricted credential, spend cap and alerts through protected owner settings. A token cap is not a monetary budget. No keys are created, budget changed or paid inference request executed by this change.

There is no public HTTP endpoint or UI, so this does not introduce an unauthenticated paid inference surface. Before public integration, add authentication, durable quotas, privacy controls and live provider/usage checks, then build the reviewed draft/wallet handoff separately. The catalog remains gated; no public co-pilot readiness claim follows from CLI/fixture tests.

## Verification

Tests cover actual HTTP request/response transport against a local provider fixture, request separation, reviewed source-only output, malicious question/prose/URL/tool payloads, unknown models and sources, streaming limits, hanging-call deadline and generic CLI error privacy. These establish adapter and rendering behavior, not live model relevance or provider compatibility. No real credential or paid inference is used. Existing launch flows, UI, dependencies and frozen Standard remain unchanged.

Protocol references checked October 27, 2026: [Vercel compatible APIs](https://vercel.com/docs/ai-gateway/sdks-and-apis), [text generation quickstart](https://vercel.com/docs/ai-gateway/getting-started/text), [live model catalog](https://ai-gateway.vercel.sh/v1/models). Provider-neutral HTTP preserves the frozen dependency baseline.

## Explicit public-project brief mode

The same operator CLI now supports a separately disabled deterministic mode:

```bash
node --import ./scripts/register-ts.mjs scripts/creator-copilot.mjs --brief 0xPROJECT_TOKEN
```

Set `FORTUNE_COPILOT_PROJECT_BRIEF_ENABLED=true` only for an intentional public
project read. The token must be an exact supported Standard testnet address;
there is no caller-selected API origin. This mode does not read a question from
stdin, call AI Gateway, use its credential or invoke a model. Existing no-argument
source-card inference mode and its separate enablement remain unchanged.

The actual `readProjectSnapshot` engine supplies a fixed-origin API attestation,
using its existing 30-second abort budget, 32 KiB response limit, timestamp checks
and matching token/factory/creator/block context. The new brief whitelists exact
addresses, phase, supply and curve accounting; includes phase-specific review
notes and three pinned historical policy cards; and rejects a backwards host
clock at completion. Token name, symbol, description, artwork, links, character
records and other creator prose are omitted. Unknown market cap, volume, holder
count, treasury, quote and creator authorization stay null. A token supplied to
this command is a requested project, never an announced Fortune platform CA.

The response is a one-shot structured briefing, not a daily scheduler, generated
post, investment recommendation, current release verdict or creator login.
Curve-accounted USD is not cash, treasury or LP TVL; retired curve prices remain
null. API attestations are not independent RPC or finality proof. Historical
policy-card commit/links remain explicit and are not refreshed by a live project
read. Execution, publication, creator authentication, independent verification,
model invocation and full co-pilot readiness are always false. No output is
stored, sent to a model, published or connected to a wallet by this command.

Tests exercise phase-specific projection, injected metadata exclusion, provenance
mismatch/invalid inputs/clock rollback, and the actual child CLI through real HTTP
to one loopback API fixture. The test-only preload accepts only Fortune's fixed
project path and is never loaded by production. It also proves disabled/invalid
calls make no requests, the Gateway credential is not sent, and errors disclose
no upstream details. This is not public authentication, provider independence,
AI content quality or complete M02/P06 readiness. Model/privacy/budget/quality,
creator authorization, publishing, durable quotas and operations reviews remain.
