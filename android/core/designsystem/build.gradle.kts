plugins {
    alias(libs.plugins.updatenotify.android.library)
    alias(libs.plugins.updatenotify.android.library.compose)
}


dependencies {
    // CategoryStyle maps a domain enum to a colour + icon, so the design
    // system needs the model types. It needs nothing else from the app.
    api(projects.core.model)

    api(libs.androidx.compose.material3)
    api(libs.androidx.compose.material.icons.extended)
    api(libs.androidx.compose.ui.tooling.preview)
    implementation(libs.androidx.core.ktx)
    debugApi(libs.androidx.compose.ui.tooling)
}
