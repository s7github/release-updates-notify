# ADR-0003: AI calls and scraping are server-side, always

- **Status:** Accepted
- **Date:** 2026-09-08

## Context

This is the most consequential decision in the conversion. It has three separate
forces pushing the same way.

**1. The API key.** The web app calls Gemini from `web/src/services/gemini.ts`,
a frontend file, reading `process.env.GEMINI_API_KEY`. That works in Google AI
Studio because the platform injects the key into a server-rendered runtime it
controls. It does not transfer. An APK is a zip archive; anything compiled into
it — string constants, `BuildConfig` fields, resource values, NDK blobs — is
recoverable with `apktool` in under a minute. Obfuscation delays this, it does
not prevent it. A shipped key is a published key, and this one bills to a credit
card.

**2. Cost and duplication.** Client-side polling is `O(users × catalog)`. Ten
thousand users tracking FL Studio means ten thousand scrapes of the same page and
ten thousand paid Gemini calls that all produce the same answer. Server-side it
is `O(catalog)` — one scrape, one extraction, ten thousand cheap notifications.
The requirement is explicitly to handle large traffic and large processing; this
is the difference between a bill that scales with catalog size and one that
scales with the product of catalog and users.

**3. Android will not let you do it anyway.** Doze and App Standby make periodic
background network work unreliable by design. `WorkManager` guarantees eventual
execution, not timely execution. A user whose phone sat in a drawer overnight
would learn about a security patch whenever the OS felt like it. That is not a
notification product.

## Decision

The Android client **never** calls Gemini, **never** fetches a changelog, and
**never** parses HTML or RSS.

All discovery, scraping, and AI extraction happens in `backend/` on Cloud Run.
The client's entire surface is: read Firestore, write its own `users/{uid}` and
its own `interests`, call one authenticated API for discovery and refresh
enqueue, and receive FCM.

The Gemini key lives in Google Secret Manager, mounted into the Cloud Run
services. It never enters the repository and never enters an artifact that leaves
a Google datacentre.

"Refresh" in the UI publishes a job to the queue. It does not do the work.

## Alternatives considered

| Option | Why not |
|---|---|
| Ship the key in the APK | The key is extractable and billable. Not a real option; recorded because it is what a direct port would produce. |
| Proxy Gemini through a thin backend, keep scraping on-device | Fixes the key, keeps the `O(users × catalog)` cost and the Doze unreliability. Solves the least important third of the problem. |
| Firebase App Check + client-side Gemini | App Check raises the cost of abuse; it does not eliminate it, and it does nothing at all about duplicated work or background reliability. Worth adding regardless, as defence in depth — but not as the answer here. |
| Vertex AI in Firebase (client SDK) | Legitimately removes the raw key from the client. Still leaves per-user duplicated inference cost and Doze unreliability. Rejected on economics and reliability, not on secrecy. |

## Consequences

**Good:**
- No secret ever ships to a device.
- AI spend scales with the catalog, not with the product of catalog and users.
- Notification timeliness is a server scheduling problem, which is solvable,
  rather than an OS scheduling problem, which is not.
- One extraction result is shared by every subscriber, so all users see
  consistent data.

**Bad — the price we are paying:**
- There is now a backend to build, deploy, monitor, and pay for. The PWA had
  none. This roughly doubles the surface area of the project.
- The app cannot function at all against a cold catalog — a brand-new software
  entry shows nothing until the pipeline has processed it. Onboarding must
  handle "we are looking this up, check back shortly" as a real UI state, not an
  edge case.
- Local development now needs the Firebase emulator suite plus a running backend,
  not just `npm run dev`.

**Revisit if:**
- Never, for the key. The cost and reliability arguments could in principle be
  revisited if on-device models made local extraction free and instant — but the
  duplicated-work argument would still stand.
