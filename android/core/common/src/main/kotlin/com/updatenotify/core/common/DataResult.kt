package com.updatenotify.core.common

import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.onStart

/**
 * Explicit loading / success / error state for anything the UI renders.
 *
 * Named [DataResult] rather than `Result` so it never collides with
 * `kotlin.Result`, which has different semantics and shows up in stack traces.
 */
sealed interface DataResult<out T> {
    data object Loading : DataResult<Nothing>
    data class Success<T>(val data: T) : DataResult<T>
    data class Error(val throwable: Throwable) : DataResult<Nothing>
}

/** Wraps a cold flow so subscribers see Loading, then Success, and never an exception. */
fun <T> Flow<T>.asDataResult(): Flow<DataResult<T>> =
    map<T, DataResult<T>> { DataResult.Success(it) }
        .onStart { emit(DataResult.Loading) }
        .catch { emit(DataResult.Error(it)) }

inline fun <T, R> DataResult<T>.map(transform: (T) -> R): DataResult<R> = when (this) {
    is DataResult.Success -> DataResult.Success(transform(data))
    is DataResult.Error -> this
    DataResult.Loading -> DataResult.Loading
}

fun <T> DataResult<T>.dataOrNull(): T? = (this as? DataResult.Success)?.data
