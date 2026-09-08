package com.updatenotify.core.database

import androidx.room.Database
import androidx.room.RoomDatabase
import com.updatenotify.core.database.dao.InterestDao
import com.updatenotify.core.database.dao.ReleaseDao
import com.updatenotify.core.database.dao.SoftwareDao
import com.updatenotify.core.database.dao.SyncStateDao
import com.updatenotify.core.database.dao.UserDao
import com.updatenotify.core.database.entity.InterestEntity
import com.updatenotify.core.database.entity.ReleaseEntity
import com.updatenotify.core.database.entity.SoftwareEntity
import com.updatenotify.core.database.entity.SyncStateEntity
import com.updatenotify.core.database.entity.UserEntity

/**
 * The local database — the UI's source of truth (ADR-0005).
 *
 * Schemas are exported to `core/database/schemas/` and committed. That export is
 * what makes a migration test possible; Room cannot verify a migration without
 * it. Bump [version] and add a `Migration` for every entity change.
 */
@Database(
    entities = [
        SoftwareEntity::class,
        InterestEntity::class,
        ReleaseEntity::class,
        UserEntity::class,
        SyncStateEntity::class,
    ],
    version = 1,
    exportSchema = true,
)
abstract class UpdateNotifyDatabase : RoomDatabase() {
    abstract fun softwareDao(): SoftwareDao
    abstract fun interestDao(): InterestDao
    abstract fun releaseDao(): ReleaseDao
    abstract fun userDao(): UserDao
    abstract fun syncStateDao(): SyncStateDao

    companion object {
        const val NAME = "updatenotify.db"
    }
}
