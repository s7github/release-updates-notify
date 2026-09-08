package com.updatenotify.convention

import com.android.build.api.dsl.ApplicationExtension
import org.gradle.api.Plugin
import org.gradle.api.Project
import org.gradle.kotlin.dsl.configure

class AndroidApplicationConventionPlugin : Plugin<Project> {
    override fun apply(target: Project) = with(target) {
        pluginManager.apply("com.android.application")
        // AGP 9 ships built-in Kotlin support, but KSP is not compatible with it —
        // and Room and Hilt both require KSP. So `android.builtInKotlin=false` is set
        // in gradle.properties and the Kotlin plugin is applied explicitly, which is
        // the opt-out AGP itself documents.
        pluginManager.apply("org.jetbrains.kotlin.android")

        extensions.configure<ApplicationExtension> {
            configureKotlinAndroid(this)
            // targetSdk is on ApplicationBaseFlavor, reached via defaultConfig.
            defaultConfig.targetSdk = libs.version("targetSdk").toInt()
            testOptions.animationsDisabled = true
        }
    }
}
