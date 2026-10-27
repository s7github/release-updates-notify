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

<!-- BEGIN ai-vault:repo-rules (managed block, source: ai-vault Rules/AGENTS.md) -->
# Rules for AI agents

## Package manager
- Use pnpm for all JavaScript/TypeScript work: `pnpm install`, `pnpm add`, `pnpm run <script>`, `pnpm dlx`. Never run npm, npx or yarn, and never create `package-lock.json` or `yarn.lock`.
- If a project is locked to npm (has `package-lock.json`, no `pnpm-lock.yaml`), say so and ask before migrating. Do not mix package managers silently.
- New projects: set `"packageManager": "pnpm@<version>"` in package.json and a `preinstall` guard that rejects non-pnpm installs.

## Secrets and private data
- Secrets live in Doppler, one Doppler project per repo. Run things with `doppler run -- <command>`. Secrets never go in files, commits, notes, memory, logs, prompts or chat.
- Do not read or print `.env*`, key or certificate files, or tokens. Do not run `doppler secrets download`, `doppler secrets get`, `printenv`, `env` or `set`. If a value is needed, ask the user to run the command or use `doppler run`.
- Never put a token on a command line (`curl -H "Authorization: Bearer ..."`). It lands in shell history and in tool permission allowlists. Reference an env variable and run under `doppler run`.
- If a secret is exposed anywhere, stop and tell the user immediately so they can rotate it. Deleting it is not enough.
- Treat `.env.example` as the only committed env file. It lists names with empty or fake values.

## Git hygiene
- Commit identity is the GitHub noreply address, never a personal email. Check `git config user.email` before the first commit in a repo.
- Commits, messages, code, docs and issues must not contain: personal email, phone, home address, bank or tax identifiers (IBAN, KVK, BTW), customer or client data, secrets, or absolute paths that include the user's name.
- Stage files by name. Review `git diff --cached` before committing. Never `git add -f` around an ignore rule, never `--no-verify`.
- Commit or push only when the user asks.

## Remote and web sessions
- Cloud and remote agents cannot see this machine. They only get rules that are committed in the repo as `AGENTS.md` (with `CLAUDE.md` containing `@AGENTS.md`). Keep those files in every repo and never rely on the local vault there.
<!-- END ai-vault:repo-rules -->
