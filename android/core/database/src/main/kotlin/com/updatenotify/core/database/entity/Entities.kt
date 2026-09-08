package com.updatenotify.core.database.entity

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

/**
 * Room entities — the UI's actual source of truth (ADR-0005).
 *
 * These mirror the Firestore documents described in docs/DATA_MODEL.md. Two
 * schemas means two places to change: a field added to Firestore and forgotten
 * here is silently dropped with no error. Mappers live next to each entity so
 * the pair is always visible together.
 */

@Entity(tableName = "software")
data class SoftwareEntity(
    @PrimaryKey val id: String,
    val name: String,
    val slug: String,
    val type: String,
    val vendor: String?,
    val website: String?,
    val iconUrl: String?,
    val active: Boolean,
    val githubUrl: String?,
    val rssUrl: String?,
    val changelogUrl: String?,
    val lastVersion: String?,
    val lastReleaseDate: Long?,
    val lastCheck: Long?,
)

@Entity(
    tableName = "interests",
    indices = [Index(value = ["softwareId"]), Index(value = ["userId"])],
)
data class InterestEntity(
    @PrimaryKey val id: String,
    val userId: String,
    val softwareId: String?,
    val topic: String?,
    val softwareName: String,
    val type: String,
    val following: Boolean,
    val createdAt: Long,
)

@Entity(
    tableName = "releases",
    indices = [
        Index(value = ["softwareId"]),
        // The feed sorts on this; without the index every scroll is a table scan.
        Index(value = ["sortTimestamp"]),
    ],
)
data class ReleaseEntity(
    @PrimaryKey val id: String,
    val softwareId: String,
    val softwareName: String,
    val version: String,
    val releaseDate: Long?,
    val category: String,
    val summary: String,
    val isGenuineUpdate: Boolean,
    val createdAt: Long,
    /**
     * Denormalised `releaseDate ?: createdAt`.
     *
     * Stored rather than computed because SQLite cannot use an index on a
     * COALESCE expression, and the feed's ORDER BY is the hottest query in the app.
     */
    val sortTimestamp: Long,
)

@Entity(tableName = "users")
data class UserEntity(
    @PrimaryKey val uid: String,
    val email: String,
    val displayName: String?,
    val photoUrl: String?,
    val notifyFeatures: Boolean,
    val notifySecurity: Boolean,
    val notifyFixes: Boolean,
    val notifyOptimizations: Boolean,
    val isAdmin: Boolean,
)

/**
 * Where incremental sync resumes from, per collection.
 *
 * Without this every launch re-reads every document — and Firestore bills per
 * document read (ADR-0005).
 */
@Entity(tableName = "sync_state")
data class SyncStateEntity(
    @PrimaryKey val collection: String,
    val lastSyncedAt: Long,
    val watermark: Long,
)
