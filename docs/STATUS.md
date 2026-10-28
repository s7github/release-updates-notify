# Project Status

**Last updated:** 2026-10-28
**Updated by:** the subscription/admin/real-time pass

> **If you are an agent or a person picking this up cold, this is the file that
> tells you where things actually stand.** Read it before planning anything, and
> **update it before you finish.** A stale STATUS.md is worse than none, because
> the next person will trust it.
>
> Keep the honesty. "Scaffolded but never run against a real project" is a useful
> sentence; "done" would not be.

---

## 1. One-paragraph summary

The repository contains a native Android client (Kotlin + Compose), a web
operator console (React), three backend services (poller, notifier, api), and
hardened Firestore rules. All of it builds and its tests pass locally.

**The release pipeline is still not deployed to Cloud Run / Pub/Sub, and the app
has never run on a device.** The web app and the `api` service are deployed on
Vercel; the deployed builds predate the changes in this working tree. Until the
poller and notifier run somewhere with a service account and a scheduler,
nothing writes `release_notes` on a schedule, so the dashboard has only whatever
data already exists in Firestore.

This pass made subscription tiers real on the read path, moved every privileged
console write into an authenticated admin API, added an audit log, made the feed
listen to the user's own library instead of a global 200-row slice, and removed
the browser's Gemini client and open proxy. Details below.

---

## 2. What changed in this pass (2026-10-27)

### 2.0 Gemini default model was retired

- Admin "Add software" reported "source discovery failed" for every item. Cloud
  Run logs showed Gemini returning 404: `gemini-2.0-flash` is no longer
  available. The default in `backend/src/lib/config.ts` is now `gemini-3.8-flash`
  (override with `GEMINI_MODEL`). Needs a redeploy to take effect; search-grounded
  discovery on the new model is not yet confirmed live. Software already added
  without sources needs "re-discover" (or re-adding) after the redeploy.

### 2.0b Deterministic source discovery (ADR-0014)

- New `backend/src/services/discovery.ts` + `registries.ts`. Discovery now runs
  the Gemini call, then fills gaps: homepage feed autodiscovery, changelog-page
  probing, and npm/PyPI packages verified against the repo URL. Probes block
  non-public hosts and unsafe redirects.
- `gatherSources` fetches npm/PyPI as exact JSON sources. `master_registry`
  gains `npm_package` / `pypi_package` (see DATA_MODEL).
- Verified: lint, build, 76 tests pass; live probes resolved express (npm),
  requests (PyPI), nodejs.org feed, obsidian.md changelog. **Not verified:**
  end-to-end on Cloud Run, and the Gemini step itself (see 2.0).
- Next: parallelise probes; add endoflife.date and App Store sources; re-run
  "re-discover" on existing registry entries after deploy.

### 2.0c Catalog seed script (ADR-0015)

- `pnpm run seed:catalog` merges Homebrew formulae + casks and endoflife.date into
  ~15k `master_registry` entries (~9.6k with a GitHub repo). Dry run by default;
  `--write` imports, never overwrites. Dry run verified live; **`--write` has not
  been run** (needs credentials for the `updatenotify` database).
- Seeded entries are searchable but never auto-polled (null `lastCheck`), so a
  followed seeded product has no release until polled. Open: trigger a first
  poll on follow.

### 2.0e Cost gates and catalog search (ADR-0016)

- **Search fixed.** Seeding 15k entries broke the web search (it scanned only the
  first 200 ids). Entries now carry `searchKey` / `searchTokens` (backfilled for all
  15,102), and `web/src/services/catalogSearch.ts` does a prefix query plus a
  whole-word query. Android already searched by name prefix.
- **Polls are gated.** `lastSourceHash` skips the model when sources are unchanged;
  the sweep and "Scan all" poll only followed products; scheduled polls make one
  extraction and never use paid web search; the duplicate extraction strategy is
  gone; a quota 429 trips `system_state/gemini` and polls, sweeps and
  `/v1/discover` pause instead of retrying.
- Verified: lint, 102 tests, and a live scheduled poll of an unchanged product that
  finished in 236 ms with no model call. **Not deployed:** the cloud services still
  run the previous image, so none of the gates apply in production until a redeploy.
