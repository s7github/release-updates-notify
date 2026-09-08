plugins {
    alias(libs.plugins.updatenotify.android.library)
    alias(libs.plugins.updatenotify.android.hilt)
}


dependencies {
    api(projects.core.model)
    api(projects.core.data)

    api(libs.junit4)
    api(libs.truth)
    api(libs.turbine)
    api(libs.mockk)
    api(libs.kotlinx.coroutines.test)
    api(libs.androidx.test.ext.junit)
    api(libs.androidx.test.runner)
}
