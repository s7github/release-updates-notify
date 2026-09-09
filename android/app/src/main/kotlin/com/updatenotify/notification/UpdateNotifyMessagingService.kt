package com.updatenotify.notification

import android.app.PendingIntent
import android.content.Intent
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import com.updatenotify.MainActivity
import com.updatenotify.R
import com.updatenotify.core.common.ApplicationScope
import com.updatenotify.core.domain.repository.AuthRepository
import com.updatenotify.core.model.ReleaseCategory
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * Receives release pushes from the `notifier` service (ADR-0008).
 *
 * The payload is data-only, not a `notification` block, so this runs in every app
 * state and the notification is built here. That is what lets the category pick
 * the right channel — a server-composed notification cannot.
 */
@AndroidEntryPoint
class UpdateNotifyMessagingService : FirebaseMessagingService() {

    @Inject lateinit var authRepository: AuthRepository

    @Inject @ApplicationScope lateinit var scope: CoroutineScope

    // Deprecated in messaging 25.x with no replacement shipped; overriding it is
    // still the only way to learn about a rotated token. See MainViewModel.
    @Suppress("DEPRECATION", "OVERRIDE_DEPRECATION")
    override fun onNewToken(token: String) {
        @Suppress("DEPRECATION")
        super.onNewToken(token)
        // Tokens rotate on reinstall, restore and cache clears. Missing one means
        // silently never notifying this device again.
        scope.launch { authRepository.registerPushToken(token) }
    }

    override fun onMessageReceived(message: RemoteMessage) {
        super.onMessageReceived(message)

        val data = message.data
        val softwareId = data[KEY_SOFTWARE_ID] ?: return
        val softwareName = data[KEY_SOFTWARE_NAME] ?: softwareId
        val version = data[KEY_VERSION].orEmpty()
        val category = ReleaseCategory.fromWireValue(data[KEY_CATEGORY])
        val summary = data[KEY_SUMMARY].orEmpty()

        // Below Android 13 there is no runtime notification permission, and
        // checkSelfPermission() on a permission the platform does not define reports
        // DENIED — which would have silently dropped every notification on API 26-32,
        // most of the supported range. areNotificationsEnabled() is correct on every
        // version and additionally respects the user switching notifications off in
        // system settings, which a permission check alone misses.
        if (!NotificationManagerCompat.from(this).areNotificationsEnabled()) return

        val intent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
            putExtra(EXTRA_SOFTWARE_ID, softwareId)
        }
        val pendingIntent = PendingIntent.getActivity(
            this,
            softwareId.hashCode(),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        val title = if (version.isBlank()) softwareName else "$softwareName $version"

        val notification = NotificationCompat.Builder(
            this,
            NotificationChannels.channelIdFor(category),
        )
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(title)
            .setContentText(summary.take(SUMMARY_PREVIEW_CHARS))
            .setStyle(NotificationCompat.BigTextStyle().bigText(summary))
            .setPriority(
                if (category.isHighPriority) {
                    NotificationCompat.PRIORITY_HIGH
                } else {
                    NotificationCompat.PRIORITY_DEFAULT
                },
            )
            .setContentIntent(pendingIntent)
            .setAutoCancel(true)
            // Group so ten releases in one sweep collapse into one bundle rather
            // than ten separate rows.
            .setGroup(NotificationChannels.GROUP_RELEASES)
            .build()

        // Keyed on softwareId so a later release for the same software replaces
        // the earlier notification instead of stacking.
        try {
            NotificationManagerCompat.from(this).notify(softwareId.hashCode(), notification)
        } catch (denied: SecurityException) {
            // POST_NOTIFICATIONS can be revoked between the check above and this
            // call. A dropped notification is the correct outcome; crashing the
            // messaging service is not.
            log("notification suppressed: permission revoked", denied)
        }
    }

    private fun log(message: String, error: Throwable? = null) {
        android.util.Log.w(TAG, message, error)
    }

    companion object {
        private const val TAG = "UpdateNotifyFcm"

        const val EXTRA_SOFTWARE_ID = "extra_software_id"

        private const val KEY_SOFTWARE_ID = "softwareId"
        private const val KEY_SOFTWARE_NAME = "softwareName"
        private const val KEY_VERSION = "version"
        private const val KEY_CATEGORY = "category"
        private const val KEY_SUMMARY = "summary"
        private const val SUMMARY_PREVIEW_CHARS = 120
    }
}
