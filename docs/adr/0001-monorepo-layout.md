# ADR-0001: Monorepo over split repositories

- **Status:** Accepted
- **Date:** 2026-09-08

## Context

At the point of conversion the project was spread across three GitHub
repositories with near-identical names — `release-updates-notify`,
`release-update-notify`, and `release-updates-notify-old` — two of which were
empty and one of which held the entire codebase. Nobody could tell from the names
which was live.

The system now has four artefacts that must agree with each other: the Android
client, the backend pipeline, the Firestore rules, and the data schema. The
schema in particular is a contract between all four. If the client and the
pipeline disagree about the shape of a `release_notes` document, the app shows
blank cards and nothing errors.

A stated requirement is that any agent or editor, on any machine, can pick the
project up cold and find the current decisions and status.

## Decision

One repository, `s7github/release-updates-notify`, laid out as:

```
docs/  android/  backend/  firebase/  web/  .github/
```

Documentation lives at the root and covers the whole system. Schema changes,
rule changes, and the client code that depends on them land in the same commit.

## Alternatives considered

| Option | Why not |
|---|---|
| Separate repos per component | The schema contract spans them. Coordinated changes become multi-repo PR choreography, and the two halves drift within weeks — which is exactly what already happened here. |
| Android-only repo, leave web where it is | Guarantees the Firestore rules exist in two places and diverge. The rules are one file that both clients depend on. |
| A fourth new repository | Four repos with variations of one name. The naming confusion is already the problem; adding to it is not a fix. |

## Consequences

**Good:**
- One `git pull` gives an agent the entire system, including why it is that way.
- Schema, rules, and both clients change atomically.
- One CI configuration, one place to look when something is red.

**Bad — the price we are paying:**
- CI must path-filter, or every Android commit runs the backend tests.
- The Gradle root is `android/`, not the repo root. Android Studio must be
  pointed at the subdirectory. This surprises people once each.
- The repo carries toolchains for Kotlin, Node, and Firebase. A fresh clone is
  heavier than any single component needs.

**Revisit if:**
- The backend grows its own release cadence and deployment lifecycle genuinely
  independent of the client, or a second team owns it.
