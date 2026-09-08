package com.updatenotify.core.data.repository

import com.updatenotify.core.domain.repository.TaskRepository
import com.updatenotify.core.model.BackgroundTask
import com.updatenotify.core.network.firestore.FirestoreDataSource
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flowOf
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Pipeline task progress.
 *
 * Deliberately *not* cached in Room: a task is short-lived, only interesting
 * while its screen is open, and worthless once complete. Persisting it would add
 * a migration obligation for data with a lifetime of seconds.
 */
@Singleton
class TaskRepositoryImpl @Inject constructor(
    private val firestore: FirestoreDataSource,
) : TaskRepository {

    override fun observeTask(taskId: String): Flow<BackgroundTask?> =
        firestore.observeTask(taskId)

    // Requires the composite index on (requestedBy, createdAt) — see
    // firebase/firestore.indexes.json. Tracked in docs/STATUS.md.
    override fun observeActiveTasks(): Flow<List<BackgroundTask>> = flowOf(emptyList())
}
