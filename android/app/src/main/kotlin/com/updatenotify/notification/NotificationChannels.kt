package com.updatenotify.notification

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import androidx.core.content.getSystemService
import com.updatenotify.core.model.ReleaseCategory

/**
 * One notification channel per release category.
 *
 * This is why `minSdk` is 26 (ADR-0002). Channels give users OS-level control
 * that survives app updates and that we do not have to build: someone who only
 * cares about security patches can mute everything else from system settings,
 * and the choice sticks.
 *
 * Server-side preferences (ADR-0008) and these channels are complementary, not
 * redundant — the server saves battery by not sending, the channel gives the user
 * a control surface they already know how to use.
 */
object NotificationChannels {

    const val GROUP_RELEASES = "releases"

    fun channelIdFor(category: ReleaseCategory): String = when (category) {
        ReleaseCategory.SECURITY_PATCHES -> "releases_security"
        ReleaseCategory.MAJOR_MILESTONE -> "releases_milestone"
        ReleaseCategory.NEW_FEATURES,
        ReleaseCategory.FEATURE_UPDATES,
        -> "releases_features"

        ReleaseCategory.BUG_FIXES -> "releases_fixes"
        ReleaseCategory.OPTIMIZATION -> "releases_optimization"
        ReleaseCategory.UNKNOWN -> "releases_features"
    }

    fun createAll(context: Context) {
        val manager = context.getSystemService<NotificationManager>() ?: return

        val channels = listOf(
            // Security and milestones default to HIGH: these are the releases
            // people actually want interrupting them.
            Triple(
                "releases_security",
                "Security patches",
                NotificationManager.IMPORTANCE_HIGH,
            ),
            Triple(
                "releases_milestone",
                "Major releases",
                NotificationManager.IMPORTANCE_HIGH,
            ),
            Triple(
                "releases_features",
                "Features and updates",
                NotificationManager.IMPORTANCE_DEFAULT,
            ),
            // Fixes and optimisations are LOW: they belong in the shade, not on
            // the lock screen with a sound.
            Triple(
                "releases_fixes",
                "Bug fixes",
                NotificationManager.IMPORTANCE_LOW,
            ),
            Triple(
                "releases_optimization",
                "Optimisations and tips",
                NotificationManager.IMPORTANCE_LOW,
            ),
        )

        channels.forEach { (id, name, importance) ->
            manager.createNotificationChannel(
                NotificationChannel(id, name, importance).apply {
                    description = "Release notifications for software you follow"
                    group = GROUP_RELEASES
                },
            )
        }
    }
}
