package com.updatenotify.core.data.di

import com.updatenotify.core.data.repository.AuthRepositoryImpl
import com.updatenotify.core.data.repository.InterestRepositoryImpl
import com.updatenotify.core.data.repository.ReleaseRepositoryImpl
import com.updatenotify.core.data.repository.SoftwareRepositoryImpl
import com.updatenotify.core.data.repository.TaskRepositoryImpl
import com.updatenotify.core.domain.repository.AuthRepository
import com.updatenotify.core.domain.repository.InterestRepository
import com.updatenotify.core.domain.repository.ReleaseRepository
import com.updatenotify.core.domain.repository.SoftwareRepository
import com.updatenotify.core.domain.repository.TaskRepository
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

/**
 * Binds domain contracts to their implementations.
 *
 * Features depend on the interfaces in `:core:domain` and never on these classes,
 * which is what lets a test swap in a fake without a Firebase project.
 */
@Module
@InstallIn(SingletonComponent::class)
abstract class DataModule {

    @Binds
    @Singleton
    abstract fun bindAuthRepository(impl: AuthRepositoryImpl): AuthRepository

    @Binds
    @Singleton
    abstract fun bindInterestRepository(impl: InterestRepositoryImpl): InterestRepository

    @Binds
    @Singleton
    abstract fun bindSoftwareRepository(impl: SoftwareRepositoryImpl): SoftwareRepository

    @Binds
    @Singleton
    abstract fun bindReleaseRepository(impl: ReleaseRepositoryImpl): ReleaseRepository

    @Binds
    @Singleton
    abstract fun bindTaskRepository(impl: TaskRepositoryImpl): TaskRepository
}
