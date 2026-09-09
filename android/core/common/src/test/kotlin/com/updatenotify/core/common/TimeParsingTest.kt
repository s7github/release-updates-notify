package com.updatenotify.core.common

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Timestamps come from a schemaless store populated by an AI pipeline, so the
 * parser has to be total. A release with an unreadable date is still a release.
 */
class TimeParsingTest {

    @Test
    fun `parses a full instant`() {
        assertThat(TimeParsing.parseIsoToEpochMillis("2026-03-09T12:00:00Z"))
            .isEqualTo(1773057600000L)
    }

    @Test
    fun `parses an offset date-time`() {
        val withOffset = TimeParsing.parseIsoToEpochMillis("2026-03-09T13:00:00+01:00")
        val utc = TimeParsing.parseIsoToEpochMillis("2026-03-09T12:00:00Z")
        assertThat(withOffset).isEqualTo(utc)
    }

    @Test
    fun `parses a bare date as midnight UTC`() {
        assertThat(TimeParsing.parseIsoToEpochMillis("2026-03-09"))
            .isEqualTo(1773014400000L)
    }

    @Test
    fun `returns null rather than throwing on junk`() {
        assertThat(TimeParsing.parseIsoToEpochMillis("last Tuesday")).isNull()
        assertThat(TimeParsing.parseIsoToEpochMillis("")).isNull()
        assertThat(TimeParsing.parseIsoToEpochMillis(null)).isNull()
    }

    @Test
    fun `formatting round-trips`() {
        val millis = 1773057600000L
        assertThat(TimeParsing.parseIsoToEpochMillis(TimeParsing.formatIso(millis)))
            .isEqualTo(millis)
    }
}
