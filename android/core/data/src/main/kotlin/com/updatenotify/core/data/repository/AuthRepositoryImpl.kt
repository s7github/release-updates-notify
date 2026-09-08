package com.updatenotify.core.data.repository

import com.updatenotify.core.common.AppDispatcher
import com.updatenotify.core.common.Dispatcher
import com.updatenotify.core.database.dao.UserDao
import com.updatenotify.core.database.entity.toDomain
import com.updatenotify.core.database.entity.toEntity
import com.updatenotify.core.domain.repository.AuthRepository
import com.updatenotify.core.model.NotificationSettings
import com.updatenotify.core.model.User
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
class AuthRepositoryImpl @Inject constructor(
    private val authDataSource: AuthDataSource,
    private val firestore: FirestoreDataSource,
    private val userDao: UserDao,
    @param:Dispatcher(AppDispatcher.IO) private val ioDispatcher: CoroutineDispatcher,
) : AuthRepository {

    /** Reads Room, not Firebase — the UI's source of truth is local (ADR-0005). */
    override val currentUser: Flow<User?> =
        userDao.observeCurrent().map { it?.toDomain() }

    override fun currentUserIdOrNull(): String? = authDataSource.currentUid

    override suspend fun signInWithGoogle(idToken: String): Result<User> =
        withContext(ioDispatcher) {
            runCatching {
                val authUser = authDataSource.signInWithGoogle(idToken)

                // Create the profile document if this is a first sign-in. Only the
                // allow-listed fields; the rules reject anything else (ADR-0006).
                firestore.ensureUserDocument(
                    userId = authUser.uid,
                    email = authUser.email,
                    displayName = authUser.displayName,
                    photoUrl = authUser.photoUrl,
                )

                val isAdmin = firestore.isAdmin(authUser.uid)
                val remote = firestore.observeUser(authUser.uid, isAdmin).first()

                val user = remote ?: User(
                    uid = authUser.uid,
                    email = authUser.email,
                    displayName = authUser.displayName,
                    photoUrl = authUser.photoUrl,
                    settings = NotificationSettings.DEFAULT,
                    isAdmin = isAdmin,
                )
                userDao.upsert(user.toEntity())
                user
            }
        }

    override suspend fun signOut() = withContext(ioDispatcher) {
        authDataSource.signOut()
        // Clearing the local cache on sign-out is a privacy requirement, not
        // housekeeping: the next account on this device must not see the last
        // account's library.
        userDao.deleteAll()
    }

    override suspend fun registerPushToken(token: String): Result<Unit> =
        withContext(ioDispatcher) {
            runCatching {
                val uid = authDataSource.currentUid
                    ?: throw IllegalStateException("Not signed in")
                firestore.addPushToken(uid, token)
            }
        }

    override suspend fun updateNotificationSettings(
        settings: NotificationSettings,
    ): Result<Unit> = withContext(ioDispatcher) {
        runCatching {
            val uid = authDataSource.currentUid
                ?: throw IllegalStateException("Not signed in")
            firestore.updateSettings(uid, settings)
            // Mirror into Room so the UI reflects the change without waiting for
            // a round trip; the UI reads Room, never Firestore (ADR-0005).
            userDao.observeCurrent().first()?.let { existing ->
                userDao.upsert(existing.toDomain().copy(settings = settings).toEntity())
            }
            Unit
        }
    }
}
