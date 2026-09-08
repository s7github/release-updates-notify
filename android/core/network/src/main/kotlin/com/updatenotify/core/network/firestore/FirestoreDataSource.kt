package com.updatenotify.core.network.firestore

import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.Query
import com.updatenotify.core.model.BackgroundTask
import com.updatenotify.core.model.Interest
import com.updatenotify.core.model.NotificationSettings
import com.updatenotify.core.model.Release
import com.updatenotify.core.model.Software
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.tasks.await
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Every Firestore read and write the client performs.
 *
 * Note what is absent: no writes to `master_registry`, `release_notes`, or
 * `background_tasks`. Those are backend-only and the security rules enforce it
 * (ADR-0006). If you are about to add one here, you are working around the trust
 * model rather than within it.
 */
@Singleton
class FirestoreDataSource @Inject constructor(
    private val firestore: FirebaseFirestore,
) {

    // ---------------- Reads ----------------

    fun observeInterests(userId: String): Flow<List<Interest>> =
        firestore.collection(Collections.INTERESTS)
            .whereEqualTo(InterestFields.USER_ID, userId)
            .snapshotsAsFlow()
            .map { it.mapNotNullDocuments { doc -> doc.toInterest() } }

    fun observeSoftware(softwareId: String): Flow<Software?> =
        firestore.collection(Collections.MASTER_REGISTRY)
            .document(softwareId)
            .snapshotsAsFlow()
            .map { it.toSoftware() }

    fun observeReleases(softwareId: String, limit: Long = 200): Flow<List<Release>> =
        firestore.collection(Collections.RELEASE_NOTES)
            .whereEqualTo(ReleaseFields.SOFTWARE_ID, softwareId)
            .orderBy(ReleaseFields.CREATED_AT, Query.Direction.DESCENDING)
            .limit(limit)
            .snapshotsAsFlow()
            .map { it.mapNotNullDocuments { doc -> doc.toRelease() } }

    fun observeTask(taskId: String): Flow<BackgroundTask?> =
        firestore.collection(Collections.BACKGROUND_TASKS)
            .document(taskId)
            .snapshotsAsFlow()
            .map { it.toBackgroundTask() }

    fun observeUser(userId: String, isAdmin: Boolean): Flow<com.updatenotify.core.model.User?> =
        firestore.collection(Collections.USERS)
            .document(userId)
            .snapshotsAsFlow()
            .map { it.toUser(isAdmin) }

    /** One-shot fetch of catalog entries by id, chunked around the 30-item `whereIn` limit. */
    suspend fun fetchSoftwareByIds(ids: List<String>): List<Software> {
        if (ids.isEmpty()) return emptyList()
        return ids.distinct().chunked(WHERE_IN_LIMIT).flatMap { chunk ->
            firestore.collection(Collections.MASTER_REGISTRY)
                .whereIn(com.google.firebase.firestore.FieldPath.documentId(), chunk)
                .get()
                .await()
                .mapNotNullDocuments { it.toSoftware() }
        }
    }

    /**
     * Incremental release sync from a watermark.
     *
     * Re-reading everything on each launch would be correct and expensive —
     * Firestore bills per document read (ADR-0005).
     */
    suspend fun fetchReleasesSince(softwareIds: List<String>, sinceIso: String?): List<Release> {
        if (softwareIds.isEmpty()) return emptyList()
        return softwareIds.distinct().chunked(WHERE_IN_LIMIT).flatMap { chunk ->
            var query: Query = firestore.collection(Collections.RELEASE_NOTES)
                .whereIn(ReleaseFields.SOFTWARE_ID, chunk)
            if (sinceIso != null) {
                query = query.whereGreaterThan(ReleaseFields.CREATED_AT, sinceIso)
            }
            query.get().await().mapNotNullDocuments { it.toRelease() }
        }
    }

    suspend fun searchCatalogByPrefix(prefix: String, limit: Long = 25): List<Software> {
        if (prefix.isBlank()) return emptyList()
        // Firestore has no full-text search. This is a range scan over `name`,
        // which gives prefix matching and nothing more. See ARCHITECTURE.md §7.
        return firestore.collection(Collections.MASTER_REGISTRY)
            .orderBy(SoftwareFields.NAME)
            .startAt(prefix)
            .endAt(prefix + PREFIX_SENTINEL)
            .limit(limit)
            .get()
            .await()
            .mapNotNullDocuments { it.toSoftware() }
    }

    suspend fun isAdmin(userId: String): Boolean = runCatching {
        firestore.collection(Collections.ADMINS).document(userId).get().await().exists()
    }.getOrDefault(false)

    // ---------------- Writes (only the client's own data) ----------------

    suspend fun upsertInterest(interest: Interest) {
        firestore.collection(Collections.INTERESTS)
            .document(interest.id)
            .set(
                mapOf(
                    InterestFields.USER_ID to interest.userId,
                    InterestFields.SOFTWARE_ID to interest.softwareId,
                    InterestFields.TOPIC to interest.topic,
                    InterestFields.SOFTWARE_NAME to interest.softwareName,
                    InterestFields.TYPE to interest.type.wireValue,
                    InterestFields.FOLLOWING to interest.following,
                    InterestFields.CREATED_AT to
                        com.updatenotify.core.common.TimeParsing.formatIso(interest.createdAt),
                ),
            )
            .await()
    }

    suspend fun deleteInterest(interestId: String) {
        firestore.collection(Collections.INTERESTS).document(interestId).delete().await()
    }

    suspend fun setInterestFollowing(interestId: String, following: Boolean) {
        firestore.collection(Collections.INTERESTS)
            .document(interestId)
            .update(InterestFields.FOLLOWING, following)
            .await()
    }

    suspend fun ensureUserDocument(
        userId: String,
        email: String,
        displayName: String?,
        photoUrl: String?,
    ) {
        val ref = firestore.collection(Collections.USERS).document(userId)
        val snapshot = ref.get().await()
        if (snapshot.exists()) {
            // Only the allow-listed fields; the rules reject anything else.
            ref.update(
                buildMap {
                    put(UserFields.DISPLAY_NAME, displayName)
                    put(UserFields.PHOTO_URL, photoUrl)
                },
            ).await()
        } else {
            ref.set(
                mapOf(
                    UserFields.UID to userId,
                    UserFields.EMAIL to email,
                    UserFields.DISPLAY_NAME to displayName,
                    UserFields.PHOTO_URL to photoUrl,
                    UserFields.CREATED_AT to
                        com.updatenotify.core.common.TimeParsing.formatIso(
                            System.currentTimeMillis(),
                        ),
                    UserFields.SETTINGS to NotificationSettings.DEFAULT.toFirestoreMap(),
                ),
            ).await()
        }
    }

    suspend fun updateSettings(userId: String, settings: NotificationSettings) {
        firestore.collection(Collections.USERS)
            .document(userId)
            .update(UserFields.SETTINGS, settings.toFirestoreMap())
            .await()
    }

    /** `arrayUnion` so two devices registering concurrently do not clobber each other. */
    suspend fun addPushToken(userId: String, token: String) {
        firestore.collection(Collections.USERS)
            .document(userId)
            .update(UserFields.FCM_TOKENS, FieldValue.arrayUnion(token))
            .await()
    }

    suspend fun removePushToken(userId: String, token: String) {
        firestore.collection(Collections.USERS)
            .document(userId)
            .update(UserFields.FCM_TOKENS, FieldValue.arrayRemove(token))
            .await()
    }

    private companion object {
        /** Firestore caps `whereIn` / `whereNotIn` at 30 values. */
        const val WHERE_IN_LIMIT = 30

        /**
         * High private-use code point, the conventional upper bound for a
         * Firestore prefix range. Written as an escape rather than a literal so
         * it survives copy-paste and editors that normalise unusual characters.
         */
        const val PREFIX_SENTINEL = '\uF8FF'
    }
}
