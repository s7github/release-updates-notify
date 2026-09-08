package com.updatenotify.core.model

/**
 * One user following one software item or one free-text topic.
 *
 * Corresponds to an `interests` document. Exactly one of [softwareId] / [topic]
 * is non-null, matching [type]. See docs/DATA_MODEL.md.
 */
data class Interest(
    /**
     * Deterministic: `{userId}_{softwareId}` or `{userId}_topic_{slug}`.
     *
     * The web app used random IDs, which let the same user follow the same thing
     * twice and get duplicate notifications. A derived ID makes a repeat follow an
     * idempotent overwrite instead.
     */
    val id: String,
    val userId: String,
    val softwareId: String?,
    val topic: String?,
    val softwareName: String,
    val type: InterestType,
    /** False = tracked in the library but silent. True = notify on release. */
    val following: Boolean,
    val createdAt: Long,
) {
    companion object {
        fun idFor(userId: String, softwareId: String): String = "${userId}_$softwareId"

        fun idForTopic(userId: String, topic: String): String =
            "${userId}_topic_${topic.lowercase().replace(Regex("[^a-z0-9]+"), "-").trim('-')}"
    }
}
