plugins {
    alias(libs.plugins.updatenotify.android.library)
    alias(libs.plugins.updatenotify.android.hilt)
}


dependencies {
    api(projects.core.model)
    api(projects.core.domain)
    implementation(projects.core.common)
    implementation(projects.core.database)
    implementation(projects.core.network)

    implementation(libs.androidx.paging.runtime)
    implementation(libs.androidx.datastore.preferences)
    implementation(libs.kotlinx.coroutines.android)

    testImplementation(projects.core.testing)
}
