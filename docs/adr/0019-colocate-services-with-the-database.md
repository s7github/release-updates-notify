# ADR-0019: Run the Cloud Run services in the database's region

- **Status:** Accepted
- **Date:** 2026-10-28
- **Supersedes:** — (resolves a consequence recorded in ADR-0018)

## Context

ADR-0013 placed the `updatenotify` database in `europe-west4`, but the services,
Pub/Sub subscriptions and scheduler job were deployed to `europe-west1`. Every
Firestore read and write from the pipeline crossed regions, adding latency to each
call and a small inter-region egress charge. ADR-0018 listed this as an open cost.
The app is not public yet, so a cutover with new service URLs was acceptable.

## Decision

`deploy-gcp.ps1` now defaults `-Region` to `europe-west4`. The three services were
deployed there, both push subscriptions and the scheduler job were repointed, the
web app's fallback API URL was updated, and the `europe-west1` services and
scheduler job were deleted.

## Consequences

**Good:**
- Pipeline-to-database calls stay in one region.

**Bad — the price we are paying:**
- The API URL changed (`...-ew.a.run.app` to `...-ez.a.run.app`). Anything that
  cached the old URL must be updated; the repository's references were.
- The image is still pulled from `gcr.io` (Container Registry), which Google is
  retiring in favour of Artifact Registry.

**Revisit if:**
- The database moves region, or the app serves a different continent and needs
  regional services.
