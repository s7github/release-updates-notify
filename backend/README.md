# Backend

Three Cloud Run services that do everything the Android client is not allowed to:
scraping, AI extraction, scheduling, and push fan-out.

Why it is shaped this way: [ADR-0003](../docs/adr/0003-server-side-ai-and-polling.md)
(AI and scraping are server-side) and
[ADR-0004](../docs/adr/0004-cloud-run-pubsub-pipeline.md) (Cloud Run + Pub/Sub,
not Cloud Functions).

---

## The services

One image, three services. `SERVICE` decides which app runs — three
near-identical Dockerfiles would drift.

| `SERVICE` | Trigger | Job |
|---|---|---|
| `api` | HTTPS + Firebase ID token | Discovery and refresh. Both only **enqueue**. |
| `poller` | Pub/Sub `poll-requests` | Fetch sources, extract, write, publish genuine updates |
| `notifier` | Pub/Sub `release-published` | Resolve subscribers, apply preferences, send FCM, prune dead tokens |

```
Cloud Scheduler ─► poller /scheduler/sweep ─► Pub/Sub poll-requests ─► poller /pubsub/poll
                                                                            │
                                                          writes release_notes
                                                                            │
                                                    (only if genuinely new)
                                                                            ▼
                                              Pub/Sub release-published ─► notifier ─► FCM
```

---

## Local development

```bash
npm ci
npm run lint     # typechecks src and test
npm test         # 38 tests, no network or emulator needed
npm run build

SERVICE=api npm start
```

The pure functions — version comparison, source priority, HTML scraping, model
output sanitisation — are tested without any network or Firebase. That is
deliberate: they hold the logic that is actually easy to get wrong.

For anything touching Firestore, start the emulators from `firebase/`:

```bash
cd ../firebase && npm run emulators
export FIRESTORE_EMULATOR_HOST=localhost:8080
```

---

## Configuration

| Variable | Required | Notes |
|---|---|---|
| `SERVICE` | yes | `api` \| `poller` \| `notifier`. An unknown value refuses to start. |
| `PORT` | no | Cloud Run injects it |
| `GEMINI_API_KEY` | poller, api | **The one real secret.** Secret Manager only |
| `GOOGLE_CLOUD_PROJECT` | yes | |
| `FIRESTORE_DATABASE_ID` | no | The AI Studio project uses a named, non-default database |
| `GITHUB_TOKEN` | no | Raises the rate limit from 60/hr to 5,000/hr. Wanted before the catalog grows |
| `TOPIC_POLL_REQUESTS` | no | Defaults to `poll-requests` |
| `TOPIC_RELEASE_PUBLISHED` | no | Defaults to `release-published` |
| `LIMIT_DISCOVERY_PER_HOUR` | no | Per-user. Defaults to 10 |
| `LIMIT_REFRESH_PER_HOUR` | no | Per-user. Defaults to 30 |

Config is validated at startup, so a missing value crashes the container
immediately rather than failing on the first request an hour later.

---

## Deployment sketch

Not yet run against a real project — see [`../docs/STATUS.md`](../docs/STATUS.md).

```bash
PROJECT=your-project
REGION=europe-west1

# 1. Secret
echo -n "$GEMINI_KEY" | gcloud secrets create gemini-api-key --data-file=- --project=$PROJECT

# 2. Topics, with dead-letter queues so a persistently failing message
#    stops rather than looping forever
gcloud pubsub topics create poll-requests release-published dead-letter --project=$PROJECT

# 3. Build once, deploy three times
gcloud builds submit --tag gcr.io/$PROJECT/updatenotify-backend

for SVC in api poller notifier; do
  gcloud run deploy updatenotify-$SVC \
    --image gcr.io/$PROJECT/updatenotify-backend \
    --region $REGION \
    --set-env-vars SERVICE=$SVC \
    --set-secrets GEMINI_API_KEY=gemini-api-key:latest \
    --no-allow-unauthenticated
done
```

Then:

- **`api` only:** `--min-instances=1`. It is user-facing, and a cold start on the
  discovery path is a visible delay. The workers are cron-driven and should
  scale to zero.
- **Push subscriptions** to `poller /pubsub/poll` and `notifier /pubsub/notify`,
  each with an OIDC service account and the dead-letter topic attached.
- **Cloud Scheduler** hitting `poller /scheduler/sweep` — hourly is a reasonable
  start. Frequency is the main driver of Gemini spend.
- **Allow the Android app to reach `api`.** It is the only service a client
  touches; the workers must stay `--no-allow-unauthenticated`.

---

## Two things to know before changing this

**Idempotency is required, not optional.** Pub/Sub is at-least-once, so every
consumer will see duplicates. `release_notes` document ids are derived from
`softwareId` + normalised version precisely so a redelivery overwrites instead of
duplicating.

**Status codes are the retry protocol.** `2xx` acknowledges and deletes the
message; `5xx` retries with backoff and eventually dead-letters. So a malformed
message returns `2xx` (retrying will never fix it) while a transient failure
returns `5xx`. Getting this backwards either loses work or loops forever.
