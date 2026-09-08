package com.updatenotify.core.data.repository

import com.updatenotify.core.common.AppDispatcher
import com.updatenotify.core.common.Dispatcher
import com.updatenotify.core.database.dao.SoftwareDao
import com.updatenotify.core.database.entity.toDomain
import com.updatenotify.core.database.entity.toEntity
import com.updatenotify.core.domain.repository.SoftwareRepository
import com.updatenotify.core.model.Software
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
class SoftwareRepositoryImpl @Inject constructor(
    private val softwareDao: SoftwareDao,
    private val firestore: FirestoreDataSource,
    private val backendApi: BackendApi,
    @param:Dispatcher(AppDispatcher.IO) private val ioDispatcher: CoroutineDispatcher,
) : SoftwareRepository {

    override fun observeSoftware(softwareId: String): Flow<Software?> =
        softwareDao.observeById(softwareId).map { it?.toDomain() }

    override fun observeFollowedSoftware(): Flow<List<Software>> =
        softwareDao.observeFollowed().map { list -> list.map { it.toDomain() } }

    override suspend fun searchCatalog(query: String): Result<List<Software>> =
        withContext(ioDispatcher) {
            runCatching {
                val trimmed = query.trim()
                if (trimmed.isEmpty()) return@runCatching emptyList()

                // Local first: instant, works offline, and covers the common case
                // of searching for something already followed.
                val local = softwareDao.searchByPrefix(trimmed).map { it.toDomain() }

                val remote = runCatching {
                    firestore.searchCatalogByPrefix(trimmed)
                }.getOrDefault(emptyList())

                if (remote.isNotEmpty()) {
                    softwareDao.upsertAll(remote.map { it.toEntity() })
                }

                (local + remote).distinctBy { it.id }
            }
        }

    /**
     * Asks the backend to find sources for something not in the catalog.
     *
     * The client cannot do this itself: it would need to call Gemini (ADR-0003)
     * and write `master_registry` (ADR-0006), and it is permitted to do neither.
     * The returned entry has no releases yet — the pipeline fills it in.
     */
    override suspend fun requestDiscovery(query: String): Result<Software> =
        withContext(ioDispatcher) {
            backendApi.discover(query).mapCatching { response ->
                val software = firestore.observeSoftware(response.softwareId).first()
                    ?: throw IllegalStateException(
                        "Backend reported ${response.softwareId} but it is not readable yet",
                    )
                softwareDao.upsertAll(listOf(software.toEntity()))
                software
            }
        }
}