- Not done (live infra, needs approval): `api` `minScale` 1 to 0, poller
  `max-instances`/`concurrency`, Pub/Sub retry backoff, budget alerts. Commands are
  in the session summary.

### 2.0g Ops hardening (ADR-0018)

- Adaptive poll cadence, GitHub ETag/304, sweep no longer paused by the AI quota,
  sweep heartbeat + `/healthz/pipeline`, stuck-task reaper, source-health flag,
  TTL `expiresAt` fields, index exemptions and a reaper index.
- Web: the admin registry grid now lists 100 entries live and searches the rest
  (it used to read all ~15k documents per page load); dashboard `in` chunks are 30.
  The header shows "Showing N of TOTAL" (one count read) and "Load 500 more" widens
  the live window. Search covers every entry but returns at most ~40 hits per query.
- `deploy-gcp.ps1`: api min 0, worker caps, 300 s ack deadline with backoff,
  dead-letter IAM + pull subscription, scheduler retries, optional GitHub token,
  PITR, daily backup, TTL policies, uptime check, optional budget.
- Deployed 2026-10-28: services, Pub/Sub, scheduler, Firestore indexes, PITR, a
  daily backup, TTL policies, an uptime check on `/healthz/pipeline` and an email
  alert are live. Services moved to `europe-west4` beside the database
  (ADR-0019); the `europe-west1` copies are deleted. Live sweep verified (200,
  heartbeat advances, `/healthz/pipeline` 200). GitHub ETag/304 verified against a
  real repo. Still missing: a `github-token` secret (needs the owner), and Gemini
  billing (the free tier allows 20 requests/day for the default model).

### 2.0f Version detection without the model (ADR-0017)

- `backend/src/lib/deterministic.ts` compares versions from GitHub, npm and PyPI
  JSON against `lastVersion`. `unchanged` ends the poll with no model call; `new`
  is built from the source and notified even when Gemini is blocked. The model now
  only polishes the summary (`AI_SUMMARIES=false` turns that off). RSS/HTML never
  decide a version.
- Verified: lint clean, full backend suite green with 16 new tests (version
  parsing, prerelease/draft handling, decision, classification, GitHub parsing).
  **Not verified:** a live poll against GitHub/npm; not deployed, so production
  still runs the old image.
- Next: ETag / `If-None-Match` on GitHub, adaptive poll cadence per product, and a
  `deterministic` strategy counter so the saving is measurable.

### 2.0d Music software seeded; release notes NOT yet

- **Project id correction:** the Firebase project displayed as "trend-equity" has
  id `gen-lang-client-0099813375`; no project has the id `trend-equity`. Use the id
  in `GOOGLE_CLOUD_PROJECT` / `--project`.
- The catalog seed was **written**: `master_registry` is now ~15.1k entries.
- `pnpm run seed:music` wrote 50 curated music entries (`tags: ["music"]`), 25 with
  a live-verified GitHub / feed / changelog source; the rest are website-only.
- **Release-note backfill is partial.** `GEMINI_MODEL=gemini-3.8-flash` is now set on
  the poller (revision 00004) and extraction works: Audacity saved 5 releases,
  Dexed 1. The rest hit the **Gemini free-tier daily quota**
  (`GenerateRequestsPerDayPerProjectPerModel-FreeTier`, resets ~11h later), so ~19
  queued jobs retry then dead-letter and their tasks stay `processing`. Five jobs
  (musescore, zynaddsubfx, cardinal, carla, juce) failed earlier with GitHub 403:
  the poller has no `GITHUB_TOKEN`. Re-run `pnpm run backfill:music` after the quota
  resets or billing is enabled; it skips entries that already have notes.

### 2.0e Admin fixes: registry search blank screen, refresh "source discovery failed"

- **Blank screen on search:** `RegistryManager` filtered with `row.vendor.toLowerCase()`;
  seeded entries have no vendor, so any 1-2 character query that missed the name
  threw during render and unmounted the tree. Filter and avatar are now null-safe.
- **"Source discovery failed":** Cloud Run `updatenotify-api` logs show Gemini
  **429 RESOURCE_EXHAUSTED** (free-tier quota) inside `discoverSources`; the whole
  refresh 502'd. New `rediscover()` (`services/discovery.ts`) falls back to
  deterministic probes seeded from the existing record when the model fails; the
  route returns a `warning` instead of an error and does not set
  `sourcesVerified`. The web toasts show the warning.
