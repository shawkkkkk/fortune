# Local Creator Studio

`/studio` is a first executable creator-facing slice of P02/P06 in MEME_OS_PARITY.md.
It edits project name/ticker/description, appearance, voice, objective, backstory,
identity prompt, content boundaries and a user-stated license/permissions note.
Empty fields stay empty. Prompts are data, never executed. No AI/model provider,
wallet, uploads, public API mutation, onchain metadata change or social posting is
connected. This is not creator-authenticated canon or the complete Content Studio.

Save/load/delete uses explicit browser-local storage, version1 and a chain97/token
key. A typed address is only an unverified local label, not a verified Fortune
launch or creator identity. Switching it clears unsaved fields and imported text;
loading another draft is explicit. Same-origin scripts and people using the
browser can access localStorage. No encryption or cross-device persistence is
claimed. Do not store secrets. Exported files may be shared by their recipient.

The deterministic announcement contains only user-entered project name, ticker
and description. It does not invent launches, financial claims or missing facts;
user-entered claims are still unverified. Review of wording is required before
JSON/text download. Every edit, load, import, save or deletion resets that review.
Review is never persisted/imported/exported as authority, signature or consent to
publish. This is local wording review only, not an onchain/social action approval.

JSON imports require the same project/chain/version and whitelist ten text fields.
They reject controls, per-field UTF-8 overflows and documents over32KiB. Combined
export size is checked too, including JSON escaping. Foreign keys, wallet/signing
fields and forged approval/provenance are discarded. The export always says
`local-unverified-draft`; a pasted license statement does not verify IP rights.
Importing does not save automatically. React renders text; no HTML or creator URL
is executed. No localStorage fields are sent to the server or read by the MCP tool.

Verification includes pure schema/projection tests and real desktop/mobile browser
flows for save/reload, scoped keys, download review invalidation and imports. These
are local-file/browser tests, not identity attestation, paid AI or live publishing.
Normal Fortune CI runs the web tests and the Studio localhost browser fixture.
Existing launch, API, dependency and Standard fingerprints
are unchanged. Creator-authenticated persistence, immutable revision provenance,
model/privacy/spend controls, media, public quotas, social OAuth/approval receipts
and integrations with agents/MCP remain separate implementation work.
