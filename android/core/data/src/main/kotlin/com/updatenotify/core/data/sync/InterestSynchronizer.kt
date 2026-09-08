package com.updatenotify.core.data.sync

import com.updatenotify.core.common.ApplicationScope
import com.updatenotify.core.database.dao.InterestDao
import com.updatenotify.core.database.entity.toEntity
import com.updatenotify.core.domain.repository.ReleaseRepository
import com.updatenotify.core.network.firestore.AuthDataSource
import com.updatenotify.core.network.firestore.FirestoreDataSource
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.filterNotNull
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.launchIn
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.onEach
import kotlinx.coroutines.launch
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Keeps Room in step with Firestore for the signed-in user.
 *
 * Runs in the application scope, not a ViewModel scope: sync must survive
 * navigation and configuration changes. Started once from the Application class.
 *
 * Only `interests` gets a live listener — it is small, user-scoped, and changes
 * on user action. Releases are pulled incrementally against a watermark instead,
 * because a listener over every followed item's releases would re-read (and
 * re-bill) far more than it saves (ADR-0005).
 */
@Singleton
class InterestSynchronizer @Inject constructor(
    private val authDataSource: AuthDataSource,
    private val firestore: FirestoreDataSource,
    private val interestDao: InterestDao,
    private val releaseRepository: ReleaseRepository,
    @param:ApplicationScope private val scope: CoroutineScope,
) {
    private var started = false

    fun start() {
        if (started) return
        started = true

        authDataSource.observeAuthState()
            .map { it?.uid }
            .distinctUntilChanged()
            .flatMapLatest { uid ->
                if (uid == null) {
                    // Signed out: drop the previous account's library so the next
                    // account on this device cannot see it.
                    scope.launch { interestDao.deleteAll() }
                    kotlinx.coroutines.flow.flowOf(emptyList())
                } else {
                    firestore.observeInterests(uid)
                }
            }
            .filterNotNull()
            .onEach { interests ->
                interestDao.upsertAll(interests.map { it.toEntity() })
                // A change to what the user follows changes what needs syncing.
                releaseRepository.sync()
            }
            .catch { /* transient listener failures must not kill the app scope */ }
            .launchIn(scope)
    }
}
