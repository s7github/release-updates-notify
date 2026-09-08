package com.updatenotify.core.model

/**
 * Progress of a server-side pipeline job, so the UI can show a real progress bar
 * instead of an indeterminate spinner while a new software item is processed.
 *
 * The client reads these; it never writes them. Jobs are enqueued through the
 * backend API (ADR-0006).
 */
data class BackgroundTask(
    val id: String,
    val type: TaskType,
    val status: TaskStatus,
    val softwareId: String,
    val softwareName: String,
    /** 0..100 */
    val progress: Int,
    val message: String,
    val error: String?,
    val updatedAt: Long,
) {
    val isTerminal: Boolean
        get() = status == TaskStatus.COMPLETED || status == TaskStatus.FAILED
}

enum class TaskType(val wireValue: String) {
    INITIAL_POLL("initial_poll"),
    HISTORY_SCRAPE("history_scrape"),
    METADATA_ENRICHMENT("metadata_enrichment"),
    ;

    companion object {
        fun fromWireValue(value: String?): TaskType =
            entries.firstOrNull { it.wireValue == value } ?: INITIAL_POLL
    }
}

enum class TaskStatus(val wireValue: String) {
    PENDING("pending"),
    PROCESSING("processing"),
    COMPLETED("completed"),
    FAILED("failed"),
    ;

    companion object {
        fun fromWireValue(value: String?): TaskStatus =
            entries.firstOrNull { it.wireValue == value } ?: PENDING
    }
}
