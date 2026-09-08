package com.updatenotify.core.model

/**
 * One structured release note — the primary content of the app.
 *
 * Corresponds to a `release_notes` document. See docs/DATA_MODEL.md.
 */
data class Release(
    /** Deterministic: `{softwareId}-{normalised version}`. Makes re-extraction idempotent. */
    val id: String,
    val softwareId: String,
    val softwareName: String,
    val version: String,
    val releaseDate: Long?,
    val category: ReleaseCategory,
    /** Markdown. */
    val summary: String,
    /** False means the pipeline extracted something but judged it not notification-worthy. */
    val isGenuineUpdate: Boolean,
    val createdAt: Long,
) {
    /** Sort key for the feed: prefer the real release date, fall back to ingest time. */
    val sortTimestamp: Long get() = releaseDate ?: createdAt
}
