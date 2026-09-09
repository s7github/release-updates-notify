# Setup

Getting from a fresh clone to a running build, on any machine.

Everything here has been verified on Linux with JDK 21. macOS and Windows differ
only in paths.

---

## 1. Prerequisites

| Tool | Version | Needed for |
|---|---|---|
| JDK | 17 or newer (21 fine) | Android build |
| Android SDK | platform **37.0**, build-tools **37.0.0** | Android build |
| Node | 22+ | web, backend, Firestore rules tests |
| Firebase CLI | 14+ | emulators, deploying rules |

> **Android SDK platforms are minor-versioned now.** The package is
> `platforms;android-37.0`, **not** `platforms;android-37` — the latter fails with
> "Failed to find package".

Headless install:

```bash
sdkmanager --install "platform-tools" "platforms;android-37.0" "build-tools;37.0.0"
```

---

## 2. Android

```bash
cd android
./gradlew assembleDebug
```

That is genuinely all — it builds on a fresh clone with no secrets configured.
The `google-services` plugin is applied conditionally, so a missing
`google-services.json` logs a line and carries on rather than failing.

**Open `android/` in Android Studio, not the repo root.** The Gradle root is
`android/settings.gradle.kts`. This is normal for a monorepo and surprises
everyone exactly once.

If the SDK is not on `ANDROID_HOME`, create `android/local.properties`:

```properties
# macOS / Linux
sdk.dir=/absolute/path/to/Android/sdk

# Windows — forward slashes, NOT backslashes
sdk.dir=C:/Users/you/AppData/Local/Android/Sdk
```

It is gitignored, and machine-local by design.

> **Windows: use forward slashes.** `local.properties` is a Java `.properties`
> file, where **backslash is an escape character**. A pasted Windows path like
> `C:\Users\you\AppData\Local\Android\Sdk` is read as `\U`, `\A`, `\L`… and
> silently mangles into a path that does not exist. The build then fails with a
> stack trace whose actual cause is buried dozens of frames down:
>
> ```
> java.io.IOException: Invalid file path
>   at SdkLocator$SdkLocationSource.validateSdkPath(SdkLocator.kt:216)
> ```
>
> Forward slashes work on every platform and avoid the escaping entirely.
> (Escaped backslashes — `C:\Users\you\...` — also work, which is what
> Android Studio writes, but they are easy to get wrong by hand.)

### Verify

**One command for everything** — the same checks CI runs:

```powershell
.\verify.ps1                    # Android + backend + Firestore rules
.\verify.ps1 -Only android      # just one
.\verify.ps1 -Only backend,rules
```

It sets `JAVA_HOME` to Android Studio's bundled JDK and `ANDROID_HOME` to the
default SDK location, which is the fiddly part on Windows. Exits non-zero if
anything fails, so it works in a pre-push hook.

Or run the suites by hand:

```bash
cd android   && ./gradlew assembleDebug lintDebug testDebugUnitTest test
cd backend   && pnpm install && pnpm run lint && pnpm test && pnpm run build
cd firebase  && pnpm install && pnpm run test:rules
```

Expect: an APK, **34** Android tests, **40** backend tests, **31** rules tests,
and no warnings from project sources. One AGP notice about the Kotlin plugin is
expected and unavoidable — see
[ADR-0010](adr/0010-agp9-toolchain-and-ksp-flags.md).

> **Put the repo on an SSD.** `node_modules` and Gradle output are tens of
> thousands of small files, which is the worst case for a spinning disk. Measured
> on this project: `pnpm install` took **8 seconds** on an NVMe SSD and had not
> finished after **25 minutes** on a 7200rpm HDD. The Gradle and npm caches live
> under your user profile, so if that is already on an SSD only the working copy
> needs moving.

> **Use a JDK the toolchain supports.** `verify.ps1` picks Android Studio's
> bundled JDK deliberately. A newer JDK than AGP supports fails in ways that do
> not mention the JDK.

---

## 3. Firebase configuration (needed for sign-in and data)

The app compiles without this. It cannot sign in or read anything without it.

### 3.1 `google-services.json`

Firebase console → Project settings → Your apps → Android app → download.
Place it at `android/app/google-services.json`.

**It is gitignored and must stay that way.** It is per-environment
configuration, and committing it wires every clone to one project.

Register **both** application ids, or debug builds will not authenticate:

