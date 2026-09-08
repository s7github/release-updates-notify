pluginManagement {
    // Convention plugins live in an included build, so they compile before the
    // main build configures. See ADR-0007.
    includeBuild("build-logic")
    repositories {
        google {
            content {
                includeGroupByRegex("com\\.android.*")
                includeGroupByRegex("com\\.google.*")
                includeGroupByRegex("androidx.*")
            }
        }
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}

rootProject.name = "UpdateNotify"

enableFeaturePreview("TYPESAFE_PROJECT_ACCESSORS")

include(":app")

// --- core: shared, dependency arrows point down into here ---
include(":core:model")          // domain models, pure Kotlin
include(":core:common")         // dispatchers, Result, extensions, pure Kotlin
include(":core:domain")         // use cases, pure Kotlin
include(":core:database")       // Room — the UI's source of truth (ADR-0005)
include(":core:network")        // Firestore + backend API client
include(":core:data")           // repositories; the only way features get data
include(":core:designsystem")   // theme, Material 3 tokens, primitive composables
include(":core:ui")             // composables that know about domain models
include(":core:testing")        // shared fakes and fixtures

// --- feature: one per user-facing area. These may NEVER depend on each other. ---
include(":feature:auth")
include(":feature:dashboard")
include(":feature:library")
include(":feature:software")
include(":feature:settings")
