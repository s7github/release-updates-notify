# Data Model

**This document is normative.** The Firestore collections, the Room entities, the
Kotlin models, and the backend's writes all follow it. When code and this file
disagree, that is a bug — fix one of them in the same commit.

Nine collections. Firestore is schemaless, which means the schema lives here or
it lives nowhere.

**Conventions**
- `snake_case` field names in `master_registry` are inherited from the original
  AI Studio app. They are kept deliberately: renaming them would require a data
  migration for no functional gain. Everywhere else is `camelCase`. Kotlin models
  use idiomatic `camelCase` and map at the boundary.
- Timestamps are **ISO-8601 UTC strings**, not Firestore `Timestamp` objects,
  except where noted. Also inherited, also kept for compatibility with existing
  documents.
- `W` = the client may write it. Unmarked fields are backend-only.

---

## 1. `users/{uid}`

One document per account, keyed by Firebase Auth UID.

| Field | Type | W | Notes |
|---|---|:--:|---|
| `uid` | string | | Must equal the document ID and `request.auth.uid` |
| `email` | string | | From the auth provider. Max 256 chars |
| `displayName` | string? | ✓ | |
| `photoURL` | string? | ✓ | |
| `createdAt` | ISO string | | Set once on first sign-in |
| `settings` | map | ✓ | See below |
| `fcmTokens` | string[] | ✓ | Device push tokens. Client appends; `notifier` prunes dead ones |

### `settings`

| Field | Type | Default | Effect |
|---|---|---|---|
| `notifyFeatures` | bool | `true` | "New Features", "Feature Updates" |
| `notifySecurity` | bool | `true` | "Security Patches" |
| `notifyFixes` | bool | `true` | "Bug Fixes" |
| `notifyOptimizations` | bool | `true` | "Optimization/Tips" |

The `notifier` reads these **before sending**. A muted category never reaches the
device — it does not arrive and get suppressed locally.
"Major Milestone Update" is always sent and has no toggle, by design.

**Client writes are restricted to `displayName`, `photoURL`, `settings`, and
`fcmTokens`.** The rules enforce this with `hasOnly()` on the update diff, which
is what blocks the privilege-escalation payload (`{ role: 'admin' }`) and the
shadow-field payload from `security-spec-original.md`.

---

## 2. `interests/{interestId}`

A user following one software item **or** one free-text topic. The join table
between users and the catalog.

| Field | Type | W | Notes |
|---|---|:--:|---|
| `userId` | string | ✓ | Must equal `request.auth.uid` |
| `softwareId` | string? | ✓ | Set when `type == "software"`, else `null` |
| `topic` | string? | ✓ | Set when `type == "topic"`, else `null`. Max 200 chars |
| `softwareName` | string | ✓ | Denormalised for list rendering without a join |
| `type` | `"software"` \| `"topic"` | ✓ | |
| `following` | bool | ✓ | `true` = notify. `false` = tracked but silent |
| `createdAt` | ISO string | ✓ | |

**Invariant:** exactly one of `softwareId` / `topic` is non-null, matching `type`.

> ### Change from the original: deterministic document IDs
>
> The web app uses `addDoc()`, generating a random ID. Nothing stops the same
> user following the same software twice, and duplicates mean duplicate
> notifications — the exact failure [ADR-0008](adr/0008-fcm-notification-fanout.md)
> exists to prevent.
>
> **New documents use `{userId}_{softwareId}` or `{userId}_topic_{slug(topic)}`
> as the ID**, making a duplicate follow an idempotent overwrite. Existing
> random-ID documents keep working; a de-duplication pass is tracked in
> [`STATUS.md`](STATUS.md).

**Required index:** `softwareId ASC` — the `notifier` queries by it on every
release. Without it, fan-out is a collection scan.

---

## 3. `master_registry/{softwareId}`

The global catalog. One document per tracked software item, shared by all users.
Document ID is a URL-safe slug (`fl-studio`, `suno`, `macos`).

