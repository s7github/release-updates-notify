# Project Status

**Last updated:** 2026-09-09
**Updated by:** the native Android conversion session, then a Windows verification run

> **If you are an agent or a person picking this up cold, this is the file that
> tells you where things actually stand.** Read it before planning anything, and
> **update it before you finish.** A stale STATUS.md is worse than none, because
> the next person will trust it.
>
> Keep the honesty. "Scaffolded but never run against a real project" is a useful
> sentence; "done" would not be.

---

## 1. One-paragraph summary

The React PWA has been restructured into a monorepo, and three things now exist
and are verified: a **native Android client** that compiles, lints and tests
clean into a real debug APK; **hardened Firestore rules** with a passing 31-case
test suite; and a **backend pipeline** (poller, notifier, api) that typechecks,
passes 38 tests, builds and boots.

**Nothing has been deployed, and the app has never run on a device.** The
pipeline needs a Google Cloud project, a secret, Pub/Sub topics and a scheduler
before any of it is real — all infrastructure, no remaining code. Until then the
dashboard is empty, because nothing is writing `release_notes`.

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
| Backend typechecks and tests | `pnpm run lint` clean; 40 tests, 0 failures |
| Backend builds and boots | `pnpm run build` → `dist/index.js`; all three services answer `/healthz`; an unknown `SERVICE` exits 1 |
| **Verified on Windows too** | Windows 11, JDK 21 (Studio JBR), Node 25, Europe/Amsterdam. Android: APK + 34 tests + lint clean (0 errors). Backend: lint + 40 tests + build. Rules: 31 tests. All green. |
| One-command verification | `.\verify.ps1` runs all three suites, sets `JAVA_HOME`/`ANDROID_HOME`, exits non-zero on failure |

**Not verified:** the app has never been run on a device or emulator. It compiles
and its logic is unit-tested; whether the screens actually render correctly is
unknown. Nothing has been deployed anywhere.

### What the Windows run found

Everything below was green on Linux and broken on Windows. Worth knowing that
CI (Ubuntu, UTC) cannot catch this class of problem on its own.

| Problem | Fix |
|---|---|
| Date-only values parsed as **local** midnight, so a March 9 changelog entry stored as March 8 anywhere east of UTC. The Kotlin client already did this correctly, so the two implementations disagreed. | `backend/src/lib/dates.ts`; both parse sites use it; tests assert exact UTC instants |
| `pnpm run test:rules` could not run at all — single quotes are not argument grouping in `cmd.exe`, so `--test` leaked into `firebase`'s own argv | double quotes in `firebase/package.json` |
| `lintDebug` could not pass while `local.properties` exists — `PropertyEscape` is unsatisfiable on Windows | check disabled in the convention plugin, with the reasoning inline |
| `local.properties` with pasted Windows backslashes mangles into an invalid path (backslash is a `.properties` escape) | documented in `SETUP.md` §2 |
| **Phantom dependency**: `scraper.ts` imported `domhandler` without declaring it, working only via npm's flat hoisting. Surfaced the moment pnpm's strict linking was applied. | declared and pinned to match cheerio (ADR-0011) |

### Lint findings — fixed

Down from 14 warnings to 11, and every remaining one is a dependency-version
notice (`NewerVersionAvailable`, `GradleDependency`) or the deliberate
`targetSdk 36` (`OldTargetApi`, see ADR-0010). **Nothing actionable remains in
the code.**

One of these turned out to be a real bug rather than a style nit:

| Was | Fixed |
|---|---|
| `InlinedApi` on `POST_NOTIFICATIONS` — **`checkSelfPermission()` returns DENIED for a permission the platform does not define, so every notification was silently dropped on API 26–32**, most of the supported range | `NotificationManagerCompat.areNotificationsEnabled()`, correct on all versions and also respects notifications being switched off in settings |
| `CredentialManagerMisuse` — `NoCredentialException` unhandled | Sign-in now distinguishes no-account, user-dismissed (no error shown at all), and provider failure; also stops `runCatching` swallowing coroutine cancellation, and checks the credential type before reading it |
| `MissingPermission` on `notify()` (surfaced by the fix above) | `SecurityException` handled — permission can be revoked between check and call |
| `ObsoleteSdkInt` — `mipmap-anydpi-v26` redundant at `minSdk` 26 | merged into `mipmap-anydpi` |

