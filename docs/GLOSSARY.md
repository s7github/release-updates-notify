# Glossary

Terms used across the code and docs. Where a word means something specific here,
that meaning is given rather than the general one.

---

## Domain

**Interest** — one person following one software item or one topic. Held in the
`interests` collection. Carries a `following` flag, so an interest can be
*tracked but silent*: in the library, no notifications. That is a distinct state
from not tracked at all.

**Topic** — a free-text interest ("macOS", "AI safety") with no catalog entry.
Treated identically to software in the library.

**Catalog entry / software** — a shared, global record of one tracked item and
where it publishes changes. Stored in `master_registry`. Shared across all users,
which is what makes polling `O(catalog)` rather than `O(users × catalog)`.

**Release / release note** — one structured version: version string, date,
category, Markdown summary. Stored in `release_notes` with a **deterministic
document id** derived from `softwareId` + normalised version.

**Category** — the closed enum users filter and mute on: New Features, Feature
Updates, Optimization/Tips, Bug Fixes, Security Patches, Major Milestone Update.
Plus `UNKNOWN`, which exists because extraction is non-deterministic.

**Genuine update** — a release whose extracted version differs from the catalog
entry's `lastVersion`. **Only genuine updates notify.** See *genuine-update
gate*.

**Genuine-update gate** — the check in the poller that decides whether to publish
to the notification stage. The single most important line in the pipeline:
without it, every scheduled poll notifies every user every time.

**Discovery / magic discovery** — asking the backend to find official sources for
something not in the catalog. Spends a Gemini call, so it is an explicit user
action rather than an automatic fallback.

**Source priority** — the ordered list of source types the poller tries
(`github`, `rss`, `changelog`, `html`). It **aggregates** everything that
responds rather than stopping at the first hit; more context yields better
extraction.

**Self-correction / learnings** — Gemini returning better source URLs than the
ones it was given. Applied to the catalog and logged in `system_learnings`, so
the registry improves as it runs.

**Watermark** — the timestamp the client's incremental sync resumes from. Without
it every launch re-reads every document, and Firestore bills per read.

---

## Architecture

**Fan-out** — resolving one event (a release) into many deliveries (a
notification per subscriber). Its own pipeline stage, so a slow send never blocks
a scrape.

**Poller / notifier / api** — the three Cloud Run services. Scrape and extract;
resolve subscribers and send; serve authenticated client requests.

**At-least-once** — Pub/Sub's delivery guarantee. A message can arrive twice, so
every consumer must be idempotent. This is why release document ids are derived
rather than generated.

**Idempotent** — safe to do twice. A repeat follow overwrites rather than
duplicating; a re-extracted release overwrites rather than adding a second card.

**Source of truth** — for the UI, **Room**. The UI observes the local database;
Firestore syncs into it. Not the other way round ([ADR-0005](adr/0005-offline-first-room-cache.md)).

**Read-mostly client** — the trust model. The app writes its own profile and its
own interests and nothing else ([ADR-0006](adr/0006-firestore-security-model.md)).

---

## Android

**AGP** — Android Gradle Plugin. Version 9 here, which changed enough to warrant
[ADR-0010](adr/0010-agp9-toolchain-and-ksp-flags.md).

**KSP** — Kotlin Symbol Processing. Generates Room and Hilt code. **Not
compatible with AGP 9's built-in Kotlin**, which is why two flags in
`gradle.properties` are load-bearing.

**Convention plugin** — shared Gradle configuration in `build-logic/`, applied by
id. Used instead of a root `subprojects {}` block, which breaks the configuration
cache.

**Version catalog** — `gradle/libs.versions.toml`. The only place a dependency
version is written.

**Hilt** — the DI framework. `@HiltViewModel`, `@Inject`, `@Binds`, modules
installed in `SingletonComponent`.

**Compose** — the UI toolkit. Declarative; a composable describes UI for a given
state and re-runs when it changes.

**StateFlow / `collectAsStateWithLifecycle`** — how a ViewModel exposes state and
how a composable observes it without collecting in the background.

**Notification channel** — the OS-level category users can mute independently of
the app. One per release category; the reason `minSdk` is 26.

**Doze / App Standby** — Android's power management, which makes background
network work unreliable by design. A large part of why polling is server-side.

**Credential Manager** — the current Google Sign-In API, replacing the deprecated
`GoogleSignInClient`. Needs the **web** OAuth client id, not the Android one.

**minSdk / targetSdk / compileSdk** — oldest supported (26), runtime behaviour
opted into (36), API level compiled against (37). Three different things that are
routinely confused.

---

## Process

**ADR** — Architecture Decision Record. One decision, its forces, its rejected
alternatives, and its cost. **Append-only** — a changed decision gets a new ADR
that supersedes the old.

**Dirty Dozen** — the twelve attack payloads from the original security spec,
now the deny half of the rules test suite.

**Load-bearing** — used here for configuration that looks removable and is not.
Specifically `android.builtInKotlin=false` and `android.newDsl=false`.