- The `api` revision (00003) also has no `GEMINI_MODEL`, so it still defaults to the
  retired model until redeployed. **Not deployed; fixes unverified live.**
  Real fix for the quota is enabling billing on the Gemini key.

### 2.1 Subscription entitlements are now enforced

- Added `backend/src/lib/entitlements.ts` (authoritative) and
  `web/src/services/entitlements.ts` (mirror for UI/query shaping). Numbers and
  the reasoning are in [ADR-0012](adr/0012-subscription-entitlements-and-admin-api.md).
- **FREE:** 5 tracked items, 30-day visible history, latest 5 timeline rows, no
  export, no history backfill, 5 discovery / 10 refresh per hour.
- **PRO:** unlimited tracking and history, 500 timeline rows, export, backfill,
  25 discovery / 60 refresh per hour.
- **ENTERPRISE:** unlimited, 1,000 timeline rows, 100 discovery / 300 refresh per
  hour.
- Expired paid tiers behave as FREE. A missing `subscriptionExpiresAt` means no
  expiry; an unparseable one fails closed.
- `/v1/refresh` now returns `403 UPGRADE_REQUIRED` for `includeHistory` when the
  caller lacks backfill. `/v1/me` returns the caller's effective tier and limits.
- The web dashboard clamps its window to the tier; the software timeline query
  is `limit(tier.timelineItems)`; export is gated; the free follow cap is shown
  and blocked in the add flow and the topic form.
- **Android now mirrors the same rules:** `SubscriptionTier` exposes the limits,
  `InterestRepositoryImpl` refuses a sixth item on FREE, and
  `SoftwareDetailViewModel` trims the timeline to the tier and tells the user
  why. `DashboardScreen`'s copy was corrected — it previously promised things
  the product does not do ("3 tracked updates per day", admin dashboard on
  Enterprise).
- **Not hard-enforced:** the 5-item follow cap. Interests are still written
  directly by the client, as ADR-0006 allows, so a modified client can create
  more. Visible data and paid API operations are server-enforced. This is in
  `SECURITY.md` §6 as a known gap, not a hidden one.

### 2.2 The admin console writes through the API

- Added `backend/src/routes/admin.ts`, mounted at `/v1/admin/*` behind
  `requireAuth` + `requireAdmin`. It owns registry create/edit/delete, source
  re-discovery, poll enqueue, poll-all, release verify/edit/delete/bulk-delete,
  task deletion, tier/expiry changes, admin grant/revoke, and an overview count.
- Catalogue deletion requires `confirmName` to match exactly; releases and
  interests are deleted in bounded batches; `lastVersion` is recomputed from the
  newest surviving note.
- Unknown fields are rejected, not dropped (`backend/src/lib/adminValidation.ts`,
  23 unit tests).
- Every mutation writes `admin_audit/{id}` with the verified UID, token email,
  action, target and before/after values. Admins read it; no client writes it.
- Rewired the web console: `RegistryManager`, `SoftwareDetails`,
  `ScrapeHistoryView`, `Processing`, `LearningInsights`, and `AddSoftware` no
  longer write privileged collections or call Gemini. `UserInsights` is now
  **Users & Plans**: live accounts, tier/expiry editing, admin grant/revoke.
  Added an **Audit Log** tab.
- Removed the hardcoded personal-email admin bootstrap from `App.tsx`.
  `isAdmin` is now a live `onSnapshot` on `admins/{uid}`.
- The old admin "full sync" was a client discovery + client poll. It is now
  `discoverRegistry` followed by `pollRegistry` on the API; "scan all" is one
  server-side endpoint.
- The old browser `@google/genai` client, `pollService`, `taskService`, and the
  unauthenticated `/api/proxy` handler are now tombstones/removed code. The
  web bundle no longer gets a `GEMINI_API_KEY` define. Dependencies
  `@google/genai`, `axios`, `cheerio`, `rss-parser`, `firebase-admin` and
  `dotenv` were removed from `web/package.json`.

### 2.3 The feed is real-time and scoped to the user

