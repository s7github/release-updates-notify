# ADR-0008: Push fan-out is its own pipeline stage

- **Status:** Accepted
- **Date:** 2026-09-08

## Context

Notification is the product. Everything else is plumbing that exists to make a
notification correct and timely.

Two failure modes destroy a notification app, and both are easy to build by
accident:

1. **Notifying when nothing happened.** A scheduled poll re-extracts the same
   release and notifies again. Users uninstall over this faster than over any
   bug.
2. **Notifying everyone about everything.** A user who follows forty things and
   cares only about security patches receives forty times more noise than signal.
   The original PRD's stated purpose is *filtering* noise; a fan-out that ignores
   preferences inverts the product.

There is also a mechanical constraint: FCM multicast is capped at 500 tokens per
request, and tokens go stale constantly — reinstalls, cache clears, app removals.
Dead tokens accumulate forever unless something prunes them.

## Decision

Fan-out is a **separate Cloud Run service** (`notifier`) triggered by its own
Pub/Sub topic (`release-published`), not code appended to the end of the poller.

The poller publishes to that topic **only when the extracted version differs from
`master_registry.lastVersion`** — the genuine-update gate. No new version, no
message, no notification. This is the single most important line in the pipeline.

The notifier then:

1. Queries `interests where softwareId == X` (indexed).
2. Filters by each user's per-category preferences in `users/{uid}.settings` —
   a user who muted "Bug Fixes" is not woken for a patch.
3. Batches tokens in 500s and sends multicast.
4. Deletes tokens returning `UNREGISTERED` or `INVALID_ARGUMENT`.

On the device, each category maps to its own **notification channel**, so the OS
gives users a second, independent layer of control that survives app updates and
that we do not have to build. This is the reason `minSdk` is 26.

## Alternatives considered

| Option | Why not |
|---|---|
| Notify inline at the end of the poller | Couples a slow, failure-prone scrape to a latency-sensitive send. A partial failure mid-fan-out leaves no clean retry point — retrying the message re-scrapes and re-extracts, spending money to redo work that already succeeded. |
| FCM topic subscriptions (`/topics/software_x`) | Elegant, and it moves fan-out into Google's infrastructure. Rejected because topic messages cannot be filtered per user — category preferences become impossible, and the whole point is filtering. |
| Client-side filtering of everything | Ships every release to every device and discards most of it there. Wastes battery and bandwidth, and a muted category still lights up the screen before being suppressed. |
| Scheduled digest instead of per-release push | A genuine option for a future "daily digest" preference, and probably a good one. Not the default: a security patch should not wait for tomorrow's digest. |

## Consequences

**Good:**
- Poller and notifier retry independently. A failed send never re-triggers a
  scrape.
- The genuine-update gate makes duplicate notifications structurally impossible
  rather than a bug to be fixed.
- Per-category preferences are honoured server-side, so muted categories cost no
  battery and never reach the device.
- Notification channels give users OS-level control for free.

**Bad — the price we are paying:**
- Another service to deploy and monitor.
- Pub/Sub is at-least-once, so the notifier must deduplicate. Keyed on
  `(softwareId, version, uid)` with a short-lived marker.
- Token pruning is a write path on the user document, which means the notifier
  needs write access to `users` — a slightly wider grant than pure read.
- Fan-out to a very popular software item is a burst of Firestore reads. Fine at
  current scale; a denormalised subscriber list becomes worth it around six
  figures of subscribers on one item.

**Revisit if:**
- A single software item exceeds roughly 100,000 subscribers, at which point
  per-item subscriber sharding matters.
- Users ask for digests, which is a scheduling change to this service rather
  than a new one.
