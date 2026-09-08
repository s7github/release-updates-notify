package com.updatenotify.core.database.dao

import androidx.room.Dao
import androidx.room.Delete
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Upsert
import com.updatenotify.core.database.entity.InterestEntity
import com.updatenotify.core.database.entity.ReleaseEntity
import com.updatenotify.core.database.entity.SoftwareEntity
import com.updatenotify.core.database.entity.SyncStateEntity
import com.updatenotify.core.database.entity.UserEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface SoftwareDao {
    @Query("SELECT * FROM software WHERE id = :id")
    fun observeById(id: String): Flow<SoftwareEntity?>

    /**
     * Catalog entries the user actually follows.
     *
     * The join is the point: Firestore cannot express this at all, which is the
     * concrete reason Room is the source of truth (ADR-0005).
     */
    @Query(
        """
        SELECT s.* FROM software s
        INNER JOIN interests i ON i.softwareId = s.id
        ORDER BY s.name COLLATE NOCASE ASC
        """,
    )
    fun observeFollowed(): Flow<List<SoftwareEntity>>

    @Query("SELECT * FROM software WHERE name LIKE :prefix || '%' COLLATE NOCASE LIMIT :limit")
    suspend fun searchByPrefix(prefix: String, limit: Int = 25): List<SoftwareEntity>

    @Upsert
    suspend fun upsertAll(items: List<SoftwareEntity>)

    @Query("DELETE FROM software WHERE id = :id")
    suspend fun deleteById(id: String)
}

@Dao
interface InterestDao {
    @Query("SELECT * FROM interests ORDER BY createdAt DESC")
    fun observeAll(): Flow<List<InterestEntity>>

    @Query("SELECT * FROM interests WHERE softwareId = :softwareId LIMIT 1")
    fun observeBySoftwareId(softwareId: String): Flow<InterestEntity?>

    @Upsert
    suspend fun upsertAll(items: List<InterestEntity>)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(item: InterestEntity)

    @Delete
    suspend fun delete(item: InterestEntity)

    @Query("DELETE FROM interests WHERE id = :id")
    suspend fun deleteById(id: String)

    /** Replaces the local set wholesale after a full remote sync. */
    @Query("DELETE FROM interests")
    suspend fun deleteAll()
}

@Dao
interface ReleaseDao {
    @Query("SELECT * FROM releases WHERE softwareId = :softwareId ORDER BY sortTimestamp DESC")
    fun observeBySoftware(softwareId: String): Flow<List<ReleaseEntity>>

    @Query("SELECT * FROM releases WHERE id = :id")
    fun observeById(id: String): Flow<ReleaseEntity?>

    /**
     * The dashboard feed. Restricted to followed items via the join, and to
     * genuine updates so pipeline noise never reaches the user.
     */
    @Query(
        """
        SELECT r.* FROM releases r
        INNER JOIN interests i ON i.softwareId = r.softwareId
        WHERE r.isGenuineUpdate = 1
        ORDER BY r.sortTimestamp DESC
        LIMIT :limit
        """,
    )
    fun observeFeed(limit: Int): Flow<List<ReleaseEntity>>

    @Upsert
    suspend fun upsertAll(items: List<ReleaseEntity>)

    @Query("SELECT MAX(createdAt) FROM releases")
    suspend fun maxCreatedAt(): Long?

    @Query("DELETE FROM releases WHERE softwareId = :softwareId")
    suspend fun deleteBySoftware(softwareId: String)
}

@Dao
interface UserDao {
    @Query("SELECT * FROM users LIMIT 1")
    fun observeCurrent(): Flow<UserEntity?>

    @Upsert
    suspend fun upsert(user: UserEntity)

    @Query("DELETE FROM users")
    suspend fun deleteAll()
}

@Dao
interface SyncStateDao {
    @Query("SELECT * FROM sync_state WHERE collection = :collection")
    suspend fun get(collection: String): SyncStateEntity?

    @Upsert
    suspend fun upsert(state: SyncStateEntity)

    @Query("DELETE FROM sync_state")
    suspend fun deleteAll()
}
