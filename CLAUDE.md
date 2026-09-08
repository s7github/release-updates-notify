# UpdateNotify — Agent Operating Manual

> **You are an AI agent working on this repository.** Read this file first, in full,
> before touching code. It is the map. Everything else is reachable from here.

---

## 1. Read this before your first edit

| Question you have | File that answers it | Read when |
|---|---|---|
| What is this product? | [`docs/PRODUCT.md`](docs/PRODUCT.md) | Always |
| How is it built? What talks to what? | [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Always |
| **Why** was it built this way? | [`docs/adr/`](docs/adr/) | Before changing any structural thing |
| What is done / in progress / next? | [`docs/STATUS.md`](docs/STATUS.md) | Always — **and update it before you finish** |
| What do the database records look like? | [`docs/DATA_MODEL.md`](docs/DATA_MODEL.md) | Before any data-layer work |
| How do I name things / lay out code? | [`docs/CONVENTIONS.md`](docs/CONVENTIONS.md) | Before writing code |
| How do I get this running? | [`docs/SETUP.md`](docs/SETUP.md) | First time on a machine |
| What must never leak? | [`docs/SECURITY.md`](docs/SECURITY.md) | Before touching auth, rules, or keys |
| What does this word mean? | [`docs/GLOSSARY.md`](docs/GLOSSARY.md) | When a term is unfamiliar |

**Minimum viable context** if you are in a hurry: this file + `docs/STATUS.md` +
`docs/ARCHITECTURE.md`. That is roughly 10 minutes of reading and it will stop you
from making the three mistakes listed in §5.

---

## 2. What this repository is

**UpdateNotify** tracks software releases. A user follows things they care about
("Suno", "macOS", "FL Studio"). A server-side pipeline discovers where each thing
publishes its changelog, scrapes it, uses Gemini to turn raw HTML/RSS/JSON into
structured release notes, and pushes a notification when something genuinely new
ships.

It began as a React PWA generated in Google AI Studio. It is being converted into
a **native Android app** with a **server-side processing pipeline**. Both halves
live in this monorepo.

### Layout

```
release-updates-notify/
├── CLAUDE.md            ← you are here
├── AGENTS.md            ← same content, for non-Claude agents
├── docs/                ← all decisions, status, specs. THE source of truth.
│   └── adr/             ← numbered, immutable architecture decision records
├── android/             ← the native Android app (Kotlin + Compose). Gradle root.
├── backend/             ← Cloud Run services: scraping, AI extraction, push fan-out
├── firebase/            ← Firestore rules, indexes, project config
├── web/                 ← the original React PWA. Retained as the admin surface.
└── .github/workflows/   ← CI. If it does not pass here, it is not done.
```

**Open `android/` in Android Studio, not the repo root.** The Gradle root is
`android/settings.gradle.kts`. This is normal for a monorepo.

---

## 3. The one architectural rule

> **The Android client never calls Gemini, never scrapes a website, and never
> writes to `master_registry`, `release_notes`, or `background_tasks`.**

The client reads Firestore, writes its own `users/{uid}` document and its own
`interests`, and receives FCM pushes. That is the whole surface.

Everything else — the API key, the scraping, the AI extraction, the scheduling,
the notification fan-out — is server-side in `backend/`. An APK is a zip file that
anyone can unzip; a key shipped inside one is a key you have given away. See
[ADR-0003](docs/adr/0003-server-side-ai-and-polling.md).

If you find yourself adding an AI SDK or an HTML parser to an Android module,
stop. You are solving the problem in the wrong process.

---

## 4. Working agreement

### Before you start
1. `git pull` and read `docs/STATUS.md`. Someone (or some agent) may have moved
   since your context was built.
2. Work on a branch. Never commit directly to `main`.

### While you work
3. Follow `docs/CONVENTIONS.md`. Match the surrounding code; do not import a new
   style.
4. Do not add a dependency without recording why in an ADR or in the PR body.
   Every dependency is a permanent liability.

### Before you finish — this is the part that keeps the repo usable
5. **Update `docs/STATUS.md`.** Move what you did into "Done", add what you
   discovered to "Next". A stale STATUS.md is worse than no STATUS.md, because
   the next agent will trust it.
6. **If you made a structural decision, write an ADR.** New module, swapped
   library, changed data flow, altered a schema — that is an ADR. Copy
   `docs/adr/TEMPLATE.md`, take the next number, never edit an existing one
   (supersede it instead).
7. **If you changed the data shape, update `docs/DATA_MODEL.md`** in the same
   commit. The schema doc and the code drift apart the moment you allow it once.
8. Run the checks in §6. Push only when they pass.

### Commit messages
Conventional Commits, scoped by area:
```
feat(android): add release timeline paging
fix(backend): handle malformed RSS entity escapes
docs(adr): record Cloud Run over Cloud Functions decision
chore(ci): pin build-tools to 36.0.0
```

---

## 5. The three mistakes agents make in this repo

1. **Putting the Gemini key or a scraper in the Android app** because the web app
   did it that way. The web app was wrong; it got away with it because AI Studio
   injected the key at runtime. See §3.
2. **Assuming the app polls.** It does not. The server polls on a schedule and
   pushes. A "Refresh" in the app enqueues a job; it does not do the work. If you
   are writing a `WorkManager` job that fetches changelogs, re-read
   [ADR-0003](docs/adr/0003-server-side-ai-and-polling.md).
3. **Editing `docs/adr/` files that already exist.** ADRs are an append-only log.
   A decision that changed gets a *new* ADR that says "Supersedes ADR-000X". The
   history is the value.

---

## 6. Verify before you push

```bash
# Android — from repo root
cd android && ./gradlew assembleDebug lintDebug testDebugUnitTest

# Backend
cd backend && npm ci && npm run lint && npm test

# Firestore rules
cd firebase && npm run test:rules
```

CI runs the same commands in `.github/workflows/`. Local green and CI red means
your machine is lying to you — trust CI.

---

## 7. Environment notes

- **JDK 17+** required (project targets 17; JDK 21 works).
- `android/local.properties` holds `sdk.dir`. It is gitignored and machine-local.
  Create it, or set `ANDROID_HOME`.
- **No secrets in this repo.** `google-services.json` and any service-account key
  are gitignored. `docs/SETUP.md` says how to obtain them.
- The Firebase *web* API key in `web/firebase-applet-config.json` is not a secret
  (it identifies the project; Firestore rules do the protecting) — but the
  **Gemini** key absolutely is. Never let one near the client.

---

## 8. Current state, honestly

This is a conversion in progress, not a finished app. `docs/STATUS.md` is the
authoritative answer and is kept current. As of the last update, the Android
client scaffolding and data layer exist; the backend pipeline is scaffolded but
not deployed. Do not assume a feature works because a screen for it exists.
