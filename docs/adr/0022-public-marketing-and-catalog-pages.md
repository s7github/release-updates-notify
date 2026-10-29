# ADR-0022: Serve public marketing pages from the web app, pre-rendered

- **Status:** Accepted
- **Date:** 2026-10-29
- **Supersedes:** ADR-0009 in part (the web app remains the operator surface; it also serves public pages)

## Context

Crawlers receive an empty `<div id="root">` today, and visitors cannot see what the
product does before signing in. `releasescope.com` needs pages that search engines
can read and people can share.

## Decision

Public pages (`/`, `/demo`, `/how-it-works`, `/pricing`, `/privacy`, `/terms`) are
pre-rendered to static HTML after `vite build` by `web/scripts/prerender.tsx`, which
also writes `sitemap.xml`. One registry (`web/src/seo/pages.ts`) feeds the router,
the prerender and the sitemap. Signed-in routes stay client-rendered. Per-product
public pages (`/software/:slug`) are a later phase and, when built, are indexable
only for products with real release notes.

## Alternatives considered

| Option | Why not |
|---|---|
| Migrate to Next.js | Large rewrite for six static pages |
| Separate marketing site | Second codebase and second deploy |
| Vercel prerender service | Cost, and a black box |

## Consequences

**Good:**
- Crawlers get real HTML, titles, canonical URLs and JSON-LD with no new framework.

**Bad — the price we are paying:**
- A prerender script to maintain; pages must not touch `window` or Firebase during
  render. Two kinds of route live in one app.

**Revisit if:**
- Page count or personalisation grows enough to justify a framework.
