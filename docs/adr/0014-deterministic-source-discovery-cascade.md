# ADR-0014: Discover sources deterministically before asking the model

- **Status:** Accepted
- **Date:** 2026-10-27
- **Supersedes:** — (extends ADR-0003; does not change where discovery runs)

## Context

Discovery was one Gemini call with search grounding. It is the most expensive
and least repeatable step in the pipeline, and it only ever returned a GitHub
URL, a feed URL and a changelog URL — each often null. Many products publish
exact, machine-readable version data (npm, PyPI) or advertise a feed in their
homepage `<link rel="alternate">` tags, and none of that needs a model.

## Decision

`discoverAll()` (`backend/src/services/discovery.ts`) runs the model call first
as the base layer, then `enrichDiscovery()` fills only the **gaps**:

1. Feed autodiscovery: `<link rel="alternate">` on the homepage, then
   conventional feed paths. A candidate must look like RSS/Atom.
2. Changelog page probing: `/changelog`, `/releases`, `/release-notes`,
   `/whats-new`, `/updates`. A candidate must contain several version tokens.
3. Registry packages (npm, PyPI): the repository name is tried, and accepted
   **only if the registry entry declares the same repository** as `github_url`.
4. `suggested_priority` is rebuilt in exactness order:
   npm, pypi, github, rss, html.

The poller (`gatherSources`) reads `npm_package` / `pypi_package` and adds the
registry chunk even if the stored priority list predates it. Model-supplied
values are never overwritten.

Every probe fetch rejects non-public hosts (loopback, private ranges, link-local,
`.internal`) and re-checks each redirect hop, because the website is untrusted
model output used in a server-side request.

## Alternatives considered

| Option | Why not |
|---|---|
| Keep model-only discovery | Costly, non-deterministic, frequently leaves feeds null. |
| Accept a registry by name match alone | A same-named unrelated package would attach the wrong releases. |
| Add endoflife.date / App Store / Play sources now | Useful, but coverage unverified; left as follow-ups. |

## Consequences

**Good:**
- Fewer Gemini extraction calls for packaged products; exact versions and dates.
- Feeds and changelog URLs found without spending tokens.

**Bad — the price we are paying:**
- Up to ~11 extra outbound requests (8 s timeout each) per discovery, run
  sequentially. Acceptable for a rate-limited, user-initiated action.
- Two new optional fields on `master_registry`.
- Existing registry entries are only enriched on admin "re-discover".

**Revisit if:**
- Discovery latency becomes user-visible (parallelise the probes).
- Registry probing by repo name misses too many packages named differently.
