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

## Data tiers: classify before you save
- Leak test: if this leaked, what is the worst that happens? Money or identity harm = tier 1. Harm to the business, a client or a brand = tier 2. Mildly embarrassing at most = tier 3.
- Tier 1 (finance, ID and tax papers, passwords, family details): never write it anywhere you can write. Not in repos, vault notes, memory, prompts, logs or chat. It lives in the owner's password manager and offline encrypted backup, and agents get no access.
- Tier 2 (decisions and reasons, client or customer material, unpublished pricing, strategy, raw research): only in private repos for what could be read if the repo leaked, otherwise only in untracked local folders plus a password-protected archive in the private repo. Never in a public place or a tool's cloud memory.
- Tier 3 (coding style, AI rules, tool preferences, generic guides): private repo, such as ai-vault.
- One store holds one tier. Never mix tiers in a repo; Git history is permanent. When unsure, treat the item as the higher tier and ask.
- Details: `Runbooks/Vault tiers.md` and `Runbooks/Vaults.md` in ai-vault.

## Keep it simple to use
- The owner does not want to remember commands or localhost ports. Make every tool and app reachable from one obvious place (a hub, launcher or start-menu/desktop shortcut) with a plain name, not a port number or a command.
- When you add or change an app, service or script, register it in the existing hub or launcher. Do not ship something that can only be reached by remembering `host:port` or a long command. If a command is unavoidable, wrap it in a one-word launcher or shortcut.
- Give every local service a fixed, recorded address in one registry file. Do not pick ad hoc ports.
- Prefer guided prompts (a wizard that asks questions) over flags the owner must recall.
- In replies, give a clickable link or the launcher's name, not "run X on port Y".

## Launchers (`launchers.json`)
- Every repo with something runnable (app, dev server, script, docker stack, CLI task) keeps a `launchers.json` at its root. The all-projects hub reads it to list and start the repo, per environment. Repos with nothing runnable (docs, notes) need none.
- When you add, rename or remove a way to run the repo, or change a port, update `launchers.json` in the same change. Never hardcode a port the file does not record.
- Format (version 1): `environments` maps `local`, `staging`, `prod` to `launchers[]` (`name`, `command`, `cwd` inside the repo, optional `port`, `portArg` such as `--port {port}`, `url`, `kind` `run` or `task`, `oneShot`) and `urls[]` (`label`, `url`, http or https only). Local launchers are run options, other environments are links or tasks.
- Apps must honour the `PORT` environment variable (or declare `portArg`) so all-projects can move them when two apps want the same port.
- A launcher that lives in another repo is declared with a relative path, for example `..\AI\launch\launch.cmd list`. Commands that need a slug or an interactive console are not declared.
- Full reference: `docs/LAUNCHERS.md` in the all-projects repo.

## Survive a PC loss
- The owner wants to lose nothing important if this PC dies, and to restore by click: install, configure, run. Never make this PC the only copy of anything that matters.
- When you create or change something durable (project, notes, config, app setup), say where its off-PC copy lives: a private repo, the password manager, or an encrypted archive committed to a private repo. If there is none, flag it and propose one. An offline-only copy is not enough.
- Record how to rebuild each app or service as a script or list (what to install, which repo to clone, which shortcut to create), not as steps the owner must remember.
- Tier rules still apply: tier 1 never goes into repos or places you can write.

## Remote and web sessions
- Cloud and remote agents cannot see this machine. They only get rules that are committed in the repo as `AGENTS.md` (with `CLAUDE.md` containing `@AGENTS.md`). Keep those files in every repo and never rely on the local vault there.
<!-- END ai-vault:repo-rules -->
