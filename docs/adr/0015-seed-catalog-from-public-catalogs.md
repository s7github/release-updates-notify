# ADR-0015: Seed the catalog from public catalogs, inactive in the scheduler

- **Status:** Accepted
- **Date:** 2026-10-27
- **Supersedes:** — (builds on ADR-0014)

## Context

`master_registry` only grows when a user or admin discovers one product at a
time, each costing a Gemini search call. Public catalogs already list thousands
of products with homepages and GitHub repos: Homebrew formulae (~8.7k) and casks
(~7.8k), and endoflife.date (~490 products with the vendor's release-policy
page). They do not contain release notes, only where to find them.

Two existing behaviours constrain a bulk import:
- The web catalog search filters on `active == true`.
- The scheduler polls `active == true AND lastCheck < cutoff`; a null `lastCheck`
  does not match a range filter, so a never-polled entry is never auto-polled.

## Decision

`backend/scripts/seed-catalog.ts` (`pnpm run seed:catalog`) merges the catalogs
(endoflife, then casks, then formulae) by `slugify(name)`, first non-null wins,
and writes entries with `active: true`, `lastCheck: null`,
`sourcesVerified: false` and `seededFrom`. It is a **dry run** unless `--write`
is passed, uses `create()` so an existing entry is never overwritten, and skips
deprecated, disabled and version-pinned (`name@N`) packages.

## Alternatives considered

| Option | Why not |
|---|---|
| Seed with `active: false` | Entries would be invisible in catalog search. |
| Run Gemini discovery per product | ~15k search calls; the data is already public. |
| Seed with a `lastCheck` date | The scheduler would poll all ~15k on the next sweep. |

## Consequences

**Good:**
- ~15k findable products at zero model cost; ~9.6k arrive with a GitHub repo.

**Bad — the price we are paying:**
- Nothing triggers a first poll, so a followed seeded product shows no release
  until an admin polls it. "Scan all" is capped at 500 arbitrary active entries.
- Many Homebrew formulae are libraries or tools most users will never follow.
- Sources are unverified guesses until a poll succeeds.

**Revisit if:**
- A follow of a never-polled entry should enqueue its first poll (needs a
  Firestore trigger or an API call from the client).
