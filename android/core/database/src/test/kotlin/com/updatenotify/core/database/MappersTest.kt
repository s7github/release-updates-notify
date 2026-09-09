package com.updatenotify.core.database

import com.google.common.truth.Truth.assertThat
import com.updatenotify.core.database.entity.toDomain
import com.updatenotify.core.database.entity.toEntity
import com.updatenotify.core.model.Interest
import com.updatenotify.core.model.InterestType
import com.updatenotify.core.model.NotificationSettings
import com.updatenotify.core.model.Release
import com.updatenotify.core.model.ReleaseCategory
import com.updatenotify.core.model.Software
import com.updatenotify.core.model.User
import org.junit.Test

/**
 * Round-trip tests for the entity mappers.
 *
 * Two schemas mean two places to change, and a field added to one and forgotten
 * in the other is dropped silently with no error (docs/DATA_MODEL.md §10). These
 * tests are what turns that silent loss into a failing build.
 */
class MappersTest {

    @Test
    fun `software round-trips with every field populated`() {
        val original = Software(
            id = "fl-studio",
            name = "FL Studio",
            slug = "fl-studio",
            type = InterestType.SOFTWARE,
            vendor = "Image-Line",
            website = "https://www.image-line.com",
            iconUrl = "https://logo.clearbit.com/image-line.com",
            active = true,
            githubUrl = null,
            rssUrl = "https://example.com/feed.xml",
            changelogUrl = "https://example.com/changelog",
            lastVersion = "25.2.5",
            lastReleaseDate = 1773057600000L,
            lastCheck = 1773060000000L,
        )
        assertThat(original.toEntity().toDomain()).isEqualTo(original)
    }

    @Test
    fun `software round-trips with nullable fields empty`() {
        val original = Software(
            id = "topic-ai",
            name = "AI",
            slug = "topic-ai",
            type = InterestType.TOPIC,
            vendor = null,
            website = null,
            iconUrl = null,
            active = false,
            githubUrl = null,
            rssUrl = null,
            changelogUrl = null,
            lastVersion = null,
            lastReleaseDate = null,
            lastCheck = null,
        )
        assertThat(original.toEntity().toDomain()).isEqualTo(original)
    }

    @Test
    fun `release round-trips and derives its sort timestamp`() {
        val withDate = Release(
            id = "fl-studio-25-2-5",
            softwareId = "fl-studio",
            softwareName = "FL Studio",
            version = "25.2.5",
            releaseDate = 1773057600000L,
            category = ReleaseCategory.NEW_FEATURES,
            summary = "- Added things",
            isGenuineUpdate = true,
            createdAt = 1773060000000L,
        )
        assertThat(withDate.toEntity().toDomain()).isEqualTo(withDate)
        // Prefers the real release date over ingest time.
        assertThat(withDate.toEntity().sortTimestamp).isEqualTo(1773057600000L)
    }

    @Test
    fun `release without a date falls back to created time for sorting`() {
        val undated = Release(
            id = "x-1-0",
            softwareId = "x",
            softwareName = "X",
            version = "1.0",
            releaseDate = null,
            category = ReleaseCategory.UNKNOWN,
            summary = "",
            isGenuineUpdate = false,
            createdAt = 1773060000000L,
        )
        assertThat(undated.toEntity().sortTimestamp).isEqualTo(1773060000000L)
        assertThat(undated.toEntity().toDomain()).isEqualTo(undated)
    }

    @Test
    fun `interest round-trips for software and for topics`() {
        val software = Interest(
            id = "u1_fl-studio",
            userId = "u1",
            softwareId = "fl-studio",
            topic = null,
            softwareName = "FL Studio",
            type = InterestType.SOFTWARE,
            following = true,
            createdAt = 1773060000000L,
        )
        val topic = software.copy(
            id = "u1_topic_macos",
            softwareId = null,
            topic = "macOS",
            softwareName = "macOS",
            type = InterestType.TOPIC,
            following = false,
        )
        assertThat(software.toEntity().toDomain()).isEqualTo(software)
        assertThat(topic.toEntity().toDomain()).isEqualTo(topic)
    }

    @Test
    fun `user round-trips including flattened notification settings`() {
        // Settings are a nested map in Firestore but flat columns in Room, so
        // this is the mapping most likely to silently lose a field.
        val original = User(
            uid = "u1",
            email = "someone@example.com",
            displayName = "Someone",
            photoUrl = null,
            settings = NotificationSettings(
                notifyFeatures = false,
                notifySecurity = true,
                notifyFixes = false,
                notifyOptimizations = true,
            ),
            isAdmin = true,
        )
        assertThat(original.toEntity().toDomain()).isEqualTo(original)
    }
}
