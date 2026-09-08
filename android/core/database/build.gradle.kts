plugins {
    alias(libs.plugins.updatenotify.android.library)
    alias(libs.plugins.updatenotify.android.hilt)
    alias(libs.plugins.updatenotify.android.room)
}


dependencies {
    api(projects.core.model)
    implementation(projects.core.common)
    implementation(libs.kotlinx.coroutines.android)
}
