package com.updatenotify.core.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Deterministic ids are what stop a repeat follow becoming a duplicate document
 * and therefore a duplicate notification. See docs/DATA_MODEL.md §2.
 */
class InterestTest {

    @Test
    fun `software id is deterministic`() {
        assertThat(Interest.idFor("user123", "fl-studio"))
            .isEqualTo(Interest.idFor("user123", "fl-studio"))
    }

    @Test
    fun `different users produce different ids for the same software`() {
        assertThat(Interest.idFor("userA", "suno"))
            .isNotEqualTo(Interest.idFor("userB", "suno"))
    }

    @Test
    fun `topic ids are slugged so arbitrary text is safe as a document id`() {
        // Firestore document ids cannot contain '/', and this is free text.
        assertThat(Interest.idForTopic("user123", "macOS Sequoia!"))
            .isEqualTo("user123_topic_macos-sequoia")
    }

    @Test
    fun `topic slugs collapse case and punctuation differences`() {
        assertThat(Interest.idForTopic("u", "Machine Learning"))
            .isEqualTo(Interest.idForTopic("u", "machine   learning"))
    }
}
