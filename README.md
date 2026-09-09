# UpdateNotify

**An intelligent software release tracker.** Follow the software and topics you
care about; a server-side pipeline reads their changelogs, uses Gemini to turn
raw HTML, RSS and JSON into structured release notes, and pushes a notification
only when something real ships in a category you asked about.

Originally a React PWA built in Google AI Studio, now being converted to a
**native Android app** with a server-side processing pipeline. Both live here.

---

## Where to start

| You are… | Read |
|---|---|
| **An AI agent** working on this repo | **[`CLAUDE.md`](CLAUDE.md)** — or [`AGENTS.md`](AGENTS.md) for non-Claude tools. Read it in full before editing. |
| New here and want the current state | [`docs/STATUS.md`](docs/STATUS.md) |
| Trying to get it running | [`docs/SETUP.md`](docs/SETUP.md) |
| Wondering *why* something is the way it is | [`docs/adr/`](docs/adr/) |
| Looking for the big picture | [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) |

---

## Layout

```
├── android/     native Android app (Kotlin + Compose) — Gradle root
├── backend/     Cloud Run services: scraping, AI extraction, push fan-out
├── firebase/    Firestore rules, indexes, and their tests
├── web/         the original React PWA, retained as the operator surface
└── docs/        architecture, data model, and the decision log
```

> **Open `android/` in Android Studio, not the repo root.** The Gradle root is
> `android/settings.gradle.kts`. Normal for a monorepo; surprises everyone once.

---

## Quick start

```bash
# Android — builds on a fresh clone with no secrets configured
cd android && ./gradlew assembleDebug

# Everything the CI gates on
cd android && ./gradlew assembleDebug lintDebug testDebugUnitTest test

# Firestore security rules (starts the emulator, runs 31 cases)
cd firebase && npm ci && npm run test:rules
```

Sign-in and real data need Firebase configuration — see
[`docs/SETUP.md`](docs/SETUP.md).

---

## Current state, honestly

The Android client, the backend pipeline and the Firestore rules all exist and
are verified: the app builds, lints and tests clean into a real debug APK; the
backend typechecks, passes its tests, builds and boots; the rules pass a 31-case
suite.

**Nothing has been deployed, and the app has never run on a device.** The
pipeline needs a Google Cloud project, a secret, Pub/Sub topics and a scheduler —
infrastructure, not code. Until then the dashboard is empty.
[`docs/STATUS.md`](docs/STATUS.md) is the authoritative and deliberately honest
answer.

---

## The one architectural rule

> The Android client never calls Gemini, never scrapes a website, and never
> writes to `master_registry`, `release_notes`, or `background_tasks`.

An APK is a zip file; a key shipped inside one is a key you have given away. All
of that lives server-side. See
[ADR-0003](docs/adr/0003-server-side-ai-and-polling.md).

---

## Stack

**Android** — Kotlin 2.3, Jetpack Compose, Material 3, Hilt, Room, Coroutines,
AGP 9 / Gradle 9, `minSdk` 26 / `targetSdk` 36 / `compileSdk` 37, 15 modules.

**Backend** — Node 22, TypeScript, Express 5, Cloud Run, Pub/Sub, Cloud
Scheduler, Gemini, Firebase Admin SDK.

**Firebase** — Auth (Google), Firestore, Cloud Messaging.

**Web** — React 19, MUI, Vite, Express.
