package com.updatenotify.core.data.repository

import com.updatenotify.core.common.AppDispatcher
import com.updatenotify.core.common.Dispatcher
import com.updatenotify.core.database.dao.InterestDao
import com.updatenotify.core.database.dao.UserDao
import com.updatenotify.core.database.entity.toDomain
import com.updatenotify.core.database.entity.toEntity
import com.updatenotify.core.domain.repository.InterestRepository
import com.updatenotify.core.model.Interest
import com.updatenotify.core.model.InterestType
import com.updatenotify.core.model.Software
import com.updatenotify.core.model.SubscriptionTier
import com.updatenotify.core.network.firestore.AuthDataSource
import com.updatenotify.core.network.firestore.FirestoreDataSource
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.withContext
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class InterestRepositoryImpl @Inject constructor(
    private val interestDao: InterestDao,
    private val userDao: UserDao,
    private val firestore: FirestoreDataSource,
    private val authDataSource: AuthDataSource,
    @param:Dispatcher(AppDispatcher.IO) private val ioDispatcher: CoroutineDispatcher,
) : InterestRepository {

    override fun observeInterests(): Flow<List<Interest>> =
        interestDao.observeAll().map { list -> list.map { it.toDomain() } }

    override fun observeInterest(softwareId: String): Flow<Interest?> =
        interestDao.observeBySoftwareId(softwareId).map { it?.toDomain() }

    override suspend fun follow(software: Software, notify: Boolean): Result<Unit> =
        withContext(ioDispatcher) {
            runCatching {
                val uid = requireUid()
                val interest = Interest(
                    // Deterministic id: a repeat follow overwrites instead of
                    // creating a duplicate that would double every notification.
                    id = Interest.idFor(uid, software.id),
                    userId = uid,
                    softwareId = software.id,
                    topic = null,
                    softwareName = software.name,
                    type = InterestType.SOFTWARE,
                    following = notify,
                    createdAt = System.currentTimeMillis(),
                )
                requireWithinPlan(interest.id)
                // Write local first so the UI reflects the tap immediately; the
                // remote write is what makes it durable.
                interestDao.upsert(interest.toEntity())
                firestore.upsertInterest(interest)
            }
        }

    override suspend fun followTopic(topic: String, notify: Boolean): Result<Unit> =
        withContext(ioDispatcher) {
            runCatching {
                val uid = requireUid()
                val trimmed = topic.trim()
                require(trimmed.isNotEmpty()) { "Topic cannot be blank" }
                require(trimmed.length <= MAX_TOPIC_LENGTH) {
                    "Topic exceeds $MAX_TOPIC_LENGTH characters"
                }
                val interest = Interest(
                    id = Interest.idForTopic(uid, trimmed),
                    userId = uid,
                    softwareId = null,
                    topic = trimmed,
                    softwareName = trimmed,
                    type = InterestType.TOPIC,
                    following = notify,
                    createdAt = System.currentTimeMillis(),
                )
                requireWithinPlan(interest.id)
                interestDao.upsert(interest.toEntity())
                firestore.upsertInterest(interest)
            }
        }

    override suspend fun unfollow(interestId: String): Result<Unit> =
        withContext(ioDispatcher) {
            runCatching {
                interestDao.deleteById(interestId)
                firestore.deleteInterest(interestId)
            }
        }

    override suspend fun setNotifying(interestId: String, notifying: Boolean): Result<Unit> =
        withContext(ioDispatcher) {
            runCatching {
                firestore.setInterestFollowing(interestId, notifying)
            }
        }

    private fun requireUid(): String =
        authDataSource.currentUid ?: throw IllegalStateException("Not signed in")

    /**
     * The FREE cap is five interests. A repeat follow of something already in
     * the library is always allowed — it is an update, not a new item. The
     * server mirrors this limit for paid operations; this check keeps the UI
     * from promising something the account cannot use.
     */
    private suspend fun requireWithinPlan(interestId: String) {
        val current = interestDao.observeAll().first()
        if (current.any { it.id == interestId }) return

        val tier = userDao.observeCurrent().first()?.toDomain()?.effectiveTier
            ?: SubscriptionTier.FREE
        val max = tier.maxTrackedItems ?: return
        check(current.size < max) {
            "The ${tier.name.lowercase()} plan tracks up to $max items. Remove one or upgrade to Pro."
        }
    }

    private companion object {
        /** Mirrors the length cap in firestore.rules. */
        const val MAX_TOPIC_LENGTH = 200
    }
}
