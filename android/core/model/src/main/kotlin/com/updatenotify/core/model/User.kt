package com.updatenotify.core.model

/** Subscription tier levels for the UpdateNotify service. */
enum class SubscriptionTier {
    FREE, PRO, ENTERPRISE;

    /**
     * Product entitlements, mirrored from `backend/src/lib/entitlements.ts`.
     * The backend is the enforcer for quotas and backfills; this copy shapes
     * what the app shows and blocks before a request is made.
     */
    val maxTrackedItems: Int?
        get() = when (this) {
            FREE -> 5
            PRO, ENTERPRISE -> null
        }

    val historyDays: Int?
        get() = when (this) {
            FREE -> 30
            PRO, ENTERPRISE -> null
        }

    val timelineItems: Int
        get() = when (this) {
            FREE -> 5
            PRO -> 500
            ENTERPRISE -> 1_000
        }

    val canExport: Boolean get() = this != FREE
    val canBackfillHistory: Boolean get() = this != FREE
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
) {
    /**
     * A paid tier whose expiry has passed behaves as FREE. A missing expiry
     * means no expiry. The server applies the same rule before spending money.
     */
    val effectiveTier: SubscriptionTier
        get() = when {
            subscriptionTier == SubscriptionTier.FREE -> SubscriptionTier.FREE
            subscriptionExpiresAt == null -> subscriptionTier
            subscriptionExpiresAt > System.currentTimeMillis() -> subscriptionTier
            else -> SubscriptionTier.FREE
        }

    val maxTrackedItems: Int? get() = effectiveTier.maxTrackedItems
    val timelineItems: Int get() = effectiveTier.timelineItems
    val canExport: Boolean get() = effectiveTier.canExport
    val canBackfillHistory: Boolean get() = effectiveTier.canBackfillHistory
}

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
