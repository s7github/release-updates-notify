plugins {
    alias(libs.plugins.updatenotify.android.application)
    alias(libs.plugins.updatenotify.android.application.compose)
    alias(libs.plugins.updatenotify.android.hilt)
}

// google-services.json is gitignored (it is per-environment config, not source).
// Applying the plugin unconditionally would break every fresh clone and every CI
// run before the first line of code compiles, so it is opt-in on the file's
// presence. See docs/SETUP.md for how to obtain it.
val googleServicesFile = file("google-services.json")
val hasGoogleServices = googleServicesFile.exists()
if (hasGoogleServices) {
    apply(plugin = libs.plugins.google.services.get().pluginId)
} else {
    logger.lifecycle(
        "app: google-services.json not found — Firebase is disabled for this build. " +
            "See docs/SETUP.md. The app will compile but cannot sign in.",
    )
}

android {
    namespace = "com.updatenotify"

    defaultConfig {
        applicationId = "com.updatenotify"
        versionCode = 1
        versionName = "0.1.0"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        vectorDrawables.useSupportLibrary = true

        // Google Sign-In needs the **web** OAuth client id from the Firebase
        // console, not the Android one — a detail that costs everybody an
        // afternoon exactly once.
        //
        // Read from a Gradle property rather than google-services' generated
        // `default_web_client_id` string, so the app still compiles when
        // google-services.json is absent (fresh clone, CI). Empty means sign-in
        // is disabled and the UI says so, rather than failing cryptically.
        // Set updatenotify.googleWebClientId in ~/.gradle/gradle.properties or
        // local.properties. See docs/SETUP.md.
        buildConfigField(
            "String",
            "GOOGLE_WEB_CLIENT_ID",
            "\"${project.findProperty("updatenotify.googleWebClientId") ?: ""}\"",
        )
    }

    buildTypes {
        debug {
            applicationIdSuffix = ".debug"
            versionNameSuffix = "-debug"
            isMinifyEnabled = false
        }
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
            )
            // Debug signing so `assembleRelease` works on a fresh clone and in CI.
            // Replace with a real signing config before publishing — see docs/SETUP.md.
            signingConfig = signingConfigs.getByName("debug")
        }
    }

    buildFeatures {
        buildConfig = true
    }
}

dependencies {
    implementation(projects.core.model)
    implementation(projects.core.common)
    implementation(projects.core.domain)
    implementation(projects.core.data)
    implementation(projects.core.database)
    implementation(projects.core.network)
    implementation(projects.core.designsystem)
    implementation(projects.core.ui)

    implementation(projects.feature.auth)
    implementation(projects.feature.dashboard)
    implementation(projects.feature.library)
    implementation(projects.feature.software)
    implementation(projects.feature.settings)

    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.splashscreen)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.navigation.compose)
    implementation(libs.androidx.hilt.navigation.compose)
    implementation(libs.androidx.work.runtime.ktx)
    implementation(libs.androidx.hilt.work)
    ksp(libs.androidx.hilt.compiler)

    implementation(platform(libs.firebase.bom))
    implementation(libs.firebase.auth)
    implementation(libs.firebase.firestore)
    implementation(libs.firebase.messaging)

    implementation(libs.kotlinx.coroutines.android)

    testImplementation(projects.core.testing)
    androidTestImplementation(projects.core.testing)
    androidTestImplementation(libs.androidx.compose.ui.test.junit4)
}
