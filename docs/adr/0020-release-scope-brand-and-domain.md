# ADR-0020: Rename the product to Release Scope and adopt releasescope.com

- **Status:** Accepted
- **Date:** 2026-10-28
- **Supersedes:** — (the name "UpdateNotify" was never recorded in an ADR)

## Context

The product has been called "UpdateNotify" since the AI Studio prototype. Users see
that name, plus the leftover Google Cloud project id (`gen-lang-client-0099813375`)
on the sign-in screen. The owner now holds `releasescope.com` (DNS at Namecheap) and
wants the product renamed "Release Scope". Marketing and SEO pages are planned, so
the name has to be consistent across titles, metadata, structured data and the app.

## Decision

1. **Display name: "Release Scope"** (two words, both capitalised). Used in every
   sentence, page title, meta tag, OAuth consent screen, notification and store
   listing. Search engines and people read two words more easily than a fused one.
2. **Wordmark (logo lockup only): `Release` in regular weight + `Scope` in bold**,
   set on one baseline with a scope-reticle mark. The weight contrast carries the
   split, so the logo can be tight while the text name stays "Release Scope".
3. **Machine form: `releasescope`** (lower case, no space) for the domain, URLs,
   handles, file names and export names.
4. **Never** write "ReleaseScope", "Releasescope" or "Release-Scope" in user-facing
   text, and never "UpdateNotify" in anything a user can see.
5. **Tagline:** "See every release the moment it ships." Used in the landing hero,
   `<meta name="description">` and the Open Graph card.
6. **Code identifiers are not renamed in this change.** Kotlin packages
   (`com.updatenotify.*`), the Firestore database id `updatenotify`, the Cloud Run
   service names, the service-worker cache key and the GitHub repository name stay.
   Renaming them is expensive and invisible to users; the Android `applicationId`
   must not change once an app is published. A later ADR may revisit this.
7. **Single source in code:** `web/src/brand.ts` holds name, tagline, domain, support
   address placeholder and canonical origin. UI and metadata read from it.

## Alternatives considered

| Option | Why not |
|---|---|
| "ReleaseScope" in all text | Reads as a typo in prose; weaker in search snippets |
| "Releasescope" | Loses the word boundary entirely |
| Keep UpdateNotify, add a tagline | The owner wants the new name; domain already bought |
| Rename every code identifier now | High risk, no user benefit, breaks the Android id |

## Consequences

**Good:**
- One name everywhere a user or crawler looks; one file to change if it moves.
- The domain, brand and sign-in screen can all say the same thing.

**Bad — the price we are paying:**
- Code and docs still say "UpdateNotify" in places. A contributor can be confused;
  `docs/GLOSSARY.md` records the mapping.

**Revisit if:**
- The Android app is not yet published and a clean `applicationId` is wanted.
- A trademark check finds a conflict with "Release Scope".
