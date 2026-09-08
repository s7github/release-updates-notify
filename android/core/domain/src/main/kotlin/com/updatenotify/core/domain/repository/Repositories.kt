package com.updatenotify.core.domain.repository

import com.updatenotify.core.model.BackgroundTask
import com.updatenotify.core.model.Interest
import com.updatenotify.core.model.NotificationSettings
import com.updatenotify.core.model.Release
import com.updatenotify.core.model.Software
import com.updatenotify.core.model.User
import kotlinx.coroutines.flow.Flow

/**
 * Repository contracts.
 *
 * These live in the domain layer as pure Kotlin — no Android, no Firestore, no
 * Room types cross this boundary. That is what lets use cases be tested on the
 * JVM in milliseconds, and what would make a Kotlin Multiplatform move cheap
 * (ADR-0002, ADR-0007).
 *
 * Every read returns a [Flow] backed by Room, never by a network call
 * (ADR-0005): the UI observes the local database and the sync layer feeds it.
 */

interface AuthRepository {
    /** Emits the signed-in user, or null when signed out. */
    val currentUser: Flow<User?>

    /** The signed-in UID, or null. Cheap, synchronous, for building document IDs. */
    fun currentUserIdOrNull(): String?

    suspend fun signInWithGoogle(idToken: String): Result<User>

    suspend fun signOut()

    /** Registers this device's push token against the account. */
    suspend fun registerPushToken(token: String): Result<Unit>

    suspend fun updateNotificationSettings(settings: NotificationSettings): Result<Unit>
}

interface InterestRepository {
    /** Everything the signed-in user follows, newest first. */
    fun observeInterests(): Flow<List<Interest>>

    fun observeInterest(softwareId: String): Flow<Interest?>

    /** Idempotent: repeating a follow overwrites rather than duplicating. */
    suspend fun follow(software: Software, notify: Boolean = true): Result<Unit>

    suspend fun followTopic(topic: String, notify: Boolean = true): Result<Unit>

    suspend fun unfollow(interestId: String): Result<Unit>

    /** Toggles notifications without removing the item from the library. */
    suspend fun setNotifying(interestId: String, notifying: Boolean): Result<Unit>
}

interface SoftwareRepository {
    fun observeSoftware(softwareId: String): Flow<Software?>

    /** Catalog entries the user follows. */
    fun observeFollowedSoftware(): Flow<List<Software>>

    /**
     * Prefix search over the catalog.
     *
     * Firestore has no full-text search; this is prefix matching and is
     * documented as such in docs/ARCHITECTURE.md §7.
     */
    suspend fun searchCatalog(query: String): Result<List<Software>>

    /**
     * Asks the backend to discover sources for something not in the catalog.
     *
     * Round-trips to the `api` service — the client cannot write the catalog
     * itself (ADR-0006) and cannot call Gemini (ADR-0003).
     */
    suspend fun requestDiscovery(query: String): Result<Software>
}

interface ReleaseRepository {
    /** Releases for one software item, newest first. */
    fun observeReleases(softwareId: String): Flow<List<Release>>

    fun observeRelease(releaseId: String): Flow<Release?>

    /**
     * The dashboard feed: every release across everything the user follows,
     * newest first. A Room join — Firestore cannot express this query at all,
     * which is the concrete reason Room exists here (ADR-0005).
     */
    fun observeFeed(limit: Int = DEFAULT_FEED_LIMIT): Flow<List<Release>>

    /** Pulls anything new since the stored watermark. Safe to call repeatedly. */
    suspend fun sync(): Result<Unit>

    /**
     * Asks the backend to re-poll now. Enqueues a job; it does not do the work
     * (ADR-0003). Returns the task id to observe.
     */
    suspend fun requestRefresh(softwareId: String): Result<String>

    companion object {
        const val DEFAULT_FEED_LIMIT = 200
    }
}

interface TaskRepository {
    /** Live progress for one enqueued pipeline job. */
    fun observeTask(taskId: String): Flow<BackgroundTask?>

    /** Unfinished jobs this user enqueued. */
    fun observeActiveTasks(): Flow<List<BackgroundTask>>
}