- The dashboard used to listen to the 200 newest release notes in the entire
  database, then filter them in memory. A busy catalog could push a user's own
  releases out of the window. It now subscribes per `softwareId` chunk (10 at a
  time), merges and de-duplicates, and shows a LIVE/CACHED/IDLE chip based on
  snapshot `fromCache` metadata.
- One card per product on the dashboard; the full timeline stays on the detail
  page.
- Library export batches `where in` queries instead of silently exporting only
  the first 10 products.
- New follows and topics use deterministic ids, so following the same thing twice
  is an overwrite rather than a duplicate notification.
- Added a `LIVE` pill, plan label, last-updated time, and tier-aware empty states.

### 2.4 Login

- Google sign-in keeps the popup path and falls back to a full-page redirect when
  the popup is blocked or unsupported; `getRedirectResult` is completed on load.
- Sign-in failures now produce readable messages (`auth/unauthorized-domain`,
  network, too many requests) instead of an unhandled promise.
- Admin identity is never inferred from an email address. First-admin bootstrap is
  still the documented manual console step (`docs/SETUP.md` §7).

---

## 3. Verified working

Everything here was actually run on 2026-10-27, in this working tree.

| What | Evidence |
|---|---|
| Backend typecheck | `cd backend && pnpm run lint` clean |
| Backend unit tests | **63 tests, 0 failures** (19 suites), including 23 new admin-validation/entitlement tests |
| Backend build | `pnpm run build` → `dist/index.js` |
| Android assemble | `cd android && .\gradlew.bat assembleDebug` → debug APK |
| Android lint | `.\gradlew.bat lintDebug` clean |
| Android unit tests | **42 tests, 0 failures** across model/data/database/features |
| Web typecheck | `cd web && pnpm run lint` clean |
| Web production build | `pnpm run build` succeeds; route-level `React.lazy` splits the dense pages |
| Firestore rules | **36 tests, 0 failures** against the emulator on port 8090 |
| Admin API smoke test | Local `api` against Firestore + Auth emulators: `/v1/me` returned FREE; admin `PATCH /v1/admin/users/:uid` set PRO and `/v1/me` reflected it; a non-admin call to the same route returned **403**; registry PATCH and DELETE returned the expected counts; 3 `admin_audit` entries were written |
| Tier gate smoke test | FREE user `POST /v1/refresh {includeHistory:true}` returned **403**; `/v1/me` reported `historyDays: 30`, `maxTrackedItems: 5` |
| Live web host | `https://release-updates-psi.vercel.app/` returned the app HTML (landing page renders) |
| Live API host | `https://release-update-backend.vercel.app/healthz` → `{"status":"ok","service":"api"}` |

**Not verified:**

- The **deployed** web/API builds do not contain this pass. Nothing was committed
  or deployed. The live admin routes will 404 until `backend` is redeployed, and
  the new console will not be live until `web` is redeployed.
- No backend HTTP route is covered by the automated test suite. The smoke test
  above was manual; Firestore/Admin SDK interactions still need integration tests
  in CI.
- The Android tier gates compile and their entitlement tests pass, but the app
  has still never run on a device. Whether the note renders correctly in the
  Compose timeline is unverified.
- The pipeline still has not been deployed to Cloud Run, so no scheduled data is
  being produced.

---

## 4. Done before this pass (still true)

- Monorepo layout, `CLAUDE.md`/`AGENTS.md`, ADR-0001…0011, CI workflows.
- 15-module Android graph; compiles to a debug APK; lint clean; 34 unit tests.
- Room schema v2 with tier/expiry; Firestore mappers; offline-first repositories.
- Firestore rules: read-mostly client, default deny, 34→36 emulator cases.
- Backend: three services from one image, genuine-update gate, FCM fan-out,
  Pub/Sub OIDC verification, Firestore-backed per-user quotas.
- Web: landing, dashboard, library, software detail, processing, admin; Vercel
  deployment and SPA rewrite.

---

## 5. Not done — and what it blocks

### The release pipeline is still undeployed

The poller/notifier need a Google Cloud project with billing, Secret Manager, two
Pub/Sub topics (plus dead-letter), a Cloud Scheduler sweep, and a first deploy.
The code exists; none of it has run against a real project. Until then
`release_notes` is only as fresh as whatever is already in Firestore. The new
console can enqueue polls, but with the deployed API (which predates this pass)
the admin routes do not exist yet.

