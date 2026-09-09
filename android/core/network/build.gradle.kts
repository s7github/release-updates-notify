plugins {
    alias(libs.plugins.updatenotify.android.library)
    alias(libs.plugins.updatenotify.android.hilt)
    alias(libs.plugins.kotlin.serialization)
}

// Configured through the AGP 9 api DSL type rather than the `android { }`
// accessor: with android.newDsl=false (see ADR-0010) that accessor resolves
// to the deprecated legacy extension.
extensions.configure<com.android.build.api.dsl.LibraryExtension> {
    // Namespace comes from the convention plugin; this block exists only for
    // the API base URL, which is per-environment.
    defaultConfig {
        // Overridden per environment. See docs/SETUP.md.
        buildConfigField(
            "String",
            "API_BASE_URL",
            "\"${project.findProperty("updatenotify.apiBaseUrl") ?: "https://api.updatenotify.invalid/"}\"",
        )
    }

    buildFeatures {
        buildConfig = true
    }
}

dependencies {
    api(projects.core.model)
    implementation(projects.core.common)

    implementation(platform(libs.firebase.bom))
    implementation(libs.firebase.auth)
    implementation(libs.firebase.firestore)
    implementation(libs.firebase.messaging)

    implementation(platform(libs.okhttp.bom))
    implementation(libs.okhttp)
    implementation(libs.kotlinx.serialization.json)

    implementation(libs.kotlinx.coroutines.android)
    implementation(libs.kotlinx.coroutines.play.services)
}
