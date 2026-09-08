package com.updatenotify.core.model

/**
 * A catalog entry — one tracked software item or topic, shared by all users.
 *
 * Corresponds to a `master_registry` document. The client reads these and never
 * writes them (ADR-0006). See docs/DATA_MODEL.md.
 */
data class Software(
    val id: String,
    val name: String,
    val slug: String,
    val type: InterestType,
    val vendor: String?,
    val website: String?,
    val iconUrl: String?,
    val active: Boolean,
    val githubUrl: String?,
    val rssUrl: String?,
    val changelogUrl: String?,
    /** Last version the pipeline published. The genuine-update gate compares against this. */
    val lastVersion: String?,
    val lastReleaseDate: Long?,
    val lastCheck: Long?,
) {
    /**
     * True when the catalog entry exists but the pipeline has not produced a
     * release yet — a real UI state during onboarding, not an edge case.
     * See ADR-0003.
     */
    val isAwaitingFirstPoll: Boolean get() = lastVersion == null
}

enum class InterestType(val wireValue: String) {
    SOFTWARE("software"),
    TOPIC("topic"),
    ;

    companion object {
        fun fromWireValue(value: String?): InterestType =
            entries.firstOrNull { it.wireValue == value } ?: SOFTWARE
    }
}
