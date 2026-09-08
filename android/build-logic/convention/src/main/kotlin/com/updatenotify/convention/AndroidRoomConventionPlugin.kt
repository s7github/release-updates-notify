package com.updatenotify.convention

import androidx.room.gradle.RoomExtension
import org.gradle.api.Plugin
import org.gradle.api.Project
import org.gradle.kotlin.dsl.configure
import org.gradle.kotlin.dsl.dependencies

class AndroidRoomConventionPlugin : Plugin<Project> {
    override fun apply(target: Project) = with(target) {
        pluginManager.apply("com.google.devtools.ksp")
        pluginManager.apply("androidx.room")

        extensions.configure<RoomExtension> {
            // Exported schemas are committed. They are what makes a migration
            // test possible, and Room cannot verify a migration without them.
            schemaDirectory("$projectDir/schemas")
        }

        dependencies {
            add("implementation", libs.findLibrary("androidx.room.runtime").get())
            add("implementation", libs.findLibrary("androidx.room.ktx").get())
            add("implementation", libs.findLibrary("androidx.room.paging").get())
            add("ksp", libs.findLibrary("androidx.room.compiler").get())
            add("testImplementation", libs.findLibrary("androidx.room.testing").get())
        }
    }
}
