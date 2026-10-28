# ADR-0017: Detect new versions from structured sources, use the model only to summarise

- **Status:** Accepted
- **Date:** 2026-10-28
- **Supersedes:** — (refines ADR-0016; does not move any work off the server)

## Context

ADR-0016 gates a poll on a hash of the fetched text. That only helps when the text
is byte-identical. Volatile HTML defeats it, and for a GitHub, npm or PyPI product
the question "is there a new version?" never needed a model: the source states the
version as JSON. Every poll that got past the hash gate still paid for an
extraction, and a Gemini quota outage stopped notifications for products whose
version was sitting in plain sight.

At about four scheduled polls a day per followed product (6 h cutoff), model calls
were the only cost that scaled with polling frequency.

## Decision

1. **Structured sources carry releases.** `SourceChunk.releases` is filled for
   GitHub Releases (drafts dropped, prerelease flag kept), npm and PyPI.
2. **Compare, don't ask.** `decideFromStructured` (`lib/deterministic.ts`) takes
   the highest non-prerelease version across structured chunks and compares it with
   `lastVersion` using `isNewerThan`. Result is `none`, `unchanged` or `new`.
3. **`unchanged` ends the poll** with no model call (unless `force`).
4. **`new` is notified without the model.** The release is built from the source
   (version, date, notes, a keyword-based category). If `AI_SUMMARIES` is not
   `false` and notes exist, one small call rewrites the summary and category from
   that single release's notes. If the model is blocked or fails, the deterministic
   release is used. The quota circuit breaker no longer defers a structured `new`.
5. **`none` falls through** to the existing hash gate and extraction path.
6. **RSS and HTML never decide.** A feed title or a page can look like a version
   (`Top 10.5 tips`) and a false positive is a spurious notification to every
   follower.

## Alternatives considered

| Option | Why not |
|---|---|
| Let RSS titles decide too | Too easy to mistake a post for a release; false notifications are the costly failure. |
| Always run the model for the summary | Keeps the cost and keeps notifications hostage to quota. Made optional instead. |
| Conditional requests (ETag) first | Saves requests, not model calls; still worth doing, tracked in STATUS. |

## Consequences

**Good:**
- A poll of a GitHub/npm/PyPI product costs no model call unless a release is new,
  and then at most one short one. Notifications survive a Gemini outage.

**Bad — the price we are paying:**
- A website changelog that is ahead of GitHub is ignored on non-forced polls; use
  `force` or order sources so the right one is structured.
- Keyword categories are coarser than the model's. They are used only when the
  model is off or unavailable.
- Monorepo tags such as `pkg@1.2.3` yield `1.2.3`, so two packages in one repo
  would collide. Registry entries should point at a repo with one release stream.

**Revisit if:**
- Spurious "new" notifications appear from tags that are not product releases.
- Most followed products have no structured source (then the saving is small).
