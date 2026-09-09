package com.updatenotify.core.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * This mirrors the server-side gate in the notifier (ADR-0008). If the two
 * disagree, users either get muted categories or silently miss ones they asked
 * for — so the mapping is pinned here.
 */
class NotificationSettingsTest {

    @Test
    fun `defaults allow everything`() {
        val settings = NotificationSettings.DEFAULT
        ReleaseCategory.entries.forEach { category ->
            assertThat(settings.allows(category)).isTrue()
        }
    }

    @Test
    fun `features toggle covers both feature categories`() {
        val settings = NotificationSettings(notifyFeatures = false)
        assertThat(settings.allows(ReleaseCategory.NEW_FEATURES)).isFalse()
        assertThat(settings.allows(ReleaseCategory.FEATURE_UPDATES)).isFalse()
        // and does not leak into unrelated categories
        assertThat(settings.allows(ReleaseCategory.SECURITY_PATCHES)).isTrue()
    }

    @Test
    fun `each toggle gates only its own category`() {
        assertThat(
            NotificationSettings(notifySecurity = false)
                .allows(ReleaseCategory.SECURITY_PATCHES),
        ).isFalse()
        assertThat(
            NotificationSettings(notifyFixes = false).allows(ReleaseCategory.BUG_FIXES),
        ).isFalse()
        assertThat(
            NotificationSettings(notifyOptimizations = false)
                .allows(ReleaseCategory.OPTIMIZATION),
        ).isFalse()
    }

    @Test
    fun `major milestones are always delivered`() {
        // Deliberate: there is no toggle for these, by product decision.
        val allMuted = NotificationSettings(
            notifyFeatures = false,
            notifySecurity = false,
            notifyFixes = false,
            notifyOptimizations = false,
        )
        assertThat(allMuted.allows(ReleaseCategory.MAJOR_MILESTONE)).isTrue()
    }

    @Test
    fun `unknown category is delivered rather than swallowed`() {
        // Extraction is non-deterministic; dropping an unrecognised category
        // would silently lose real releases.
        val allMuted = NotificationSettings(
            notifyFeatures = false,
            notifySecurity = false,
            notifyFixes = false,
            notifyOptimizations = false,
        )
        assertThat(allMuted.allows(ReleaseCategory.UNKNOWN)).isTrue()
    }
}
