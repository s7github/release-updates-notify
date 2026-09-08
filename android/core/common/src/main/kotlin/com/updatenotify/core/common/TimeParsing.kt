package com.updatenotify.core.common

import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.time.format.DateTimeParseException

/**
 * Timestamps arrive as ISO-8601 strings, which is what the existing Firestore
 * documents contain (see docs/DATA_MODEL.md).
 *
 * Real data is messier than the schema claims: some values are full instants,
 * some are bare dates, some are empty. Parsing must never throw — a release with
 * an unreadable date is still a release worth showing.
 */
object TimeParsing {

    fun parseIsoToEpochMillis(value: String?): Long? {
        if (value.isNullOrBlank()) return null

        // Full instant: 2026-03-09T12:00:00Z
        runCatching { return Instant.parse(value).toEpochMilli() }

        // Offset or local date-time: 2026-03-09T12:00:00+01:00
        runCatching {
            return java.time.OffsetDateTime.parse(value).toInstant().toEpochMilli()
        }

        // Bare date: 2026-03-09
        runCatching {
            return LocalDate.parse(value).atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli()
        }

        return null
    }

    fun formatIso(epochMillis: Long): String =
        DateTimeFormatter.ISO_INSTANT.format(Instant.ofEpochMilli(epochMillis))

    /** Best-effort parse that reports failure rather than silently returning null. */
    fun parseIsoStrict(value: String): Result<Long> =
        parseIsoToEpochMillis(value)
            ?.let { Result.success(it) }
            ?: Result.failure(DateTimeParseException("Unparseable timestamp", value, 0))
}
