# Project Status

**Last updated:** 2026-09-09
**Updated by:** the native Android conversion session

> **If you are an agent or a person picking this up cold, this is the file that
> tells you where things actually stand.** Read it before planning anything, and
> **update it before you finish.** A stale STATUS.md is worse than none, because
> the next person will trust it.
>
> Keep the honesty. "Scaffolded but never run against a real project" is a useful
> sentence; "done" would not be.

---

## 1. One-paragraph summary

The React PWA has been restructured into a monorepo and a **native Android
client has been built and verified to compile, lint and test clean, producing a
real debug APK.** The Firestore security rules have been rewritten and are
covered by a passing 31-case test suite. **The backend pipeline does not exist
yet** — it is fully specified in `ARCHITECTURE.md` and the ADRs, and nothing has
been written. Until it does, the app has no data to show and cannot notify
anyone.

---

## 2. Verified working

Everything here was actually run, not assumed.

| What | Evidence |
|---|---|
| Android app assembles | `./gradlew assembleDebug` → 28 MB `app-debug.apk`, package `com.updatenotify.debug`, compileSdk 37, targetSdk 36 |
| Android lint passes | `./gradlew lintDebug` clean, `abortOnError = true`, no baseline file |
| Unit tests pass | 34 tests, 0 failures, across `:core:model`, `:core:common`, `:core:database` |
| Build is warning-free | No warnings from project sources. One unavoidable AGP notice about the Kotlin plugin remains — see ADR-0010 |
| Firestore rules pass | 31 cases against the emulator, 0 failures — 12 deny (the "Dirty Dozen"), 8 further deny, 11 allow |
| Toolchain resolves | AGP 9.4.0, Gradle 9.7.1, Kotlin 2.3.21, KSP 2.3.11, Hilt 2.60.1 |

**Not verified:** the app has never been run on a device or emulator. It compiles
and its logic is unit-tested; whether the screens actually render correctly is
unknown. Nothing has been deployed anywhere.

---

## 3. Done

### Documentation and process
- [x] Monorepo layout — `docs/ android/ backend/ firebase/ web/`
- [x] `CLAUDE.md` and `AGENTS.md` agent entry points
- [x] `ARCHITECTURE.md` — target system, module graph, pipeline, known weaknesses
- [x] `DATA_MODEL.md` — normative schema for all nine Firestore collections
- [x] ADRs 0001–0010, append-only, each with rejected alternatives and costs
- [x] CI: three path-filtered workflows (Android, Firestore rules, web)

### Android client
- [x] 15-module graph with convention plugins; features cannot depend on features
- [x] Domain layer as pure Kotlin — no Android dependency
- [x] Room schema, DAOs, mappers; the feed is a SQL join Firestore cannot express
- [x] Firestore data sources with total mappers (a bad document is skipped, never thrown)
- [x] Repository layer behind domain interfaces, Hilt-bound
- [x] Incremental sync against a stored watermark
- [x] Design system carrying the web app's identity, plus a derived light theme
- [x] Five feature modules: auth, dashboard, library, software detail, settings
- [x] Google Sign-In via Credential Manager
- [x] Navigation host, FCM service, per-category notification channels

### Firebase
- [x] Rules rewritten to a read-mostly client; client write access to
      `master_registry`, `release_notes` and `background_tasks` removed
- [x] Hardcoded admin email removed; membership is document existence
- [x] Five composite indexes declared, including the fan-out `softwareId` index
- [x] Emulator config and a rules test suite wired into CI

---

## 4. Not done — and what it blocks

### The backend pipeline — **the critical path**

`backend/` is empty. Nothing in it exists. This blocks the entire product:

| Missing | Blocks |
|---|---|
| `poller` Cloud Run service | Any release data existing at all |
| `notifier` Cloud Run service | Every notification — i.e. the product |
| `api` Cloud Run service | Search discovery and the refresh button; both currently fail |
| Cloud Scheduler + Pub/Sub topics | Anything happening without a human pressing a button |
| Secret Manager entry for the Gemini key | The poller running |

