package com.updatenotify.core.model

/**
 * The closed set of release categories.
 *
 * The AI extraction prompt is constrained to exactly these values, and each maps
 * to one user notification preference and one Android notification channel.
 *
 * [UNKNOWN] exists because Gemini is not deterministic and will eventually return
 * something off-list. When it does, the app renders the release rather than
 * crashing — a bad category is not a reason to lose a release note.
 * See docs/DATA_MODEL.md.
 */
enum class ReleaseCategory(val wireValue: String) {
    NEW_FEATURES("New Features"),
    FEATURE_UPDATES("Feature Updates"),
    OPTIMIZATION("Optimization/Tips"),
    BUG_FIXES("Bug Fixes"),
    SECURITY_PATCHES("Security Patches"),
    MAJOR_MILESTONE("Major Milestone Update"),
    UNKNOWN("Unknown"),
    ;

    /** True for releases users almost always want to hear about immediately. */
    val isHighPriority: Boolean
        get() = this == SECURITY_PATCHES || this == MAJOR_MILESTONE

    companion object {
        private val byWireValue = entries.associateBy { it.wireValue }

        /** Never throws. An unrecognised value becomes [UNKNOWN]. */
        fun fromWireValue(value: String?): ReleaseCategory =
            value?.let { byWireValue[it] } ?: UNKNOWN
    }
}
