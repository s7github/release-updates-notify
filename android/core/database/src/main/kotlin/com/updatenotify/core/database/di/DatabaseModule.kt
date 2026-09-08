package com.updatenotify.core.database.di

import android.content.Context
import androidx.room.Room
import com.updatenotify.core.database.UpdateNotifyDatabase
import com.updatenotify.core.database.dao.InterestDao
import com.updatenotify.core.database.dao.ReleaseDao
import com.updatenotify.core.database.dao.SoftwareDao
import com.updatenotify.core.database.dao.SyncStateDao
import com.updatenotify.core.database.dao.UserDao
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object DatabaseModule {

    @Provides
    @Singleton
    fun provideDatabase(
        @ApplicationContext context: Context,
    ): UpdateNotifyDatabase = Room.databaseBuilder(
        context,
        UpdateNotifyDatabase::class.java,
        UpdateNotifyDatabase.NAME,
    )
        // No fallbackToDestructiveMigration. Silently wiping a user's offline
        // library on a schema change is not an acceptable failure mode; a missing
        // migration should fail loudly in development instead.
        .build()

    @Provides fun provideSoftwareDao(db: UpdateNotifyDatabase): SoftwareDao = db.softwareDao()

    @Provides fun provideInterestDao(db: UpdateNotifyDatabase): InterestDao = db.interestDao()

    @Provides fun provideReleaseDao(db: UpdateNotifyDatabase): ReleaseDao = db.releaseDao()

    @Provides fun provideUserDao(db: UpdateNotifyDatabase): UserDao = db.userDao()

    @Provides fun provideSyncStateDao(db: UpdateNotifyDatabase): SyncStateDao = db.syncStateDao()
}
