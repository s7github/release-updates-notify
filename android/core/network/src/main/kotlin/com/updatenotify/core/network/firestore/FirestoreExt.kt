package com.updatenotify.core.network.firestore

import com.google.firebase.firestore.DocumentReference
import com.google.firebase.firestore.DocumentSnapshot
import com.google.firebase.firestore.MetadataChanges
import com.google.firebase.firestore.Query
import com.google.firebase.firestore.QuerySnapshot
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow

/**
 * Snapshot listeners as cold [Flow]s, with the listener removed on cancellation.
 *
 * A leaked Firestore listener keeps billing reads and keeps a reference to its
 * scope, so [awaitClose] here is not optional bookkeeping.
 */

fun Query.snapshotsAsFlow(): Flow<QuerySnapshot> = callbackFlow {
    val registration = addSnapshotListener(MetadataChanges.EXCLUDE) { snapshot, error ->
        when {
            error != null -> close(error)
            snapshot != null -> trySend(snapshot)
        }
    }
    awaitClose { registration.remove() }
}

fun DocumentReference.snapshotsAsFlow(): Flow<DocumentSnapshot> = callbackFlow {
    val registration = addSnapshotListener(MetadataChanges.EXCLUDE) { snapshot, error ->
        when {
            error != null -> close(error)
            snapshot != null -> trySend(snapshot)
        }
    }
    awaitClose { registration.remove() }
}

/** Maps a query snapshot through a total mapper, silently skipping bad documents. */
fun <T : Any> QuerySnapshot.mapNotNullDocuments(transform: (DocumentSnapshot) -> T?): List<T> =
    documents.mapNotNull(transform)
