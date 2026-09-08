package com.updatenotify.core.common

import javax.inject.Qualifier

/**
 * Dispatchers are injected, never referenced as `Dispatchers.IO` at a call site.
 *
 * That is what lets a test swap in a `TestDispatcher` and run deterministically
 * instead of racing real threads.
 */
@Qualifier
@Retention(AnnotationRetention.RUNTIME)
annotation class Dispatcher(val dispatcher: AppDispatcher)

enum class AppDispatcher { Default, IO }

/** Marks the app-scoped [kotlinx.coroutines.CoroutineScope] that outlives any screen. */
@Qualifier
@Retention(AnnotationRetention.RUNTIME)
annotation class ApplicationScope
