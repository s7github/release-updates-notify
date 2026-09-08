package com.updatenotify.core.network.firestore

import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.auth.GoogleAuthProvider
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.tasks.await
import javax.inject.Inject
import javax.inject.Singleton

/** Firebase Auth. Identity is Firebase's job; the app stores no credentials. */
@Singleton
class AuthDataSource @Inject constructor(
    private val auth: FirebaseAuth,
) {
    val currentUid: String? get() = auth.currentUser?.uid

    data class AuthUser(
        val uid: String,
        val email: String,
        val displayName: String?,
        val photoUrl: String?,
    )

    /** Emits on every sign-in and sign-out, including the initial state. */
    fun observeAuthState(): Flow<AuthUser?> = callbackFlow {
        val listener = FirebaseAuth.AuthStateListener { firebaseAuth ->
            trySend(firebaseAuth.currentUser?.toAuthUser())
        }
        auth.addAuthStateListener(listener)
        awaitClose { auth.removeAuthStateListener(listener) }
    }

    suspend fun signInWithGoogle(idToken: String): AuthUser {
        val credential = GoogleAuthProvider.getCredential(idToken, null)
        val result = auth.signInWithCredential(credential).await()
        return requireNotNull(result.user?.toAuthUser()) {
            "Sign-in reported success but returned no user"
        }
    }

    fun signOut() = auth.signOut()

    /**
     * Bearer token for the backend `api` service.
     *
     * Firebase refreshes it automatically; the backend verifies it. This is the
     * only credential that ever leaves the device, and it is short-lived and
     * scoped to this user.
     */
    suspend fun currentIdToken(forceRefresh: Boolean = false): String? =
        auth.currentUser?.getIdToken(forceRefresh)?.await()?.token

    private fun com.google.firebase.auth.FirebaseUser.toAuthUser() = AuthUser(
        uid = uid,
        email = email.orEmpty(),
        displayName = displayName,
        photoUrl = photoUrl?.toString(),
    )
}
