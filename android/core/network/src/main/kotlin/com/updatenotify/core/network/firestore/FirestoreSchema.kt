package com.updatenotify.core.network.firestore

/**
 * Collection and field names, in one place.
 *
 * Firestore is schemaless, so a typo in a field name is not a compile error — it
 * is an empty result at runtime. Centralising the strings is the only compile-time
 * safety available. Names match docs/DATA_MODEL.md exactly, including the
 * inherited snake_case in `master_registry`.
 */
object Collections {
    const val USERS = "users"
    const val INTERESTS = "interests"
    const val MASTER_REGISTRY = "master_registry"
    const val RELEASE_NOTES = "release_notes"
    const val BACKGROUND_TASKS = "background_tasks"
    const val ADMINS = "admins"
}

object SoftwareFields {
    const val NAME = "name"
    const val SLUG = "slug"
    const val TYPE = "type"
    const val VENDOR = "vendor"
    const val WEBSITE = "website"
    const val ICON_URL = "icon_url"
    const val ACTIVE = "active"
    const val GITHUB_URL = "github_url"
    const val RSS_URL = "rss_url"
    const val CHANGELOG_URL = "changelog_url"
    const val LAST_VERSION = "lastVersion"
    const val LAST_RELEASE_DATE = "lastReleaseDate"
    const val LAST_CHECK = "lastCheck"
}

object InterestFields {
    const val USER_ID = "userId"
    const val SOFTWARE_ID = "softwareId"
    const val TOPIC = "topic"
    const val SOFTWARE_NAME = "softwareName"
    const val TYPE = "type"
    const val FOLLOWING = "following"
    const val CREATED_AT = "createdAt"
}

object ReleaseFields {
    const val SOFTWARE_ID = "softwareId"
    const val SOFTWARE_NAME = "softwareName"
    const val VERSION = "version"
    const val RELEASE_DATE = "releaseDate"
    const val CATEGORY = "category"
    const val SUMMARY = "summary"
    const val IS_GENUINE_UPDATE = "isGenuineUpdate"
    const val CREATED_AT = "createdAt"
}

object TaskFields {
    const val TYPE = "type"
    const val STATUS = "status"
    const val SOFTWARE_ID = "softwareId"
    const val SOFTWARE_NAME = "softwareName"
    const val PROGRESS = "progress"
    const val MESSAGE = "message"
    const val ERROR = "error"
    const val UPDATED_AT = "updatedAt"
    const val REQUESTED_BY = "requestedBy"
}

object UserFields {
    const val UID = "uid"
    const val EMAIL = "email"
    const val DISPLAY_NAME = "displayName"
    const val PHOTO_URL = "photoURL"
    const val CREATED_AT = "createdAt"
    const val SETTINGS = "settings"
    const val FCM_TOKENS = "fcmTokens"

    const val NOTIFY_FEATURES = "notifyFeatures"
    const val NOTIFY_SECURITY = "notifySecurity"
    const val NOTIFY_FIXES = "notifyFixes"
    const val NOTIFY_OPTIMIZATIONS = "notifyOptimizations"
}