| Build | Application id |
|---|---|
| debug | `com.updatenotify.debug` |
| release | `com.updatenotify` |

You also need the debug keystore's SHA-1 registered, or Google Sign-In fails
with a message that does not mention SHA-1:

```bash
keytool -list -v -alias androiddebugkey \
  -keystore ~/.android/debug.keystore \
  -storepass android -keypass android | grep SHA1
```

### 3.2 The web OAuth client id

> **This is the single most common setup mistake.** Credential Manager needs the
> **Web** OAuth client id, not the Android one. Using the Android id produces an
> unhelpful failure.

Google Cloud console → APIs & Services → Credentials → OAuth 2.0 Client IDs →
the one of type **Web application** → copy the id ending in
`.apps.googleusercontent.com`.

Put it in `~/.gradle/gradle.properties` (preferred — keeps it off the repo
entirely) or `android/local.properties`:

```properties
updatenotify.googleWebClientId=123456789-abcdef.apps.googleusercontent.com
```

Left unset, the app builds and runs; sign-in simply fails. That is deliberate —
it should not be a build error to work on a screen that does not need auth.

### 3.3 Backend API base URL

```properties
updatenotify.apiBaseUrl=https://your-api-service.run.app/
```

Defaults to an unroutable placeholder. Search discovery and the refresh button
fail without it; everything else works.

---

## 4. Firestore rules and emulators

```bash
cd firebase
pnpm install
pnpm run test:rules     # starts the emulator, runs the suite, shuts it down
pnpm run emulators      # long-running, with the UI on :4000
```

The emulator is a Java process, so JDK 17+ is needed here too.

Deploying:

```bash
pnpm run deploy:rules
pnpm run deploy:indexes
```

> Deploy the **indexes before the rules** on a new project. Rules referencing a
> field with no index will pass tests and then fail at runtime under load.

---

## 5. Web (admin surface)

```bash
cd web
pnpm install
pnpm run dev      # http://localhost:3000
```

Needs `GEMINI_API_KEY` in `web/.env` for its client-side AI calls. **That
pattern is exactly what the Android app does not do** — see
[ADR-0003](adr/0003-server-side-ai-and-polling.md). The web app inherits it and
is retained as an internal operator tool ([ADR-0009](adr/0009-keep-web-as-admin-surface.md)).

---

## 6. Backend

```bash
cd backend
pnpm install
pnpm run lint     # typechecks src and test
pnpm test         # 40 tests; no network, emulator or credentials needed
pnpm run build    # -> dist/index.js
```

Written and tested, **never deployed**. `backend/README.md` has the service
layout, the configuration table, and the deployment sketch; what is still
missing is infrastructure, not code — see [`STATUS.md`](STATUS.md) §4.

---

## 7. Bootstrapping the first admin

Admin membership is the existence of `admins/{uid}`, and **no client can write
that collection** ([ADR-0006](adr/0006-firestore-security-model.md)). So the
first one is a deliberate manual step:

1. Sign in to the app once, so a `users/{uid}` document exists.
2. In the Firebase console, create `admins/{that-uid}` with
   `{ email, seededAt }`.

Thereafter admins are granted by the backend with the Admin SDK. There is no
in-app path to self-promote, by design — see [`SECURITY.md`](SECURITY.md).

---

## 8. Troubleshooting

| Symptom | Cause |
|---|---|
| `Failed to find package 'platforms;android-37'` | Platforms are minor-versioned; use `android-37.0` |
| `java.io.IOException: Invalid file path` from `SdkLocator` | `local.properties` has unescaped Windows backslashes — use forward slashes (§2) |
| `KSP is not compatible with AGP's built-in Kotlin` | `android.builtInKotlin=false` is missing from `gradle.properties` — it is load-bearing (ADR-0010) |
| `plugin is not compatible with AGP's 9.0 new DSL` | `android.newDsl=false` is missing; also load-bearing |
| Sign-in fails immediately | Wrong OAuth client id (must be the **Web** one), or the debug SHA-1 is not registered |
| Dashboard is empty with no error | Expected. Nothing writes `release_notes` until the backend exists |
| `Unresolved reference` across a whole AGP DSL block | `CommonExtension` is non-generic in AGP 9; the six-star form makes every member fail (ADR-0010) |
| Firestore permission denied on a write | Probably correct. The client is read-mostly (ADR-0006) — check whether the write belongs in the backend |
