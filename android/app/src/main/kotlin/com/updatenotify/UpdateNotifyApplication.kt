package com.updatenotify

import android.app.Application
import com.updatenotify.core.data.sync.InterestSynchronizer
import com.updatenotify.notification.NotificationChannels
import dagger.hilt.android.HiltAndroidApp
import javax.inject.Inject

@HiltAndroidApp
class UpdateNotifyApplication : Application() {

    @Inject lateinit var interestSynchronizer: InterestSynchronizer

    override fun onCreate() {
        super.onCreate()

        // Channels must exist before the first notification arrives, and creating
        // them is idempotent — so application start is the right place.
        NotificationChannels.createAll(this)

        // Sync runs in the application scope so it survives navigation and
        // configuration changes (ADR-0005).
        interestSynchronizer.start()
    }
}
