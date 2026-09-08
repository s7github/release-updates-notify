plugins {
    `kotlin-dsl`
}

group = "com.updatenotify.buildlogic"

java {
    sourceCompatibility = JavaVersion.VERSION_17
    targetCompatibility = JavaVersion.VERSION_17
}

kotlin {
    compilerOptions {
        jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17)
    }
}

dependencies {
    compileOnly(libs.android.gradlePlugin)
    compileOnly(libs.kotlin.gradlePlugin)
    compileOnly(libs.ksp.gradlePlugin)
    compileOnly(libs.compose.gradlePlugin)
    compileOnly(libs.room.gradlePlugin)
}

// Every convention plugin is registered here. A module opts in by id; nothing is
// applied implicitly via subprojects {}, which would defeat the configuration cache.
gradlePlugin {
    plugins {
        register("androidApplication") {
            id = "updatenotify.android.application"
            implementationClass = "com.updatenotify.convention.AndroidApplicationConventionPlugin"
        }
        register("androidApplicationCompose") {
            id = "updatenotify.android.application.compose"
            implementationClass = "com.updatenotify.convention.AndroidApplicationComposeConventionPlugin"
        }
        register("androidLibrary") {
            id = "updatenotify.android.library"
            implementationClass = "com.updatenotify.convention.AndroidLibraryConventionPlugin"
        }
        register("androidLibraryCompose") {
            id = "updatenotify.android.library.compose"
            implementationClass = "com.updatenotify.convention.AndroidLibraryComposeConventionPlugin"
        }
        register("androidFeature") {
            id = "updatenotify.android.feature"
            implementationClass = "com.updatenotify.convention.AndroidFeatureConventionPlugin"
        }
        register("androidHilt") {
            id = "updatenotify.android.hilt"
            implementationClass = "com.updatenotify.convention.AndroidHiltConventionPlugin"
        }
        register("androidRoom") {
            id = "updatenotify.android.room"
            implementationClass = "com.updatenotify.convention.AndroidRoomConventionPlugin"
        }
        register("jvmLibrary") {
            id = "updatenotify.jvm.library"
            implementationClass = "com.updatenotify.convention.JvmLibraryConventionPlugin"
        }
    }
}
