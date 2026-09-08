plugins {
    alias(libs.plugins.updatenotify.jvm.library)
}

dependencies {
    api(projects.core.model)
    implementation(projects.core.common)
}
