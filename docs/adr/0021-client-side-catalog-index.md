# ADR-0021: Search suggestions run locally over a downloaded catalog index

- **Status:** Accepted
- **Date:** 2026-10-29
- **Supersedes:** — (extends ADR-0016's search; does not replace it)

## Context

Firestore has no fuzzy matching, and a query per keystroke against ~15k
`master_registry` documents is a read-cost risk (ADR-0015/0016 treat reads as a
budget). Users also mistype names ("figam", "flstudio").

## Decision

The `api` service serves a compact index (`GET /v1/catalog-index.json`: `id`, `name`,
`key`, `slug`, optional `vendor`) built from `master_registry` (inactive and nameless
entries dropped). The browser downloads it once, mirrors it in `localStorage`
(`rs.catalogIndex.v1`) and matches locally with prefix, whole-word and edit-distance
rules (`web/src/services/suggest.ts`). Pressing Enter on free text still runs the
Firestore prefix search from ADR-0016, so entries newer than the index are found.
The index is rebuilt in memory at most once per instance per six hours and sent with
`Cache-Control: public, max-age=3600`.

`slug` is computed in `backend/src/lib/catalogIndex.ts`: kebab-case of the name, with
the first six id characters appended on collision. Docs are sorted by id first, so
the result does not depend on Firestore's return order. Batch 3's product pages will
reuse it.

## Alternatives considered

| Option | Why not |
|---|---|
| Algolia / Typesense | New vendor and monthly cost for a catalog this small |
| Firestore only | No typo tolerance; reads on every keystroke |
| Static file in a Cloud Storage bucket, written by a scheduled job | Needs a new bucket and public ACL; the owner has not approved one. Easy to move to later because the client only needs a URL (`VITE_CATALOG_INDEX_URL`) |

## Consequences

**Good:**
- Typing costs zero Firestore reads; typos are tolerated.

**Bad — the price we are paying:**
- A cold `api` instance reads the whole registry (~15k reads, names only) once per
  six hours per instance. Slugs are not persisted, so a renamed product's slug can
  change.
- The index is downloaded by every visitor who opens the search (size not yet
  measured against the live catalog).

**Revisit if:**
- The index passes about 1 MB gzipped, or cold-build reads show up in the bill:
  move to a scheduled job writing a Cloud Storage object, and persist `slug` on the
  registry document.
