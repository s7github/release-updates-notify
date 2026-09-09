# AGENTS.md

Cross-agent entry point (Codex, Cursor, Copilot, Aider, Gemini CLI, Zed, Windsurf,
Devin, and anything else that reads this file by convention).

**The full operating manual is [`CLAUDE.md`](CLAUDE.md). Read it.** It is not
Claude-specific despite the name — that filename is just what one toolchain looks
for. This file exists so you find it too.

Everything below is a summary. When the summary and `CLAUDE.md` disagree,
`CLAUDE.md` wins.

---

## The 60-second version

**Product.** UpdateNotify tracks software releases. Users follow software or
topics; a server-side pipeline scrapes changelogs, uses Gemini to structure them,
and pushes a notification on a genuine new release.

**Repo.** Monorepo.

| Path | What |
|---|---|
| `docs/` | All decisions and status. **Source of truth.** |
| `docs/adr/` | Numbered, append-only architecture decision records |
| `android/` | Native Android app, Kotlin + Compose. **Gradle root — open this dir in the IDE, not the repo root.** |
| `backend/` | Cloud Run services: scraping, AI extraction, push fan-out |
| `firebase/` | Firestore rules and indexes |
| `web/` | Original React PWA, retained as the admin surface |

---

## Hard rules

1. **The Android client never calls Gemini and never scrapes.** No AI SDK, no
   HTML parser, no changelog fetching in any Android module. An APK is a zip;
   a key inside one is a key you have published. All of that lives in `backend/`.
   See `docs/adr/0003-server-side-ai-and-polling.md`.

2. **The client is read-mostly.** It writes only `users/{uid}` (its own) and its
   own `interests`. It never writes `master_registry`, `release_notes`, or
   `background_tasks`. Firestore rules enforce this — if a write is denied, the
   rule is right and your code is wrong.

3. **The app does not poll.** The server polls on a schedule and pushes via FCM.
   A "Refresh" in the UI enqueues a job. Do not write a `WorkManager` task that
   fetches changelogs.

4. **ADRs are append-only.** Never edit an existing one. A changed decision gets
   a new ADR that says "Supersedes ADR-000X".

5. **No secrets committed.** `google-services.json` and service-account keys are
   gitignored. See `docs/SETUP.md`.

---

## Before you finish

- Update `docs/STATUS.md` — what you did, what you found, what is next. The next
  agent starts cold and will trust it.
- Made a structural decision? Write an ADR from `docs/adr/TEMPLATE.md`.
- Changed a data shape? Update `docs/DATA_MODEL.md` in the same commit.

## Verify

```bash
cd android && ./gradlew assembleDebug lintDebug testDebugUnitTest
cd backend && pnpm install && pnpm run lint && pnpm test
cd firebase && pnpm run test:rules
```

Commits use Conventional Commits with an area scope: `feat(android):`,
`fix(backend):`, `docs(adr):`, `chore(ci):`.