The logic to port is not hypothetical — it exists in `web/server.ts` (the
scraping proxy) and `web/src/services/pollService.ts` and `gemini.ts` (source
priority, extraction prompts, self-correction). The prompts in particular are
tuned and should be moved across as-is, not rewritten.

**Until this exists the Android app shows an empty dashboard**, because there is
nothing writing `release_notes`.

### Android gaps

- [ ] Never run on a device or emulator. **Do this first** — it is cheap and will
      find real problems.
- [ ] No instrumented or Compose UI tests
- [ ] `TaskRepositoryImpl.observeActiveTasks()` returns an empty flow; needs the
      `requestedBy` index query wired up
- [ ] No `google-services.json`, so sign-in cannot be exercised (see `SETUP.md`)
- [ ] No release signing config; `assembleRelease` uses the debug key
- [ ] Paging 3 is wired into the build but the feed uses a plain limited query.
      ADR-0005 anticipates paging; it is not implemented.
- [ ] No Firebase App Check. Worth adding as defence in depth (ADR-0006).
- [ ] No crash reporting or analytics
- [ ] No widget, no Wear surface, no deep-link intent filter beyond the
      notification extra

### Data migration

- [ ] Existing `interests` documents use random ids, so a user can follow the
      same software twice and be notified twice. New writes use deterministic
      ids; **a one-off de-duplication pass over existing documents is still
      needed** (`DATA_MODEL.md` §2).
- [ ] `user_subscriptions` appears in the old rules with no reader or writer
      anywhere. Confirm it is empty in production, then delete it.

---

## 5. Tracked upgrades and watch items

Things that are fine today and will need attention.

| Item | Trigger | Detail |
|---|---|---|
| **Drop `android.newDsl=false` and `android.builtInKotlin=false`** | KSP gains built-in-Kotlin compatibility | The two load-bearing flags in `gradle.properties`. AGP 10 removes the old DSL, forcing this regardless. **The main one to watch.** ADR-0010 |
| FCM token API | Firebase ships a replacement | `FirebaseMessaging.token` and `onNewToken` are deprecated in messaging 25.x with nothing to migrate to. Suppressed with the reason stated inline. |
| GitHub API rate limits | Catalog grows past ~60 polls/hour | Anonymous limit is 60/hr; an authenticated token raises it to 5,000/hr. Needed before the catalog gets large. |
| Gemini spend | Catalog × poll frequency grows | Add cheap change detection (ETag or content hash) before spending an extraction call, and tier poll frequency by popularity. `ARCHITECTURE.md` §7 |
| Dead source detection | Vendors redesign their sites | A source yielding nothing N times running should be flagged for admin review. Currently fails silently. |
| Catalog search | Prefix matching stops being enough | Firestore has no full-text search. Algolia or Typesense when it matters. |

---

## 6. Suggested order of work

1. **Run the app on an emulator.** Cheapest possible way to find real problems.
   Requires `google-services.json` — see `SETUP.md`.
2. **Build the `poller` service.** Port `web/server.ts` and `pollService.ts`.
   Nothing downstream matters until release data exists.
3. **Build the `notifier`** with the genuine-update gate. This is the product.
4. **Build the `api` service** for discovery and refresh, which the app already
   calls and which currently fails.
5. Wire Cloud Scheduler and the Pub/Sub topics; deploy.
6. De-duplicate existing `interests` documents.
7. Then the Android polish list in §4.

---

## 7. Open questions for a human

- **Which Firebase project?** The web app points at `gen-lang-client-0040242541`,
  an AI Studio scratch project. Reusing it for a shipped Android app is probably
  wrong; a fresh project with proper IAM is probably right. Nobody has decided.
- **Is iOS wanted?** ADR-0002 says no and keeps the domain layer Android-free so
  KMP stays cheap. If the answer changes, decide before the domain layer grows
  Android dependencies by accident.
- **Poll frequency and budget.** Nothing has been chosen, and it is the main
  driver of Gemini cost.
- **Play Store or internal distribution?** Determines whether release signing and
  a privacy policy are near-term work.
