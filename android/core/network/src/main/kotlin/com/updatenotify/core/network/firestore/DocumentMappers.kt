package com.updatenotify.core.network.firestore

import com.google.firebase.Timestamp
import com.google.firebase.firestore.DocumentSnapshot
import com.updatenotify.core.common.TimeParsing
import com.updatenotify.core.model.BackgroundTask
import com.updatenotify.core.model.Interest
import com.updatenotify.core.model.InterestType
import com.updatenotify.core.model.NotificationSettings
import com.updatenotify.core.model.Release
import com.updatenotify.core.model.ReleaseCategory
import com.updatenotify.core.model.Software
import com.updatenotify.core.model.TaskStatus
import com.updatenotify.core.model.TaskType
import com.updatenotify.core.model.User

/**
 * Firestore document → domain model.
 *
 * Every mapper is total: it returns a model or null, and never throws. Documents
 * in a schemaless store are written by other clients and by a pipeline, and one
 * malformed document must not take down a whole list. A missing field falls back;
 * a document missing something genuinely required returns null and is skipped.
 */

/** Timestamps are ISO strings in most collections and `Timestamp` in a few. */
private fun DocumentSnapshot.epochMillis(field: String): Long? = when (val raw = get(field)) {
    is String -> TimeParsing.parseIsoToEpochMillis(raw)
    is Timestamp -> raw.toDate().time
    is com.google.firebase.firestore.FieldValue -> null
    is Number -> raw.toLong()
    else -> null
}

fun DocumentSnapshot.toSoftware(): Software? {
    val name = getString(SoftwareFields.NAME) ?: return null
    return Software(
        id = id,
        name = name,
        slug = getString(SoftwareFields.SLUG) ?: id,
        type = InterestType.fromWireValue(getString(SoftwareFields.TYPE)),
        vendor = getString(SoftwareFields.VENDOR),
        website = getString(SoftwareFields.WEBSITE),
        iconUrl = getString(SoftwareFields.ICON_URL),
        active = getBoolean(SoftwareFields.ACTIVE) ?: true,
        githubUrl = getString(SoftwareFields.GITHUB_URL),
        rssUrl = getString(SoftwareFields.RSS_URL),
        changelogUrl = getString(SoftwareFields.CHANGELOG_URL),
        lastVersion = getString(SoftwareFields.LAST_VERSION),
        lastReleaseDate = epochMillis(SoftwareFields.LAST_RELEASE_DATE),
        lastCheck = epochMillis(SoftwareFields.LAST_CHECK),
    )
}

fun DocumentSnapshot.toInterest(): Interest? {
    val userId = getString(InterestFields.USER_ID) ?: return null
    val softwareId = getString(InterestFields.SOFTWARE_ID)
    val topic = getString(InterestFields.TOPIC)
    // The schema invariant: exactly one of softwareId / topic is set.
    if (softwareId == null && topic == null) return null
    return Interest(
        id = id,
        userId = userId,
        softwareId = softwareId,
        topic = topic,
        softwareName = getString(InterestFields.SOFTWARE_NAME) ?: topic ?: softwareId.orEmpty(),
        type = InterestType.fromWireValue(getString(InterestFields.TYPE)),
        following = getBoolean(InterestFields.FOLLOWING) ?: false,
        createdAt = epochMillis(InterestFields.CREATED_AT) ?: 0L,
    )
}

fun DocumentSnapshot.toRelease(): Release? {
    val softwareId = getString(ReleaseFields.SOFTWARE_ID) ?: return null
    val version = getString(ReleaseFields.VERSION) ?: return null
    val createdAt = epochMillis(ReleaseFields.CREATED_AT) ?: 0L
    return Release(
        id = id,
        softwareId = softwareId,
        softwareName = getString(ReleaseFields.SOFTWARE_NAME) ?: softwareId,
        version = version,
        releaseDate = epochMillis(ReleaseFields.RELEASE_DATE),
        // An off-list category becomes UNKNOWN rather than dropping the release.
        category = ReleaseCategory.fromWireValue(getString(ReleaseFields.CATEGORY)),
        summary = getString(ReleaseFields.SUMMARY).orEmpty(),
        isGenuineUpdate = getBoolean(ReleaseFields.IS_GENUINE_UPDATE) ?: true,
        createdAt = createdAt,
    )
}

fun DocumentSnapshot.toBackgroundTask(): BackgroundTask? {
    val softwareId = getString(TaskFields.SOFTWARE_ID) ?: return null
    return BackgroundTask(
        id = id,
        type = TaskType.fromWireValue(getString(TaskFields.TYPE)),
        status = TaskStatus.fromWireValue(getString(TaskFields.STATUS)),
        softwareId = softwareId,
        softwareName = getString(TaskFields.SOFTWARE_NAME) ?: softwareId,
        progress = (get(TaskFields.PROGRESS) as? Number)?.toInt()?.coerceIn(0, 100) ?: 0,
        message = getString(TaskFields.MESSAGE).orEmpty(),
        error = getString(TaskFields.ERROR),
        updatedAt = epochMillis(TaskFields.UPDATED_AT) ?: 0L,
    )
}

@Suppress("UNCHECKED_CAST")
fun DocumentSnapshot.toUser(isAdmin: Boolean): User? {
    val uid = getString(UserFields.UID) ?: id.takeIf { it.isNotBlank() } ?: return null
    val settingsMap = get(UserFields.SETTINGS) as? Map<String, Any?>
    fun flag(key: String) = settingsMap?.get(key) as? Boolean ?: true
    return User(
        uid = uid,
        email = getString(UserFields.EMAIL).orEmpty(),
        displayName = getString(UserFields.DISPLAY_NAME),
        photoUrl = getString(UserFields.PHOTO_URL),
        settings = NotificationSettings(
            notifyFeatures = flag(UserFields.NOTIFY_FEATURES),
            notifySecurity = flag(UserFields.NOTIFY_SECURITY),
            notifyFixes = flag(UserFields.NOTIFY_FIXES),
            notifyOptimizations = flag(UserFields.NOTIFY_OPTIMIZATIONS),
        ),
        isAdmin = isAdmin,
    )
}

fun NotificationSettings.toFirestoreMap(): Map<String, Any> = mapOf(
    UserFields.NOTIFY_FEATURES to notifyFeatures,
    UserFields.NOTIFY_SECURITY to notifySecurity,
    UserFields.NOTIFY_FIXES to notifyFixes,
    UserFields.NOTIFY_OPTIMIZATIONS to notifyOptimizations,
)
