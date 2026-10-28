# ADR-0016: Gate polls before the model, poll only followed products, trip a breaker on quota

- **Status:** Accepted
- **Date:** 2026-10-28
- **Supersedes:** — (refines ADR-0004 and ADR-0003; does not move any work off the server)

## Context

After seeding ~15k catalog entries (ADR-0015) and moving to a free-tier Gemini
key, three things were costing or blocking more than they should:

- Every poll called the model, then compared versions. The comparison that
  decides "nothing new" ran *after* the expensive step. The in-memory cache that
  was meant to help is never populated (`cache.set` is not called) and would not
  survive scale-to-zero anyway.
- The hourly sweep and the console's "Scan all" selected from the whole catalog,
  so seeded entries nobody follows could consume model calls.
- On a daily-quota 429 the worker returned 5xx, so Pub/Sub redelivered each job
  up to five times and the next sweep queued the same work again. It left ~20
  tasks stuck at `processing`. A scheduled poll could also fall through to
  search-grounded Gemini calls, which are billed per query.

## Decision

1. **Source-hash gate.** `master_registry.lastSourceHash` stores a SHA-256 of the
   fetched source chunks after each successful extraction. If the next poll's hash
   is equal, the poll ends without calling the model (`force` bypasses it).
2. **Follow-only sweeps.** `enqueueDuePolls` polls entries that appear in
   `interests`, are `active == true`, and have `lastCheck` null (first poll) or
   older than the cutoff. "Scan all" uses the same followed set.
3. **Scheduled polls are cheap.** Messages from the sweep carry `scheduled: true`:
   one extraction attempt, and no web-search fallback. User and admin polls keep
   the full fallback chain (minus the duplicate `gemini_search_grounded` strategy,
   which made the same call as `gemini_direct`).
4. **Quota circuit breaker.** A quota error is parsed for its retry delay and
   stored in `system_state/gemini.blockedUntil`. Polls, history jobs, the sweep
   and `/v1/discover` check it first; a blocked job is acknowledged (not
   redelivered) with a task message saying when AI resumes. Blocks under five
   minutes (per-minute limits) are kept in memory only.
5. **Search fields.** `searchKey` / `searchTokens` on every entry replace the
   web client's "first 200 documents" scan.

## Alternatives considered

| Option | Why not |
|---|---|
| Distributed cache (Redis/Memorystore) | A fixed monthly cost to solve what a stored hash solves for free. |
| Return 5xx on quota and rely on Pub/Sub backoff | Retries cannot succeed for hours and keep the queue full. |
| Maintained follower counters | Needs a Firestore trigger; reading `interests` once per sweep is cheap at current scale. |
| Algolia / Typesense for search | A new paid dependency for a prefix + word lookup Firestore already does. |

## Consequences

**Good:**
- Most hourly polls end with no model call. Seeded, unfollowed products cost
  nothing. A quota outage becomes a clean pause instead of a pile-up.

**Bad — the price we are paying:**
- Volatile pages (timestamps, rotating promos) change the hash every poll and get
  no saving. They behave exactly as before.
- The sweep reads every `interests` document once per run.
- A skipped poll cannot notice a source *parsing* fix; use `force` after changing
  a source or the extraction prompt.
- A new product needs a first poll from somebody: following it makes it due on
  the next sweep (up to one hour), not instantly.

**Revisit if:**
- `interests` grows past ~100k documents (maintain a follower count instead).
- The hash gate saves little because most sources are volatile HTML.
