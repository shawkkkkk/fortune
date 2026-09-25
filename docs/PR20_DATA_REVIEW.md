# PR #20 data review — 2026-09-25

Review base: `410ab1cc2f5e69f76424a469a1dad1f8327e95d8`. This correction is stacked on Claude's chart/ranking branch, not deployed to production. It does not alter the frozen Standard candidate or any release gate.

## Corrected

- Replace estimated event timestamps with verified block-header timestamps; compare log block hashes, reject removed/incomplete or out-of-scope logs and deduplicate by block hash/log index.
- Verify the actual ledger chain and recheck a cached head before reuse. Scope retention estimates and scan caches to their RPC client. Coverage uses the actual starting block's timestamp, not an average cadence estimate.
- Bound verification to 2,048 block headers and 20,000 logs per on-demand scan. Exceeding a budget returns unavailable rather than a silently truncated total. A durable indexer remains necessary for higher volume.
- Scope official-pool caches to verified chain/block hashes and reread token decimals at the requested block. Reject locker indexes above the explicit 10,000-entry limit.
- Remove raw RPC error messages from public market endpoints, including potential provider URL credentials. Reject inherited chart-range keys such as `constructor`.
- Keep historical pool-swap USD values and prices unavailable until historical oracle valuation is implemented. Today's oracle price must not be substituted for the event-time price. Current pool quotes remain available separately.
- Unknown USD values cannot contribute zero to a volume total. Volume rankings are unavailable when required valuations are missing; trade counts can remain available.
- Label chart volume as the shown recent-trade subset (at most 50 rows), not the complete requested period. Explain unavailable historical USD values in English and Chinese.

## Verification and remaining boundaries

24 web tests pass, including seven new regression cases for unknown valuation, exact timestamps/deduplication, provider isolation and cached reorgs, window validation, same-count locker reorgs, decimal changes and inherited range keys. Production build and TypeScript checks are required before this correction is merged.

This is not an independent audit. Full historical oracle valuation, durable event storage/reconciliation, a common snapshot across all state/chart components and stable ranking pagination remain production work. Current USD state conversion uses the latest healthy registry observation, rather than claiming that observation is pinned to the pool-state block. Do not merge or deploy the broader chart/ranking feature on the basis of this partial review alone.
