package com.updatenotify.convention

import com.android.build.api.dsl.LibraryExtension
import org.gradle.api.Plugin
import org.gradle.api.Project
import org.gradle.kotlin.dsl.configure
import org.gradle.kotlin.dsl.dependencies

class AndroidLibraryConventionPlugin : Plugin<Project> {
    override fun apply(target: Project) = with(target) {
        pluginManager.apply("com.android.library")
        // AGP 9 ships built-in Kotlin support, but KSP is not compatible with it —
        // and Room and Hilt both require KSP. So `android.builtInKotlin=false` is set
        // in gradle.properties and the Kotlin plugin is applied explicitly, which is
        // the opt-out AGP itself documents.
        pluginManager.apply("org.jetbrains.kotlin.android")

        extensions.configure<LibraryExtension> {
            // Namespace is derived from the Gradle path (:core:designsystem ->
            // com.updatenotify.core.designsystem) so no module needs an `android { }`
            // block just to declare one. Fewer blocks also means no module trips the
            // deprecated old-DSL accessor warning that android.newDsl=false produces.
            namespace = "com.updatenotify" + path.replace(':', '.')

            configureKotlinAndroid(this)
            // targetSdk is deliberately not set here: it was removed from the
            // library DSL in AGP 9 and only the application module needs it.
            testOptions.animationsDisabled = true
        }

        dependencies {
            add("implementation", libs.findLibrary("kotlinx.coroutines.core").get())
            add("testImplementation", libs.findLibrary("junit4").get())
            add("testImplementation", libs.findLibrary("truth").get())
            add("testImplementation", libs.findLibrary("turbine").get())
            add("testImplementation", libs.findLibrary("mockk").get())
            add("testImplementation", libs.findLibrary("kotlinx.coroutines.test").get())
        }
    }
}
