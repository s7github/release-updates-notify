# ADR-0005: Room is the UI's single source of truth

- **Status:** Accepted
- **Date:** 2026-09-08

## Context

Firestore has its own offline persistence and can drive UI directly through
snapshot listeners. Using it that way is the path of least resistance and is what
the web app does.

But this app is read-heavy over data that changes slowly. A user opens it on a
commute to read release notes fetched hours ago. Release notes are immutable once
published — a version's changelog does not change. The natural access pattern is
"show me everything I follow, newest first, paged" across collections that
Firestore cannot join.

Firestore's own cache is also not free: it bills reads against the server when
listeners re-attach, and its query surface cannot express "releases for the 40
software items this user follows, merged and sorted by date" without either
fan-out reads or a denormalised feed collection.

## Decision

**Room is the single source of truth for everything the UI displays.** The UI
observes Room `Flow`s and nothing else. Firestore is a *synchronisation source*
that writes into Room.

```
Compose ← StateFlow ← ViewModel ← UseCase ← Repository
                                              ├── Room        ← the only read path
                                              └── Firestore   → writes into Room
```

Writes go the other way — straight to Firestore, with Firestore's offline queue
handling connectivity. Client writes are small and rare (follow, unfollow,
settings), so a bespoke outbox is unnecessary.

## Alternatives considered

| Option | Why not |
|---|---|
| Firestore listeners drive Compose directly | Simplest, and it makes the UI's correctness depend on network state. Every screen needs loading and error states for data the device already has. Cross-collection merge and sort has to happen in memory on every emission. |
| Firestore offline persistence only | Real, but opaque — no control over eviction, no SQL, no paging, and no way to express the joins this UI needs. |
| DataStore / files | No query capability. Fine for settings; useless for a feed. |
| Paging 3 straight from Firestore | Firestore paging is cursor-based and does not compose across collections. It also re-reads (and re-bills) on every process death. |

## Consequences

**Good:**
- The app opens to content instantly, offline, always. There is no spinner for
  data already on the device.
- Feed queries are SQL: join `interests`, `master_registry`, and `release_notes`,
  sort, page. One indexed query instead of an in-memory merge.
- Firestore reads — which are billed — drop sharply. Sync is incremental against
  a stored watermark, not a full re-read on every launch.
- The data layer is testable without Firebase. Room has an in-memory driver;
  Firestore does not.

**Bad — the price we are paying:**
- Two schemas to keep in step: the Firestore document shape and the Room entity.
  A field added in one and forgotten in the other is silently dropped. Mitigated
  by keeping mappers in one file per entity and by
  [`DATA_MODEL.md`](../DATA_MODEL.md) being the single specification both follow.
- Room migrations are now a real obligation. Every entity change needs a
  migration and a migration test.
- Data can be stale. Acceptable for release notes, which are immutable; the sync
  watermark bounds staleness for the feed.
- More code than binding a listener to a composable. This is the actual cost, and
  it is paid once.

**Revisit if:**
- The app becomes collaborative or real-time, where staleness is a correctness
  bug rather than a UX nuance.
