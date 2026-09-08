package com.updatenotify.convention

import com.android.build.api.dsl.CommonExtension
import org.gradle.api.Project
import org.gradle.kotlin.dsl.dependencies

/** Compose setup shared by the app module and every Compose-bearing library. */
internal fun Project.configureCompose(
    commonExtension: CommonExtension<*, *, *, *, *, *>,
) {
    commonExtension.apply {
        buildFeatures {
            compose = true
        }
    }

    // Kotlin 2.x ships the Compose compiler as a Kotlin plugin, so there is no
    // separate compiler version to keep in step with Kotlin any more.
    dependencies {
        val bom = libs.findLibrary("androidx.compose.bom").get()
        add("implementation", platform(bom))
        add("androidTestImplementation", platform(bom))

        add("implementation", libs.findLibrary("androidx.compose.ui").get())
        add("implementation", libs.findLibrary("androidx.compose.ui.graphics").get())
        add("implementation", libs.findLibrary("androidx.compose.ui.tooling.preview").get())
        add("implementation", libs.findLibrary("androidx.compose.material3").get())

        add("debugImplementation", libs.findLibrary("androidx.compose.ui.tooling").get())
        add("debugImplementation", libs.findLibrary("androidx.compose.ui.test.manifest").get())

        add("androidTestImplementation", libs.findLibrary("androidx.compose.ui.test.junit4").get())
    }
}
