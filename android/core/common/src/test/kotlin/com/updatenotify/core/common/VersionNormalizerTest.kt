package com.updatenotify.core.common

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Version handling is where duplicate notifications come from, so it gets the
 * most test attention in the module. Cases are drawn from the extraction rules
 * in the Gemini prompt and from real strings the web app's scraper produced.
 */
class VersionNormalizerTest {

    @Test
    fun `strips leading v`() {
        assertThat(VersionNormalizer.normalize("v25.2.5")).isEqualTo("25.2.5")
        assertThat(VersionNormalizer.normalize("V1.0")).isEqualTo("1.0")
    }

    @Test
    fun `keeps a leading v that is part of a word`() {
        // "vivaldi 6.0" must not become "ivaldi 6.0".
        assertThat(VersionNormalizer.normalize("vivaldi 6.0")).isEqualTo("vivaldi 6.0")
    }

    @Test
    fun `strips a trailing date parenthetical`() {
        // The exact shape the FL Studio changelog produces.
        assertThat(VersionNormalizer.normalize("25.2.5 (2026/03/09)")).isEqualTo("25.2.5")
    }

    @Test
    fun `document id segment is stable and url safe`() {
        // Must match the backend's derivation exactly, or client and pipeline
        // disagree about document identity and re-extraction duplicates.
        assertThat(VersionNormalizer.toDocumentIdSegment("v25.2.5 (2026/03/09)"))
            .isEqualTo("25-2-5")
        assertThat(VersionNormalizer.toDocumentIdSegment("1.2.3-beta")).isEqualTo("1-2-3-beta")
    }

    @Test
    fun `cosmetic differences produce the same document id`() {
        // The whole reason normalisation exists: Gemini is non-deterministic, so
        // the same release comes back spelled differently on re-extraction.
        val a = VersionNormalizer.toDocumentIdSegment("v25.2.5")
        val b = VersionNormalizer.toDocumentIdSegment("25.2.5 (2026/03/09)")
        assertThat(a).isEqualTo(b)
    }

    @Test
    fun `recognises a bare date as not a version`() {
        assertThat(VersionNormalizer.isProbablyDateNotVersion("2026-04-20")).isTrue()
        assertThat(VersionNormalizer.isProbablyDateNotVersion("2026/4/20")).isTrue()
        assertThat(VersionNormalizer.isProbablyDateNotVersion("25.2.5")).isFalse()
    }

    @Test
    fun `compares numeric versions component-wise, not lexically`() {
        // "10" sorts before "9" as a string; this is the classic bug.
        assertThat(VersionNormalizer.isNewerThan("1.10.0", "1.9.0")).isTrue()
        assertThat(VersionNormalizer.isNewerThan("1.9.0", "1.10.0")).isFalse()
    }

    @Test
    fun `handles differing component counts`() {
        assertThat(VersionNormalizer.isNewerThan("25.1", "25.0.9")).isTrue()
        assertThat(VersionNormalizer.isNewerThan("25.0", "25.0.0")).isFalse()
    }

    @Test
    fun `anything is newer than no recorded version`() {
        // First poll of a new catalog entry must notify.
        assertThat(VersionNormalizer.isNewerThan("1.0", null)).isTrue()
        assertThat(VersionNormalizer.isNewerThan("1.0", "")).isTrue()
    }

    @Test
    fun `identical versions are not newer`() {
        // The genuine-update gate. Getting this wrong notifies every user on
        // every scheduled poll, which is the fastest way to lose them.
        assertThat(VersionNormalizer.isNewerThan("25.2.5", "25.2.5")).isFalse()
        assertThat(VersionNormalizer.isNewerThan("v25.2.5", "25.2.5")).isFalse()
    }
}
