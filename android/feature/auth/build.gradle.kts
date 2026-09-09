plugins {
    alias(libs.plugins.updatenotify.android.feature)
}

dependencies {
    // Google Sign-In runs through Credential Manager, which needs its own
    // artifacts; the legacy GoogleSignInClient API is deprecated.
    implementation(libs.androidx.credentials)
    implementation(libs.androidx.credentials.play.services)
    implementation(libs.google.id)

    implementation(platform(libs.firebase.bom))
    implementation(libs.firebase.auth)
}