---

## 3. Done

### Documentation and process
- [x] Monorepo layout — `docs/ android/ backend/ firebase/ web/`
- [x] `CLAUDE.md` and `AGENTS.md` agent entry points
- [x] `ARCHITECTURE.md` — target system, module graph, pipeline, known weaknesses
- [x] `DATA_MODEL.md` — normative schema for all nine Firestore collections
- [x] ADRs 0001–0010, append-only, each with rejected alternatives and costs
- [x] CI: four path-filtered workflows (Android, backend, Firestore rules, web)

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

### Backend
- [x] Three Cloud Run services from one image, selected by `SERVICE`
- [x] Source aggregation ported from `web/server.ts`, extraction prompts ported
      verbatim from `web/src/services/gemini.ts` — they are tuned, and rewriting
      them would regress quality invisibly
- [x] The genuine-update gate, which the web app had no need for and which is the
      single most important check in the pipeline
- [x] Model output re-validated before it is trusted (dates rejected as versions,
      off-list categories defaulted, unparseable dates nulled rather than invented)
- [x] Server-side notification preference filtering, FCM batching, dead-token pruning
- [x] Firestore-backed per-user rate limits, because discovery spends money
- [x] Pub/Sub OIDC verification, structured Cloud Logging, graceful SIGTERM draining

---

## 4. Not done — and what it blocks

### The backend pipeline — **written, never deployed**

All three services exist, typecheck, pass 38 tests, build, and boot. **None has
ever run against a real Google Cloud project**, so treat the whole thing as
unproven in production.

Written:
- `poller` — source aggregation, Gemini extraction, the genuine-update gate,
  self-correcting metadata, history backfill, scheduler sweep
- `notifier` — subscriber resolution, server-side preference filtering, FCM
  multicast in 500s, dead-token pruning
- `api` — authenticated discovery and refresh, both enqueue-only, with
  Firestore-backed per-user hourly quotas
- Dockerfile (one image, three services), structured Cloud Logging, graceful
  SIGTERM draining

Still missing, and all of it is infrastructure rather than code:

| Missing | Blocks |
|---|---|
| A Google Cloud project with billing | Everything below |
| Secret Manager entry for the Gemini key | The poller and api running |
| Pub/Sub topics, push subscriptions, dead-letter queues | The pipeline connecting |
| Cloud Scheduler job | Anything happening unattended |
| A first deploy | Any of it being real |

`backend/README.md` has the deployment sketch. **Until it is deployed the
Android app shows an empty dashboard**, because nothing is writing
`release_notes`.

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

### Backend gaps

- [ ] Never deployed; never run against a real project
- [ ] No integration tests against the Firestore emulator — the pure logic is
      covered, the Firestore and Pub/Sub interactions are not
- [ ] `rate_limits` documents need a Firestore TTL policy on `expiresAt`, or they
      accumulate one per user per bucket per hour forever
- [ ] No cheap change detection (ETag or content hash) before spending a Gemini
      call, so an unchanged page still costs an extraction
- [ ] No dead-source detection: a source that yields nothing repeatedly fails
      silently rather than being flagged

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
2. **Deploy the backend.** The code is written and tested; what is missing is a
   project, a secret, topics and a scheduler. `backend/README.md` §Deployment.
   Nothing else matters until release data exists.
3. **Exercise the whole loop once by hand** — discover a piece of software, poll
   it, confirm a release document appears, confirm a push arrives. Every
   integration bug in this system lives in that path, and none of the unit tests
   can see it.
4. De-duplicate existing `interests` documents.
5. Then the Android polish list in §4.

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
- **Orphaned prior work exists outside this repo.** A local checkout was found
  with an entirely separate history — root commit `04ae22d`, up to
  `7d48c29 "Add Gemini AI web search for software history"` — none of which is on
  GitHub; the repo was reinitialised at some point and stranded it. On top sat 11
  uncommitted changes including a **271-line Python scraper**
  (`scraper/main.py`, `utils.py`, `debug.py`), which overlaps directly with what
  `backend/poller` now does. Preserved at
  `C:\projectsepositorieselease-updates-notify-legacy`. Worth reading
  before extending the poller — and worth deciding whether any of it should be
  salvaged into this repo or deliberately abandoned.
- **Play Store or internal distribution?** Determines whether release signing and
  a privacy policy are near-term work.
