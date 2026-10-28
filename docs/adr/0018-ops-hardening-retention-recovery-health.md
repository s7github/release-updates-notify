# ADR-0018: Adaptive polling, conditional requests, retention, recovery and a pipeline heartbeat

- **Status:** Accepted
- **Date:** 2026-10-28
- **Supersedes:** — (refines ADR-0016 and ADR-0017)

## Context

A review of cost, storage, performance and uptime found:

- Every followed product was polled on one fixed 6 h interval, whether it shipped
  daily or yearly.
- The admin registry grid subscribed to all ~15k `master_registry` documents, so
  every page open cost ~15k reads.
- Log-style collections (`background_tasks`, `system_learnings`, `admin_audit`)
  grew without bound. Jobs that exhausted Pub/Sub retries left tasks at
  `processing` forever. The dead-letter topic had no IAM grants and no reader.
- Nothing alerted when the pipeline stopped: a dead scheduler produces no error.
- The sweep returned early whenever the AI quota was spent, although detection no
  longer needs the model (ADR-0017).
- Pub/Sub's 10 s default ack deadline is shorter than a scrape plus a model call,
  so slow polls were redelivered while still running.

## Decision

1. **Adaptive cadence.** `pollIntervalMinutes` sets 1 h / 3 h / 6 h / 12 h / 24 h
   from the age of `lastReleaseDate`. A manual sweep can still force one interval.
2. **Conditional GitHub requests.** `master_registry.githubEtag` is sent as
   `If-None-Match`. A 304 settles "unchanged" when every other source is
   structured too; otherwise the normal path runs.
3. **Sweep ignores the quota block.** Products needing the model defer themselves.
4. **Heartbeat and health.** Each sweep writes `system_state/sweep`;
   `GET /healthz/pipeline` returns 503 when it is older than 3 h, for a free
   Cloud Monitoring uptime check.
5. **Reaper.** The sweep fails tasks with no progress for 30 minutes.
6. **Source health.** `emptyPollCount` / `sourceHealth` flag a product after 5
   consecutive polls that fetched nothing, with a Sentry warning.
7. **Retention.** `expiresAt` Timestamps (30 / 180 / 400 days) plus Firestore TTL
   policies. Index exemptions for fields nothing queries.
8. **Admin grid.** Live listener limited to the 100 most recently checked; the rest
   through the indexed catalogue search. Dashboard `in` chunks of 30 (was 10).
9. **Deploy script.** `api` min-instances 0 with CPU boost; workers capped at 3
   instances, concurrency 4; ack deadline 300 s with 10 s to 600 s retry backoff;
   dead-letter IAM and a 7-day pull subscription; scheduler retries; optional
   GitHub token secret; PITR and a daily 7-day backup; TTL policies; the uptime
   check; an optional budget.

## Alternatives considered

| Option | Why not |
|---|---|
| Cloud Tasks per product for cadence | A new service for what a per-entry interval in the existing sweep does. |
| Keep `api` at min 1 | About $10/month to hide a cold start on discover/refresh only. A parameter keeps the option. |
| Algolia for the admin grid | A paid dependency; indexed prefix and token search already exists. |

## Consequences

**Good:**
- Fewer fetches (quiet products back off), no per-load 15k-read listener, bounded
  log storage, recoverable data, and an alert when the pipeline goes quiet.

**Bad — the price we are paying:**
- A 24 h interval delays noticing a surprise release from a long-quiet product by
  up to a day. A user poll or `force` bypasses it.
- A 304 with a non-structured source alongside falls back to the normal path, so
  those products save less.
- The admin grid no longer lists everything at once.
- Services in `europe-west1` still talk to a database in `europe-west4`; moving
  them is a live migration left to the owner.
- The monitoring, backup and TTL steps are best-effort in the script (they warn on
  failure) and were not all verified against a live project.

**Revisit if:**
- Surprise releases from quiet products are being missed (shorten the top tier).
- `interests` passes ~100k documents (maintain a follower count).
