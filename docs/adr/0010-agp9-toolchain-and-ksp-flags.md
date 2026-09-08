# ADR-0010: AGP 9 toolchain, and the two flags that make KSP work

- **Status:** Accepted
- **Date:** 2026-09-08

## Context

The build was first assembled on AGP 8.13.2 — the last 8.x release, and the
conservative choice. It did not survive contact with the dependencies:

```
26.  Dependency 'androidx.core:core-ktx:1.19.0' requires Android Gradle plugin 9.1.0 or higher.
     This build currently uses Android Gradle plugin 8.13.2.
```

Twenty-six dependencies, including the current Compose BOM, `core-ktx`,
`lifecycle`, and OkHttp 5, now require AGP 9 or `compileSdk 37`. Staying on
AGP 8 means pinning all of them backwards. For a project starting today that is
the choice that would look wrong to any Android developer opening it.

Moving to AGP 9 surfaced three further breaks, each with a real cause:

1. `CommonExtension` **lost its type parameters**. `CommonExtension<*, *, *, *, *, *>`
   no longer resolves, and because Kotlin then treats the receiver as an error
   type, every member access inside it fails with a misleading "unresolved
   reference" rather than pointing at the arity.
2. The lambda-accepting DSL functions (`lint { }`, `packaging { }`,
   `testOptions { }`) were **removed from `CommonExtension`**; only the getters
   remain. They survive on the concrete `ApplicationExtension` / `LibraryExtension`.
3. AGP 9 has **built-in Kotlin support** and a **new DSL**, both on by default,
   and it rejects an explicit `org.jetbrains.kotlin.android` plugin. But **KSP is
   not compatible with built-in Kotlin** — and Room and Hilt both require KSP.

## Decision

Adopt the current stack: **AGP 9.4.0, Gradle 9.7.1, Kotlin 2.3.21, KSP 2.3.11,
Hilt 2.60.1, compileSdk 37, targetSdk 36, minSdk 26, JVM target 17.**

Opt out of both AGP 9 defaults in `gradle.properties`:

```properties
android.builtInKotlin=false
android.newDsl=false
```

**These two lines are load-bearing.** Removing either breaks the build: without
them KSP refuses to run, which takes Room and Hilt with it. They are the
transition path AGP itself documents, not a workaround.

Consequences in the convention plugins:

- `CommonExtension` is used without type parameters.
- Shared configuration is written as **property access**
  (`commonExtension.lint.abortOnError = true`) rather than the block form.
- Module namespaces are **derived from the Gradle path** in the convention
  plugin, so no library module needs an `android { }` block at all — which also
  keeps every module clear of the deprecated old-DSL accessor warning that
  `newDsl=false` produces.

Note also that Android SDK platforms are now **minor-versioned**:
`platforms;android-37.0`, not `platforms;android-37`. Installing the latter
fails with "Failed to find package".

## Alternatives considered

| Option | Why not |
|---|---|
| Stay on AGP 8.13.2, pin 26 dependencies back | Freezes the app a full major version behind on Compose, lifecycle, and core. Every future dependency bump re-fights the same battle, and the pins are invisible constraints that the next person will not understand. |
| AGP 9 with built-in Kotlin, drop KSP | KSP is how Room and Hilt generate code. Dropping it means dropping both, or moving to KAPT — which is slower, in maintenance mode, and a step backwards. |
| AGP 9 with built-in Kotlin, replace Room and Hilt | Rewriting the data and DI layers to dodge a build flag is a wildly disproportionate response to two lines of configuration. |
| Kotlin 2.2.21 with AGP 9 | Tried. The 2.2 Kotlin Android plugin casts the extension to the old `BaseExtension` and throws `ClassCastException` at configuration time. Kotlin 2.3+ is required for AGP 9. |

## Consequences

**Good:**
- Every dependency is on its current release; no back-pinning.
- KSP, Room, and Hilt all work, with the annotation processing the codebase
  actually uses.
- The convention plugins are written against the AGP 9 API shape, so the
  eventual removal of `newDsl=false` is a smaller step than it would have been.

**Bad — the price we are paying:**
- Two non-obvious flags in `gradle.properties` that look removable and are not.
  Hence this ADR and the comment above them.
- AGP emits a deprecation warning on every configuration for using the Kotlin
  Android plugin. It is expected and cannot be silenced without removing KSP.
- `android.newDsl=false` is documented as temporary. AGP 10 will remove the old
  DSL, so this must be revisited before then.
- Kotlin 2.3 is comparatively new; some third-party compiler plugins may lag.

**Revisit if:**
- KSP gains built-in-Kotlin compatibility — at which point drop both flags and
  the explicit Kotlin plugin. **This is the trigger to watch;** it is tracked in
  [`STATUS.md`](../STATUS.md).
- AGP 10 approaches, which forces the migration regardless.
