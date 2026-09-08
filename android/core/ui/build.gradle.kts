plugins {
    alias(libs.plugins.updatenotify.android.library)
    alias(libs.plugins.updatenotify.android.library.compose)
}


dependencies {
    api(projects.core.model)
    api(projects.core.designsystem)

    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.paging.compose)
    implementation(libs.coil.compose)
    implementation(libs.coil.network.okhttp)
}
