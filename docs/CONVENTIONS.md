# Conventions

How code is written here, so a change reads like the rest of the codebase.

The general rule: **match the surrounding code.** These are the conventions that
are not obvious from reading it.

---

## 1. Module rules (the ones the build enforces)

```
:app  →  :feature:*  →  :core:*
```

**Dependencies point downward only. A `:feature:` module may never depend on
another `:feature:` module.** Shared code goes down into `:core`, never sideways.
An illegal import fails to compile, so this is enforced rather than reviewed.

| Layer | May depend on | Android allowed? |
|---|---|---|
| `:core:model` | nothing | **no** |
| `:core:common` | `:core:model` | **no** |
| `:core:domain` | `model`, `common` | **no** |
| `:core:database` | `model`, `common` | yes |
| `:core:network` | `model`, `common` | yes |
| `:core:data` | all of the above | yes |
| `:core:designsystem` | `model` | yes |
| `:core:ui` | `model`, `designsystem` | yes |
| `:feature:*` | `core:*` only | yes |
| `:app` | everything | yes |

Keeping `model`, `common` and `domain` Android-free is deliberate: their tests
run on the JVM in milliseconds, and it keeps a future Kotlin Multiplatform move
cheap ([ADR-0002](adr/0002-kotlin-compose-native-android.md)).

**Adding a module?** Give it a convention plugin, not a hand-written build file.
Namespaces are derived from the Gradle path — no `android { }` block needed.

---

## 2. Dependencies

**Never write a version literal in a module's `build.gradle.kts`.** Add it to
`gradle/libs.versions.toml` and reference the alias.

Adding a dependency needs a reason recorded in the PR body or an ADR. Every
dependency is a permanent liability: a supply-chain surface, a build-time cost,
and something that will eventually block a toolchain upgrade.

---

## 3. Kotlin

Standard Kotlin style (`kotlin.code.style=official`), 4-space indent, 100-column
soft limit. Beyond that:

- **Trailing commas** on multi-line argument lists. Cleaner diffs.
- **Explicit visibility for public API.** `internal` by default in `:core`
  modules where the type is not meant to escape.
- **No `!!`.** If a value cannot be null, model it as non-null; if it can, handle
  it. `requireNotNull` with a message is fine where a precondition is genuinely
  a programming error.
- **`data class` for models, `sealed interface` for states.** UI state is a
  sealed hierarchy or a single data class, never a bag of independent booleans —
  `isLoading && isError` should be unrepresentable.

### Coroutines

- **Inject dispatchers.** Never reference `Dispatchers.IO` at a call site; use
  the `@Dispatcher(AppDispatcher.IO)` qualifier. That is what lets a test swap in
  a `TestDispatcher` and run deterministically instead of racing real threads.
- **Repositories return `Flow`, and suspend functions return `Result`.** Reads
  observe; writes can fail and say so.
- **Never swallow a `CancellationException`.** `runCatching` does — so use it
  only in a `withContext` block whose scope you own, as the repositories do.

### Errors

The data layer returns `Result`. ViewModels convert to UI state. Composables
never see a `Throwable`. A user-facing error message says what happened and what
to do; "Error: null" is a bug report waiting to happen.

---

## 4. Compose

- **Stateless composables take state and lambdas.** Only screen-level composables
  touch a ViewModel.
- **`collectAsStateWithLifecycle()`**, never `collectAsState()` — the latter keeps
  collecting while the app is backgrounded.
- **Hoist state** to the lowest common owner.
- **`key` on every `items()`** in a lazy list, or scroll position and animations
  break on update.
- **Preview functions** for anything with non-trivial layout, wrapped in
  `UpdateNotifyTheme`.
- **Content descriptions:** meaningful for interactive elements; `null` for
  decorative ones where adjacent text already says it. Both are choices — make
  them deliberately.
- **Colour is never the only signal.** Category is shown as colour *plus* icon
  *plus* label. Roughly 8% of men have some colour-vision deficiency, and
  greyscale screenshots exist.

---

## 5. Naming

| Thing | Pattern | Example |
|---|---|---|
| Composable screen | `<Feature>Screen` | `DashboardScreen` |
| ViewModel | `<Feature>ViewModel` | `LibraryViewModel` |
| UI state | `<Feature>UiState` | `SettingsUiState` |
| Use case | `<Verb><Noun>UseCase` | `GetFeedUseCase` |
| Repository contract | `<Noun>Repository` | `ReleaseRepository` |
| Implementation | `<Contract>Impl` | `ReleaseRepositoryImpl` |
| Room entity | `<Noun>Entity` | `ReleaseEntity` |
| Test | `<Subject>Test` | `VersionNormalizerTest` |

Test method names are backtick-quoted sentences describing behaviour:

```kotlin
@Test
fun `compares numeric versions component-wise, not lexically`() { … }
```

Not `testCompare1`. The name is the failure message.

---

## 6. Comments

Comment **why**, not what. `// increment i` is noise; `// Firestore caps whereIn
at 30 values` is the reason the next person does not "simplify" the chunking away.

Worth a comment:
- A non-obvious constraint (API limits, platform behaviour, a spec requirement)
- A deliberate omission — the load-bearing `gradle.properties` flags, the missing
  `request.query.limit` cap, the absent lint baseline
- A workaround, with the condition for removing it
- Anything that looks like a mistake and is not

Not worth a comment: restating the code, or a header block on every function.

---

## 7. Documentation obligations

These are not optional, and they are what keeps the repo usable across sessions
and tools:

| Change | Also update |
|---|---|
| Anything | `docs/STATUS.md` |
| A structural decision | A **new** ADR from `docs/adr/TEMPLATE.md` |
| A Firestore field or collection | `docs/DATA_MODEL.md`, **same commit** |
| `firestore.rules` | `firebase/test/firestore.rules.test.js`, **same commit** |
| A new setup step | `docs/SETUP.md` |

**ADRs are append-only.** Never edit an accepted one — write a new one saying
"Supersedes ADR-000X". The history is the value.

---

## 8. Git

Conventional Commits with an area scope:

```
feat(android): add release timeline paging
fix(backend): handle malformed RSS entity escapes
docs(adr): record Cloud Run over Cloud Functions decision
test(android): cover version comparison edge cases
build(android): move to AGP 9 toolchain
chore(ci): pin build-tools to 37.0.0
```

Scopes: `android`, `backend`, `web`, `firebase`, `ci`, `docs`, `adr`.

The body explains **why**. The diff already shows what. A commit that changes
behaviour and says only "fix bug" has thrown away the only chance to record the
reasoning.

Branch off `main`; never commit to it directly.

---

## 9. Testing

- **Test logic, not plumbing.** A repository method that forwards a flow needs no
  test; `VersionNormalizer.isNewerThan` needs several.
- **Test the edges that bite.** Version comparison, timestamp parsing and category
  mapping have tests because each has a failure mode that reaches users —
  duplicate notifications, dropped releases, silent miscategorisation.
- Truth for assertions, Turbine for flows, MockK for fakes.
- **A test that has never failed has proved nothing.** Make it fail once before
  trusting it.