This is the single biggest gap against "data is live and real-time".

### Deployment state

- `web` and `release-update-backend` are Vercel projects. The API is running the
  pre-pass code. `VITE_API_URL` should be set on the web project to the API host;
  the code falls back to `https://release-update-backend.vercel.app`.
- Vercel Deployment Protection / Firebase Auth authorized domains were an open
  owner action in the previous status. The landing page is publicly reachable
  now; confirm the Vercel domain is in Firebase Auth's authorized domains before
  claiming sign-in is verified in production. It was not tested with a real
  Google account here.

### Admin/API follow-ups

- [x] `backend` and `web` deployed to Vercel from `main` (2026-10-27); re-run the
      admin smoke test against the live host.
- [x] `firestore.rules` and `firestore.indexes.json` deployed to
      the previous AI Studio project's `(default)` database, which the app does not
      use (the live app reads a named AI Studio database, so those rules never
      reached live data). `admin_audit` needs no composite index
      (single-field ordering is automatic).
- [ ] Add a TTL policy on `admin_audit.createdAt` if the log is expected to grow
      indefinitely.
- [ ] Add HTTP-level integration tests for `/v1/admin/*`; the manual smoke test
      covered the happy paths and the 403/403 gates.
- [ ] Add a drift test that compares the backend and web entitlement tables.

### Android follow-ups

- [ ] Run the app on an emulator/device; it has still never been launched.
- [ ] The tier gates are client-side as well as server-side; the Compose note on
      a truncated timeline has not been seen on a screen yet.
- [ ] No instrumented or Compose UI tests.
- [ ] `TaskRepositoryImpl.observeActiveTasks()` still returns an empty flow.
- [ ] No `google-services.json`, no release signing, no App Check.

### Product/data follow-ups

- [ ] History backfill is a paid operation server-side, but the Android client
      does not expose a backfill action yet.
- [ ] No billing. Tiers are assigned by an admin; there is no checkout. This is
      deliberate and stated on the landing page.
- [ ] Free follow cap is client-enforced (see §2.1).
- [ ] Source health: a source that yields nothing repeatedly still fails
      silently. `system_learnings` is an audit log, not a dead-source alarm.
- [ ] Gemini cost: cheap change detection (ETag/content hash) before spending an
      extraction call is still not implemented.
- [ ] Existing `interests` documents with random ids still need the one-off
      de-duplication pass.

---

## 6. Suggested order of work

1. **Deploy `backend`, `firebase` rules/indexes, then `web`** (in that order).
2. **Run the live admin smoke test**: sign in, open Users & Plans, change a tier,
   confirm the audit entry appears, then set it back.
3. **Deploy the poller/notifier** to Cloud Run with Pub/Sub + Scheduler, then
   discover one product and watch a release note arrive live.
4. Run the Android app on an emulator; fix what actually breaks.
5. Add Android instrumentation once the app has been run on a device; the tier
   gates exist but have only been unit-tested.

---

## 7. Open questions for a human

- **Firebase project: decided (ADR-0013).** Move to the shared `trend-equity`
  project (`gen-lang-client-0099813375`) using the named database `updatenotify`.
  The database, web app, rules, indexes and the three Cloud Run services
  (`api` public + token-checked, `poller`/`notifier` private, hourly Scheduler
  sweep) are live in `europe-west4` (moved from `europe-west1`, ADR-0019). The old
  AI Studio data was **not** migrated: the new database starts empty. API:
  `https://updatenotify-api-vwdnd6mwaq-ez.a.run.app`.
  Still unverified: a signed-in admin call, a real poll against Gemini, and the
  Vercel domain being in Firebase Auth's authorised domains.
- **Is the Vercel-hosted API the intended production host, or is Cloud Run?**
  ADR-0004 says Cloud Run for the pipeline. The `api` service is currently on
  Vercel, which is workable for HTTP but not for the Pub/Sub workers.
- **Is iOS wanted?** ADR-0002 says no; the domain layer is Android-free so KMP
  stays cheap.
- **Poll frequency and Gemini budget.** Still undecided; it is the main cost
  driver.
- **Billing provider.** Tiers are admin-assigned now. Stripe is the obvious
  candidate, but that is a product decision, not an agent one.
