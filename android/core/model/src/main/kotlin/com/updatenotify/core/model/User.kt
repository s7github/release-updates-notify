package com.updatenotify.core.model

/** Subscription tier levels for the UpdateNotify service. */
enum class SubscriptionTier {
    FREE, PRO, ENTERPRISE
}

/** The signed-in account and its notification preferences. */
data class User(
    val uid: String,
    val email: String,
    val displayName: String?,
    val photoUrl: String?,
    val settings: NotificationSettings,
    val isAdmin: Boolean = false,
    val subscriptionTier: SubscriptionTier = SubscriptionTier.FREE,
    val subscriptionExpiresAt: Long? = null, // null for free tier
)

/**
 * Per-category notification preferences.
 *
 * Evaluated **server-side** by the notifier before sending, so a muted category
 * never reaches the device and costs no battery (ADR-0008). The same values also
 * drive the local notification channels.
 */
data class NotificationSettings(
    val notifyFeatures: Boolean = true,
    val notifySecurity: Boolean = true,
    val notifyFixes: Boolean = true,
    val notifyOptimizations: Boolean = true,
) {
    /** Mirrors the notifier's server-side gate. Milestones are always delivered. */
    fun allows(category: ReleaseCategory): Boolean = when (category) {
        ReleaseCategory.NEW_FEATURES, ReleaseCategory.FEATURE_UPDATES -> notifyFeatures
        ReleaseCategory.SECURITY_PATCHES -> notifySecurity
        ReleaseCategory.BUG_FIXES -> notifyFixes
        ReleaseCategory.OPTIMIZATION -> notifyOptimizations
        ReleaseCategory.MAJOR_MILESTONE -> true
        ReleaseCategory.UNKNOWN -> true
    }

    companion object {
        val DEFAULT = NotificationSettings()
    }
}
