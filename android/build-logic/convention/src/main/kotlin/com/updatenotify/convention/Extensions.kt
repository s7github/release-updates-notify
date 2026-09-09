package com.updatenotify.convention

import com.android.build.api.dsl.CommonExtension
import org.gradle.api.JavaVersion
import org.gradle.api.Project
import org.gradle.api.artifacts.VersionCatalog
import org.gradle.api.artifacts.VersionCatalogsExtension
import org.gradle.api.plugins.JavaPluginExtension
import org.gradle.kotlin.dsl.getByType
import org.jetbrains.kotlin.gradle.dsl.JvmTarget
import org.jetbrains.kotlin.gradle.dsl.KotlinAndroidProjectExtension
import org.jetbrains.kotlin.gradle.dsl.KotlinJvmProjectExtension

/** The one version catalog, reachable from plugin code. */
internal val Project.libs: VersionCatalog
    get() = extensions.getByType<VersionCatalogsExtension>().named("libs")

internal fun VersionCatalog.version(alias: String): String =
    findVersion(alias).get().requiredVersion

/**
 * Android + Kotlin settings shared by every Android module.
 *
 * Applied through convention plugins rather than a root `subprojects {}` block:
 * `subprojects` breaks the configuration cache and hides which settings reach
 * which module. See ADR-0007.
 *
 * Written as property access rather than the `lint { }` / `packaging { }` block
 * form: AGP 9 removed those lambda-accepting methods from `CommonExtension`
 * (they survive only on the concrete `ApplicationExtension` / `LibraryExtension`),
 * and `CommonExtension` itself is no longer generic.
 */
internal fun Project.configureKotlinAndroid(commonExtension: CommonExtension) {
    commonExtension.compileSdk = libs.version("compileSdk").toInt()
    commonExtension.defaultConfig.minSdk = libs.version("minSdk").toInt()

    commonExtension.compileOptions.sourceCompatibility = JavaVersion.VERSION_17
    commonExtension.compileOptions.targetCompatibility = JavaVersion.VERSION_17

    commonExtension.lint.abortOnError = true
    commonExtension.lint.checkDependencies = true

    // PropertyEscape fires on local.properties, which is gitignored, machine-local,
    // and not project source. On Windows any SDK path contains a drive-letter colon,
    // and the check is unsatisfiable there: with the file set to exactly what lint
    // itself suggests (`C\:/Users/...`) it still reports the same error and the same
    // "fix". Left enabled it makes `./gradlew lintDebug` — the command CLAUDE.md tells
    // people to run — fail for every Windows developer, while passing on Linux only
    // because a POSIX SDK path happens to contain neither a colon nor a backslash.
    // Nothing shipped depends on how this file is formatted.
    commonExtension.lint.disable.add("PropertyEscape")
    // Deliberately no baseline file. AGP generates one on first run containing
    // every existing issue, after which lint can never fail again — a quality
    // gate that silently disables itself is worse than no gate. Fix issues, or
    // suppress them explicitly at the call site where the reason is visible.

    commonExtension.packaging.resources.excludes.addAll(
        setOf(
            "/META-INF/{AL2.0,LGPL2.1}",
            "/META-INF/LICENSE*",
            "/META-INF/NOTICE*",
            "META-INF/versions/9/previous-compilation-data.bin",
        ),
    )

    commonExtension.testOptions.unitTests.isIncludeAndroidResources = true
    commonExtension.testOptions.unitTests.isReturnDefaultValues = true

    configureKotlinJvmTarget()
    allowModulesWithoutTests()
}

/**
 * Gradle 9 fails a test task when a test source directory exists but contains no
 * tests. Every module here has `src/test/kotlin` as the agreed place for tests to
 * go, so a module that has not grown any yet would break the whole build — which
 * discourages exactly the thing we want (adding the directory before the test).
 *
 * A module with tests still fails normally when they fail.
 */
internal fun Project.allowModulesWithoutTests() {
    tasks.withType(org.gradle.api.tasks.testing.Test::class.java).configureEach {
        // A Gradle Property, so set() rather than assignment in a plain .kt file.
        failOnNoDiscoveredTests.set(false)
    }
}

/** Kotlin compiler settings shared by Android and pure-JVM modules alike. */
internal fun Project.configureKotlinJvmTarget() {
    val compilerArgs = listOf(
        // Opt-in markers used across the data and UI layers.
        "-opt-in=kotlin.RequiresOptIn",
        "-opt-in=kotlinx.coroutines.ExperimentalCoroutinesApi",
        "-opt-in=kotlinx.coroutines.FlowPreview",
    )

    extensions.findByType(KotlinAndroidProjectExtension::class.java)?.apply {
        compilerOptions {
            jvmTarget.set(JvmTarget.JVM_17)
            freeCompilerArgs.addAll(compilerArgs)
        }
    }

    extensions.findByType(KotlinJvmProjectExtension::class.java)?.apply {
        compilerOptions {
            jvmTarget.set(JvmTarget.JVM_17)
            freeCompilerArgs.addAll(compilerArgs)
        }
    }

    extensions.findByType(JavaPluginExtension::class.java)?.apply {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    allowModulesWithoutTests()
}
