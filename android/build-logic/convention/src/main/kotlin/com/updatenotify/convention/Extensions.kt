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
 */
internal fun Project.configureKotlinAndroid(
    commonExtension: CommonExtension<*, *, *, *, *, *>,
) {
    commonExtension.apply {
        compileSdk = libs.version("compileSdk").toInt()

        defaultConfig {
            minSdk = libs.version("minSdk").toInt()
        }

        compileOptions {
            sourceCompatibility = JavaVersion.VERSION_17
            targetCompatibility = JavaVersion.VERSION_17
            // Allows java.time and other newer APIs on minSdk 26 devices.
            isCoreLibraryDesugaringEnabled = false
        }

        lint {
            warningsAsErrors = false
            abortOnError = true
            checkDependencies = true
            // Baseline lets us adopt lint on an existing codebase without a
            // flag-day cleanup. New issues still fail the build.
            baseline = file("lint-baseline.xml")
        }

        packaging {
            resources {
                excludes += setOf(
                    "/META-INF/{AL2.0,LGPL2.1}",
                    "/META-INF/LICENSE*",
                    "/META-INF/NOTICE*",
                    "META-INF/versions/9/previous-compilation-data.bin",
                )
            }
        }

        testOptions {
            unitTests {
                isIncludeAndroidResources = true
                isReturnDefaultValues = true
            }
        }
    }

    configureKotlinJvmTarget()
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
}