| Field | Type | Notes |
|---|---|---|
| `name` | string | Display name |
| `slug` | string | Equals the document ID |
| `type` | `"software"` \| `"topic"` | |
| `vendor` | string? | Publisher |
| `website` | string? | Official homepage |
| `icon_url` | string? | Logo. Often `https://logo.clearbit.com/{domain}` |
| `active` | bool | `false` excludes it from scheduled polling |
| **Sources** | | |
| `github_url` | string? | Repo URL; the poller derives the Releases API path |
| `rss_url` | string? | Feed URL |
| `changelog_url` | string? | Changelog / release-notes page |
| `suggested_priority` | string[]? | AI-proposed source order |
| `priority_order` | string? | Admin override, comma-separated. **Wins over `suggested_priority`** |
| **Poll state** | | |
| `lastVersion` | string? | Last published version. **The genuine-update gate compares against this** |
| `lastReleaseDate` | ISO string? | |
| `lastCheck` | ISO string? | Last poll attempt, successful or not |
| **History scrape settings** | | |
| `historyMaxCount` | int? | Cap on historical records to ingest |
| `historyMinDate` | ISO string? | Ignore releases before this |

### Source resolution order

```
priority_order (admin override)  →  suggested_priority (AI)  →  ["github", "rss", "html"]
```

The poller walks the resolved list and **aggregates every source that responds**
rather than stopping at the first hit. More context yields better extraction.
Recognised values: `github`, `rss`, `changelog`, `html`.

**Client access: read-only.** See [ADR-0006](adr/0006-firestore-security-model.md).
New entries are created by the `api` service during discovery.

---

## 4. `release_notes/{noteId}`

One structured release. The primary content of the app.

**Document ID is deterministic:** `{softwareId}-{version with non-alphanumerics
replaced by '-'}` — e.g. `fl-studio-24-1-1`.

This is load-bearing. Pub/Sub is at-least-once
([ADR-0004](adr/0004-cloud-run-pubsub-pipeline.md)) and Gemini is
non-deterministic, so the same release *will* be extracted more than once. A
derived ID makes re-extraction an idempotent overwrite instead of a duplicate
card in the feed.

| Field | Type | Notes |
|---|---|---|
| `softwareId` | string | → `master_registry` |
| `softwareName` | string | Denormalised for feed rendering |
| `version` | string | **Technical version only.** Never a bare date |
| `releaseDate` | ISO string? | |
| `category` | enum | See below |
| `summary` | string | Markdown |
| `isGenuineUpdate` | bool | `false` means extracted but not notification-worthy |
| `createdAt` | ISO string | When this row was written |
| `rawData` | string? | First 5 KB of source text. Debugging only — never shown |

### `category` — closed enum

| Value | Gated by |
|---|---|
| `New Features` | `settings.notifyFeatures` |
| `Feature Updates` | `settings.notifyFeatures` |
| `Optimization/Tips` | `settings.notifyOptimizations` |
| `Bug Fixes` | `settings.notifyFixes` |
| `Security Patches` | `settings.notifySecurity` |
| `Major Milestone Update` | *always sent* |

Any other value is an extraction failure. The client must render an unknown
category rather than crash — treat it as `Feature Updates` and log.

**Version extraction rules** (enforced in the Gemini prompt, re-validated in the
poller before writing):
- Extract `25.2.5` from `25.2.5 (2026/03/09)` — never the date.
- A bare date string is never a version.
- Content packs, sound packs, and plugins are not versions.
- On source disagreement: highest version, most recent date.

**Client access: read-only.**

---

## 5. `background_tasks/{taskId}`

Progress for a long-running pipeline job, so the UI can show real progress rather
than an indeterminate spinner.

