package com.updatenotify.core.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Tier entitlements must agree with `backend/src/lib/entitlements.ts`.
 *
 * The backend authorises the expensive operations; these values decide what the
 * app offers and what it renders. A drift here is a paywall that lies.
 */
class UserEntitlementsTest {

    private fun user(
        tier: SubscriptionTier,
        expiresAt: Long? = null,
    ) = User(
        uid = "uid",
        email = "person@example.com",
        displayName = null,
        photoUrl = null,
        settings = NotificationSettings.DEFAULT,
        subscriptionTier = tier,
        subscriptionExpiresAt = expiresAt,
    )

    @Test
    fun `free plan has the documented hard limits`() {
        val free = user(SubscriptionTier.FREE)
        assertThat(free.effectiveTier).isEqualTo(SubscriptionTier.FREE)
        assertThat(free.maxTrackedItems).isEqualTo(5)
        assertThat(free.timelineItems).isEqualTo(5)
        assertThat(free.canExport).isFalse()
        assertThat(free.canBackfillHistory).isFalse()
        assertThat(SubscriptionTier.FREE.historyDays).isEqualTo(30)
    }

    @Test
    fun `paid plans are unlimited and can export`() {
        for (tier in listOf(SubscriptionTier.PRO, SubscriptionTier.ENTERPRISE)) {
            val paid = user(tier)
            assertThat(paid.maxTrackedItems).isNull()
            assertThat(paid.canExport).isTrue()
            assertThat(paid.canBackfillHistory).isTrue()
            assertThat(tier.historyDays).isNull()
        }
    }

    @Test
    fun `enterprise has a deeper timeline than pro`() {
        assertThat(SubscriptionTier.ENTERPRISE.timelineItems)
            .isGreaterThan(SubscriptionTier.PRO.timelineItems)
    }

    @Test
    fun `an expired paid tier behaves as free`() {
        val expired = user(SubscriptionTier.PRO, expiresAt = 1_000L)
        assertThat(expired.effectiveTier).isEqualTo(SubscriptionTier.FREE)
        assertThat(expired.maxTrackedItems).isEqualTo(5)
        assertThat(expired.canExport).isFalse()
    }

    @Test
    fun `a future expiry keeps the paid tier`() {
        val active = user(
            SubscriptionTier.ENTERPRISE,
            expiresAt = System.currentTimeMillis() + 86_400_000L,
        )
        assertThat(active.effectiveTier).isEqualTo(SubscriptionTier.ENTERPRISE)
        assertThat(active.maxTrackedItems).isNull()
    }

    @Test
    fun `free ignores an expiry value`() {
        val free = user(SubscriptionTier.FREE, expiresAt = Long.MAX_VALUE)
        assertThat(free.effectiveTier).isEqualTo(SubscriptionTier.FREE)
    }
}
