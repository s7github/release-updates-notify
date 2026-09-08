package com.updatenotify.core.common

/**
 * Version strings are produced by a non-deterministic model, so the *same*
 * release can come back as "v25.2.5", "25.2.5" or "25.2.5 (2026/03/09)".
 *
 * Normalising before comparing is what stops the genuine-update gate
 * (ADR-0008) from firing a duplicate notification on a cosmetic difference, and
 * it is how `release_notes` document IDs stay stable across re-extraction.
 */
object VersionNormalizer {

    private val LEADING_V = Regex("^[vV](?=\\d)")
    private val TRAILING_PARENS = Regex("\\s*\\(.*\\)\\s*$")
    private val NON_ID_CHARS = Regex("[^a-z0-9]+")
    private val DATE_ONLY = Regex("^\\d{4}[-/]\\d{1,2}[-/]\\d{1,2}$")

    /** Human-facing form: trimmed, no leading `v`, no trailing parenthetical. */
    fun normalize(raw: String): String =
        raw.trim()
            .replace(TRAILING_PARENS, "")
            .replace(LEADING_V, "")
            .trim()

    /**
     * The `release_notes` document ID suffix. Must match the backend's derivation
     * exactly, or the client and the pipeline will disagree about identity.
     */
    fun toDocumentIdSegment(raw: String): String =
        normalize(raw).lowercase().replace(NON_ID_CHARS, "-").trim('-')

    /**
     * A bare date is never a version. The extraction prompt says so, and the
     * model still does it occasionally — so it is checked here too.
     */
    fun isProbablyDateNotVersion(raw: String): Boolean =
        DATE_ONLY.matches(raw.trim())

    /** True when [candidate] looks like a newer release than [current]. */
    fun isNewerThan(candidate: String, current: String?): Boolean {
        if (current.isNullOrBlank()) return true
        val a = normalize(candidate)
        val b = normalize(current)
        if (a.equals(b, ignoreCase = true)) return false

        val aParts = numericParts(a)
        val bParts = numericParts(b)
        if (aParts.isEmpty() || bParts.isEmpty()) {
            // Non-numeric versions ("Alpha V1"); a difference is treated as newer.
            return true
        }
        for (i in 0 until maxOf(aParts.size, bParts.size)) {
            val x = aParts.getOrElse(i) { 0 }
            val y = bParts.getOrElse(i) { 0 }
            if (x != y) return x > y
        }
        return false
    }

    private fun numericParts(value: String): List<Int> =
        Regex("\\d+").findAll(value).map { it.value.toIntOrNull() ?: 0 }.toList()
}
