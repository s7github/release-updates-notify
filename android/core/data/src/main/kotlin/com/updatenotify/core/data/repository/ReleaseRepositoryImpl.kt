package com.updatenotify.core.data.repository

import com.updatenotify.core.common.AppDispatcher
import com.updatenotify.core.common.Dispatcher
import com.updatenotify.core.common.TimeParsing
import com.updatenotify.core.database.dao.InterestDao
import com.updatenotify.core.database.dao.ReleaseDao
import com.updatenotify.core.database.dao.SoftwareDao
import com.updatenotify.core.database.dao.SyncStateDao
import com.updatenotify.core.database.entity.SyncStateEntity
import com.updatenotify.core.database.entity.toDomain
import com.updatenotify.core.database.entity.toEntity
import com.updatenotify.core.domain.repository.ReleaseRepository
import com.updatenotify.core.model.Release
import com.updatenotify.core.network.api.BackendApi
import com.updatenotify.core.network.firestore.FirestoreDataSource
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.withContext
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class ReleaseRepositoryImpl @Inject constructor(
    private val releaseDao: ReleaseDao,
    private val interestDao: InterestDao,
    private val softwareDao: SoftwareDao,
    private val syncStateDao: SyncStateDao,
    private val firestore: FirestoreDataSource,
    private val backendApi: BackendApi,
    @param:Dispatcher(AppDispatcher.IO) private val ioDispatcher: CoroutineDispatcher,
) : ReleaseRepository {

    override fun observeReleases(softwareId: String): Flow<List<Release>> =
        releaseDao.observeBySoftware(softwareId).map { list -> list.map { it.toDomain() } }

    override fun observeRelease(releaseId: String): Flow<Release?> =
        releaseDao.observeById(releaseId).map { it?.toDomain() }

    override fun observeFeed(limit: Int): Flow<List<Release>> =
        releaseDao.observeFeed(limit).map { list -> list.map { it.toDomain() } }

    /**
     * Incremental sync.
     *
     * Reads only documents created after the stored watermark, so a launch costs
     * a handful of document reads rather than the whole library. Firestore bills
     * per read, which is the concrete reason the watermark exists (ADR-0005).
     */
    override suspend fun sync(): Result<Unit> = withContext(ioDispatcher) {
        runCatching {
            val interests = interestDao.observeAll().first()
            val softwareIds = interests.mapNotNull { it.softwareId }
            if (softwareIds.isEmpty()) return@runCatching

            // Refresh catalog metadata for followed items.
            val software = firestore.fetchSoftwareByIds(softwareIds)
            if (software.isNotEmpty()) {
                softwareDao.upsertAll(software.map { it.toEntity() })
            }

            val previous = syncStateDao.get(SYNC_KEY_RELEASES)
            val sinceIso = previous?.watermark?.let { TimeParsing.formatIso(it) }

            val releases = firestore.fetchReleasesSince(softwareIds, sinceIso)
            if (releases.isNotEmpty()) {
                releaseDao.upsertAll(releases.map { it.toEntity() })
            }

            // Advance the watermark to the newest thing actually stored, never to
            // "now": a document written during the sync would otherwise be skipped
            // forever.
            val newWatermark = maxOf(
                previous?.watermark ?: 0L,
                releases.maxOfOrNull { it.createdAt } ?: 0L,
            )
            syncStateDao.upsert(
                SyncStateEntity(
                    collection = SYNC_KEY_RELEASES,
                    lastSyncedAt = System.currentTimeMillis(),
                    watermark = newWatermark,
                ),
            )
        }
    }

    /**
     * Enqueues a backend poll and returns the task id to observe.
     *
     * The app does not poll. It asks the pipeline to (ADR-0003).
     */
    override suspend fun requestRefresh(softwareId: String): Result<String> =
        withContext(ioDispatcher) {
            backendApi.requestRefresh(softwareId).map { it.taskId }
        }

    private companion object {
        const val SYNC_KEY_RELEASES = "release_notes"
    }
}
