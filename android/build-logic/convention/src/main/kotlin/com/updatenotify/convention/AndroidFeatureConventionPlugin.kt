package com.updatenotify.convention

import com.android.build.api.dsl.LibraryExtension
import org.gradle.api.Plugin
import org.gradle.api.Project
import org.gradle.kotlin.dsl.configure
import org.gradle.kotlin.dsl.dependencies
import org.gradle.kotlin.dsl.project

/**
 * The plugin every `:feature:*` module applies.
 *
 * Bundles the library + Compose + Hilt setup and wires the dependencies a feature
 * is *allowed* to have. Note what is absent: no feature module can reach another
 * feature module. Shared code goes down into `:core`, never sideways. See ADR-0007.
 */
class AndroidFeatureConventionPlugin : Plugin<Project> {
    override fun apply(target: Project) = with(target) {
        pluginManager.apply("updatenotify.android.library")
        pluginManager.apply("updatenotify.android.library.compose")
        pluginManager.apply("updatenotify.android.hilt")

        extensions.configure<LibraryExtension> {
            defaultConfig {
                testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
            }
        }

        dependencies {
            add("implementation", project(":core:model"))
            add("implementation", project(":core:common"))
            add("implementation", project(":core:domain"))
            add("implementation", project(":core:data"))
            add("implementation", project(":core:designsystem"))
            add("implementation", project(":core:ui"))

            add("implementation", libs.findLibrary("androidx.core.ktx").get())
            add("implementation", libs.findLibrary("androidx.lifecycle.runtime.ktx").get())
            add("implementation", libs.findLibrary("androidx.lifecycle.runtime.compose").get())
            add("implementation", libs.findLibrary("androidx.lifecycle.viewmodel.compose").get())
            add("implementation", libs.findLibrary("androidx.navigation.compose").get())
            add("implementation", libs.findLibrary("androidx.hilt.navigation.compose").get())
            add("implementation", libs.findLibrary("androidx.compose.material.icons.extended").get())
            add("implementation", libs.findLibrary("kotlinx.coroutines.android").get())

            add("testImplementation", project(":core:testing"))
            add("androidTestImplementation", project(":core:testing"))
        }
    }
}
