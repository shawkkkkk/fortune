# Holder index (Holder Shield, part 2)

Token and market pages show how many wallets hold a launch, the top ten and what the first 15 seconds of buyers took and still hold. These numbers come from Fortune's own holder index: every `Transfer` of every Fortune launch since the block that created it, folded into exact balances. Public BNB Chain RPCs cannot answer "who holds this token" directly, and the log providers most deployments can afford keep only a few hours of history, so the index keeps its own state in Redis.

## What it shows

- **Holders:** wallets with a non-zero balance. The curve, official pools, the launch's Fortune vaults and burn addresses (`0x…dEaD`, `0x0`) hold tokens but are not holders, so they are left out of the count and the top list.
- **Top 10 hold:** the ten largest holders' share of total supply. Each row is tagged **Creator** or **First 15 s** (the wallet bought inside the Launch Shield window).
- **First 15 seconds:** buys on the curve in the early-wallet-cap window (`Bought` events whose block time is before `launchTimestamp + 15`), the wallets that made them and their share of supply. The Launch Shield tax charged in the first five seconds (`SnipeTaxCharged`) is summed per quote asset.
- **Early buyers hold now:** how much those wallets still hold, and how many of them (checked for up to 500 wallets).

The page states facts. A large top-ten share or a large early-buyer position is shaded as worth a second look, never labeled a scam.

## How it runs

- One cursor per chain moves through confirmed blocks (the head minus 20). Each step reads the factories' `LaunchCreated` and `TaxLaunchCreated` logs, then every `Transfer` of every tracked launch, and the curve's Launch Shield events for launches in their first 64 blocks.
- One writer at a time: a run takes a lock (`SET NX PX`) holding its own random id.
- Every write is one Lua script (`EVAL`) that runs atomically on the server. It checks the lock still holds this run's id, extends the lease, and writes the step's balances, rankings, Launch Shield stats and new cursor.
  - Runs cannot interleave within that script. An interrupted response may hide a completed write; inspect the existing cursor/state rather than infer rollback. Redis script execution is not a general rollback guarantee for command/server errors.
  - The ownership check covers the writes themselves. A lock, once lost, can never hold that run's id again, so a run whose lease expired can never write, even after another run has taken over and finished.
  - Releasing the lock is also a script, so a run never deletes another run's lock.
- A launch created before the index started is **untracked** and shows nothing. A new index starts about 80,000 blocks back, which is what public log providers keep; with a full-history provider, set `FORTUNE_HOLDER_INDEX_START_BLOCK` to the factory's deployment block to cover every launch.
- A range the provider refuses for its size ("exceed maximum block range", too many results) is halved and retried. The smaller span then holds for the rest of the run.

## Gaps and how they heal

If the index goes quiet for longer than the provider's history (about 11 hours on PublicNode), the blocks it still needs are pruned:
- It finds the provider's history edge by binary search and continues from there. Launches created after the edge are found normally.
- Every launch it was tracking is marked **gap**, and its holder panel says the data is paused rather than showing wrong numbers.
- A sender whose balance would go negative marks that launch **inconsistent**, for the same reason.

A gap heals only when that is provable. At the cursor block, the index reads `balanceOf` for every address it knows for the launch, plus `totalSupply`:
- If the known addresses hold the whole supply between them, no unknown wallet holds any. The index adopts the chain's balances, and the panel notes the block where they were rebuilt.
- If not, the launch stays paused and is checked again about an hour later.

## Configuration

| Variable | Purpose |
| --- | --- |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Server-only Upstash Redis (already used for image uploads). Without them the index and the panel are off. |
| `FORTUNE_HOLDER_INDEX_ENABLED=false` | Turns the index off while Redis stays configured. |
| `FORTUNE_HOLDER_INDEX_START_BLOCK` | First block of a fresh index. Default: about 80,000 blocks before the head. |
| `FORTUNE_HOLDER_INDEX_INTERVAL_SECONDS` | Page views move the index at most once per this many seconds (15 to 3,600; default 60). |
| `CRON_SECRET` | 16+ characters. Protects `GET /api/cron/holders`, which runs the index for up to 45 seconds. |
| `BSC_TESTNET_LOG_RPC_URLS`, `BSC_LOG_RPC_URLS` | The log providers the trade ledger already uses. |
| `FORTUNE_HOLDER_INDEX_STORE=memory` | Local rehearsals only: an in-process store. Refused when `VERCEL` is set. |

Keys live under `fortune:holders:v1:<chainId>:` in the shared Redis. Deleting them rebuilds the index from the start block.

## Keeping it current

Every read of `GET /api/public/v1/holders/{token}` schedules one index run after the response (`after()`), at most once per interval. So a site with regular traffic stays current with no scheduler. For quiet periods, call the cron endpoint every few minutes with `Authorization: Bearer $CRON_SECRET`. Options:
- **Vercel Cron:** Pro plans can run every minute. Hobby allows one run a day, which is not enough on its own.
- **An external scheduler:** any service that can send that header on a schedule.
- **A GitHub Actions `schedule`:** each run bills at least a minute of Actions time on private repositories.

No `vercel.json` cron is committed, because the right schedule depends on the plan.

## Cost

Each step costs one pipeline read plus one script call, which runs roughly 5 to 30 Redis writes. A page view reads about 8 commands. Upstash's free tier covers a quiet testnet. With steady traffic, expect pay-as-you-go pricing, a few dollars a month at thousands of views a day.

Log reads grow with the number of tracked launches: one `eth_getLogs` per nine launches per 5,000-block step on the public provider, or per 50 on a configured one. Past a few thousand active launches, move to a dedicated indexing service.

## Limits

- Standard and tax-mode Fortune launches only; custom-pair beta launches are not indexed yet.
- The top list and counts treat every address alike. A wallet is not a person, and one person can hold many wallets; the page says so.
- Rankings use a floating-point score; balances and shares are exact integers.


## Bounded Redis REST responses

Each nonempty Upstash pipeline/owner-checked commit/release call has one real
10-second rejecting wall timer, a safe nonnegative nondecreasing host-clock fence
before/after fetch, every streamed read and JSON/result projection, and finally
cleanup on every outcome. Empty pipelines remain local. Responses are strict
UTF-8 JSON, at most8MiB declared/actual bytes and4096 nonfinal chunks including
empty chunks; oversized or highly fragmented valid responses may fail closed.
Commands, authentication, no-redirect transport, Lua scripts, key/schema/lease
semantics and return values are unchanged. No new application retry or service
configuration. Abort/cancel is best effort and never awaited; in-flight work may
continue, and event-loop scheduling is not a hard process watchdog.

A timeout or discarded malformed response does NOT prove that submitted Redis
commands failed, rolled back or did not execute. It grants no successful commit
marker: reconcile existing state/lease under the established index procedure;
never assume an uncertain write can be blindly replayed. This per-call lifetime
is not a total cron/index-run budget, Redis transaction rollback guarantee,
power-loss/recovery certification or independent chain/finality/holder evidence.
No production Redis credentials or deployment settings are provisioned here.
