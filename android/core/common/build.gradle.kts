plugins {
    alias(libs.plugins.updatenotify.jvm.library)
}

dependencies {
    implementation(libs.kotlinx.coroutines.core)
    // Qualifier annotations only — no DI framework in a pure-Kotlin module.
    api(libs.javax.inject)
}
