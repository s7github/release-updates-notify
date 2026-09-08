# ADR-0004: Cloud Run + Pub/Sub, not Cloud Functions

- **Status:** Accepted
- **Date:** 2026-09-08

## Context

[ADR-0003](0003-server-side-ai-and-polling.md) puts scraping and AI extraction on
a server. This decides what that server is.

Measured shape of the work, from the existing `pollService.ts`:

- A **latest-release** poll is a handful of HTTP fetches plus one Gemini call —
  seconds.
- A **full history** scrape fetches up to 50 GitHub releases or an 80 KB HTML
  changelog, sends up to 100 KB to Gemini, and writes up to 100 Firestore
  documents in batches. This runs into **minutes**, and vendor sites are slow and
  frequently time out.
- A scheduled sweep of the catalog fires N of these at once, where N is the
  number of software entries due for a check.

The stated requirement is to handle large traffic and large processing after
launch.

## Decision

Three **Cloud Run** services — `poller`, `notifier`, `api` — with **Pub/Sub**
between the pipeline stages and **Cloud Scheduler** driving the cron.

| Stage | Transport | Why |
|---|---|---|
| Scheduler → poller | Pub/Sub `poll-requests` | Backpressure and retry |
| poller → notifier | Pub/Sub `release-published` | Decouple send from process |
| client → api | HTTPS + Firebase ID token | Synchronous, user-facing |

## Alternatives considered

| Option | Why not |
|---|---|
| Cloud Functions (2nd gen) | The 9-minute default timeout is uncomfortably close to a full history scrape, and per-instance concurrency of 1 means one container per in-flight request. At catalog scale that is a lot of cold containers. Genuinely fine for the `notifier`; the split is not worth two deployment models. |
| One monolithic Cloud Run service | Scraping and notification have opposite scaling profiles — one is slow, network-bound and bursty, the other is fast, fan-out-heavy and latency-sensitive. Sharing an autoscaler means tuning for neither. |
| Scheduler calling Cloud Run over HTTP directly | No queue means no backpressure. A sweep of 5,000 items becomes 5,000 concurrent requests and the autoscaler either melts or throttles, with no dead-letter queue when a vendor site is down. |
| GKE / Compute Engine | Scale-to-zero matters. The pipeline is idle most of the hour. Paying for idle nodes to run a cron is the wrong shape. |
| A third-party queue (SQS, RabbitMQ) | Another vendor, another credential, another thing to operate, for no capability Pub/Sub lacks here. |

## Consequences

**Good:**
- 60-minute timeout comfortably covers the worst history scrape.
- Request concurrency (one container serving many requests) is substantially
  cheaper than one-container-per-request under load.
- Pub/Sub gives retries with exponential backoff and a dead-letter queue for
  free. A vendor site being down for an hour costs nothing and loses no jobs.
- The container runs identically on a laptop, in CI, and in production. No
  emulator-versus-real divergence for the pipeline logic.
- Stages scale independently.

**Bad — the price we are paying:**
- More infrastructure to define than a Functions deploy: services, topics,
  subscriptions, dead-letter topics, scheduler jobs, IAM bindings.
- Pub/Sub is at-least-once. Every consumer must be idempotent. This is why
  `release_notes` document IDs are derived deterministically from
  `softwareId + normalised version` — a redelivered message overwrites rather
  than duplicates.
- Cold starts on a scale-to-zero service add latency to the first poll of a
  sweep. Irrelevant for cron, noticeable on the user-facing `api`; set
  `min-instances=1` on `api` only.

**Revisit if:**
- The catalog stays small enough (low hundreds) that Cloud Functions' limits are
  never approached, and the operational simplicity is worth more than the
  headroom.
