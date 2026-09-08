# ADR-0007: Multi-module by feature, `:core` underneath

- **Status:** Accepted
- **Date:** 2026-09-08

## Context

The app has five reasonably independent user-facing areas — auth, dashboard feed,
library management, software detail, settings — over one shared data layer.

A single-module Android app is simpler to set up and gets slower to build with
every file. Gradle cannot parallelise what is not separated, and any change
triggers a full recompile. It also cannot enforce boundaries: nothing stops a
screen from reaching into another screen's internals, and by the time that is a
problem it is everywhere.

## Decision

Multi-module, following the structure Google's *Now in Android* sample
establishes — chosen deliberately because it is the closest thing Android has to
a reference layout, so any competent Android developer or agent recognises it
immediately.

```
:app                     assembly, navigation host, DI root
:feature:*               auth · dashboard · library · software · settings
:core:designsystem       theme, Material 3 tokens, shared composables
:core:ui                 composables that know about domain models
:core:data               repositories — the only place features get data
:core:domain             use cases, pure Kotlin, no Android
:core:model              domain models, pure Kotlin, no Android
:core:database           Room
:core:network            Firestore + API client
:core:common             dispatchers, Result, extensions
:core:testing            shared test fixtures and fakes
```

**The rule: dependencies point downward only. A feature module may never depend
on another feature module.** Shared code goes down into `:core`, never sideways.

`:core:model` and `:core:domain` have no Android dependencies at all — plain
Kotlin. This keeps their tests JVM-fast, and it is what would make a future
Kotlin Multiplatform move cheap if [ADR-0002](0002-kotlin-compose-native-android.md)
is ever revisited for iOS.

Build configuration is shared through **convention plugins** in `build-logic/`,
not through `subprojects {}` blocks in the root build file, which defeat
configuration caching and hide what applies where.

## Alternatives considered

| Option | Why not |
|---|---|
| Single module | Build times degrade with no ceiling, and boundaries exist only by convention — which means they do not exist. |
| Layer-first (`:ui`, `:domain`, `:data` as three modules) | Every feature change touches all three modules, so nothing is incrementally buildable and no module can be reasoned about alone. Feature-first is the axis along which work actually arrives. |
| Full Clean Architecture, per-feature data/domain/ui triples | Fifteen-plus modules for five features. The ceremony exceeds the benefit at this size. |
| `subprojects {}` for shared config | Breaks configuration cache, obscures which config reaches which module. Convention plugins are the current, supported answer. |

## Consequences

**Good:**
- Gradle parallelises and caches per module; touching one feature does not
  rebuild the others.
- The dependency rule is enforced by the build, not by review. An illegal import
  fails to compile.
- `:core:domain` and `:core:model` test on the JVM in milliseconds, with no
  Robolectric and no device.
- The layout is recognisable — a new contributor or agent already knows where
  things go.

**Bad — the price we are paying:**
- Real up-front cost: eleven-plus `build.gradle.kts` files and `build-logic`
  before a single screen exists.
- Navigation between features needs an indirection, since features cannot see
  each other. Type-safe routes are declared in `:app` or in a shared navigation
  contract.
- Adding a feature is a multi-file ritual. Mitigated by convention plugins doing
  the boilerplate.

**Revisit if:**
- The app shrinks to two or three screens, where the ceremony stops paying for
  itself.