| Field | Type | Notes |
|---|---|---|
| `type` | `initial_poll` \| `history_scrape` \| `metadata_enrichment` | |
| `status` | `pending` \| `processing` \| `completed` \| `failed` | |
| `softwareId` | string | |
| `softwareName` | string | |
| `progress` | int | 0–100 |
| `message` | string | Human-readable current step |
| `error` | string? | Set when `status == "failed"` |
| `createdAt` / `updatedAt` | Firestore `Timestamp` | **Not ISO strings here** — inherited inconsistency |
| `details` | map? | `sourceUrl`, `currentAction`, `foundCount`, `completedCount`, `samples[]`, `activePriority[]`, `settings{maxCount,minDate}` |
| `requestedBy` | string? | **New.** UID that enqueued it, so a user can watch their own task |

**Client access: read own tasks only; no writes.** The web app wrote these
directly; that grant is removed. Tasks are created by the `api` service on
enqueue. See [ADR-0006](adr/0006-firestore-security-model.md).

---

## 6. `system_learnings/{learningId}`

Audit log of the pipeline correcting its own catalog metadata. Gemini returns a
`metadataLearnings` object suggesting better source URLs than the ones it was
given; applying those is what makes the registry improve as it runs.

| Field | Type | Notes |
|---|---|---|
| `type` | `source_correction` \| `metadata_improvement` \| `pattern_recognition` \| `error_fix` | |
| `softwareId` / `softwareName` | string? | |
| `description` | string | |
| `previousValue` / `newValue` | string? | JSON blobs |
| `impact` | string | |
| `confidence` | float | 0.0–1.0 |
| `applied` | bool | Whether the change was written to `master_registry` |
| `createdAt` | ISO string | |

**Admin read only. No client writes.**

---

## 7. `admins/{uid}`

Membership by document existence. Presence of `admins/{uid}` means admin.

| Field | Type |
|---|---|
| `email` | string |
| `seededAt` | ISO string |

**Read: any signed-in user** (so a client can resolve its own role).
**Write: none from any client** — Admin SDK only.

> The inherited rules hardcoded an admin email address inside
> `firestore.rules`. That is removed. Bootstrapping the first admin is a
> deliberate documented operation — see [`SECURITY.md`](SECURITY.md).

---

## 8. `user_subscriptions/{subId}`

Present in the inherited rules. **No writer and no reader exists in the
codebase.** It appears to predate `interests` taking over the same job.

**Status: deprecated.** Not implemented in the Android client. Slated for removal
once production data is confirmed empty — tracked in [`STATUS.md`](STATUS.md).
Documented here so the next person does not mistake it for a live collection.

---

## 9. Required indexes

Defined in `firebase/firestore.indexes.json`. Firestore will happily run without
them until the collection grows, then fail — so they are declared, not discovered.

| Collection | Fields | Used by |
|---|---|---|
| `interests` | `userId ASC`, `createdAt DESC` | Library list |
| `interests` | `softwareId ASC` | **Notification fan-out — the hot path** |
| `release_notes` | `softwareId ASC`, `releaseDate DESC` | Version timeline |
| `release_notes` | `createdAt DESC` | Sync watermark |
| `background_tasks` | `requestedBy ASC`, `createdAt DESC` | User's own task progress |
| `master_registry` | `active ASC`, `lastCheck ASC` | Scheduler picking what is due |

---

## 10. Firestore → Room

The Android client mirrors these into Room, which is what the UI actually reads
([ADR-0005](adr/0005-offline-first-room-cache.md)).

| Firestore | Room entity | Sync |
|---|---|---|
| `users/{uid}` | `UserEntity` | Own document listener |
| `interests` | `InterestEntity` | `userId ==` listener |
| `master_registry` | `SoftwareEntity` | Only entries the user follows |
| `release_notes` | `ReleaseEntity` | Incremental by `createdAt` watermark |
| `background_tasks` | *not cached* | Live listener while a task screen is open |

The feed — "all releases for everything I follow, newest first" — is a Room join
across `InterestEntity`, `SoftwareEntity`, and `ReleaseEntity`, paged with
Paging 3. Firestore cannot express that query at all; this is the concrete reason
Room exists here rather than raw snapshot listeners.

**Two schemas mean two places to change.** A field added to Firestore and
forgotten in Room is silently dropped with no error. Mappers live in one file per
entity so the pair is always visible together.
