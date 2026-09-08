package com.updatenotify.core.database.entity

import com.updatenotify.core.model.Interest
import com.updatenotify.core.model.InterestType
import com.updatenotify.core.model.NotificationSettings
import com.updatenotify.core.model.Release
import com.updatenotify.core.model.ReleaseCategory
import com.updatenotify.core.model.Software
import com.updatenotify.core.model.User

/** Entity ↔ domain mapping. Kept beside the entities so the pair never drifts. */

fun SoftwareEntity.toDomain(): Software = Software(
    id = id,
    name = name,
    slug = slug,
    type = InterestType.fromWireValue(type),
    vendor = vendor,
    website = website,
    iconUrl = iconUrl,
    active = active,
    githubUrl = githubUrl,
    rssUrl = rssUrl,
    changelogUrl = changelogUrl,
    lastVersion = lastVersion,
    lastReleaseDate = lastReleaseDate,
    lastCheck = lastCheck,
)

fun Software.toEntity(): SoftwareEntity = SoftwareEntity(
    id = id,
    name = name,
    slug = slug,
    type = type.wireValue,
    vendor = vendor,
    website = website,
    iconUrl = iconUrl,
    active = active,
    githubUrl = githubUrl,
    rssUrl = rssUrl,
    changelogUrl = changelogUrl,
    lastVersion = lastVersion,
    lastReleaseDate = lastReleaseDate,
    lastCheck = lastCheck,
)

fun InterestEntity.toDomain(): Interest = Interest(
    id = id,
    userId = userId,
    softwareId = softwareId,
    topic = topic,
    softwareName = softwareName,
    type = InterestType.fromWireValue(type),
    following = following,
    createdAt = createdAt,
)

fun Interest.toEntity(): InterestEntity = InterestEntity(
    id = id,
    userId = userId,
    softwareId = softwareId,
    topic = topic,
    softwareName = softwareName,
    type = type.wireValue,
    following = following,
    createdAt = createdAt,
)

fun ReleaseEntity.toDomain(): Release = Release(
    id = id,
    softwareId = softwareId,
    softwareName = softwareName,
    version = version,
    releaseDate = releaseDate,
    category = ReleaseCategory.fromWireValue(category),
    summary = summary,
    isGenuineUpdate = isGenuineUpdate,
    createdAt = createdAt,
)

fun Release.toEntity(): ReleaseEntity = ReleaseEntity(
    id = id,
    softwareId = softwareId,
    softwareName = softwareName,
    version = version,
    releaseDate = releaseDate,
    category = category.wireValue,
    summary = summary,
    isGenuineUpdate = isGenuineUpdate,
    createdAt = createdAt,
    sortTimestamp = sortTimestamp,
)

fun UserEntity.toDomain(): User = User(
    uid = uid,
    email = email,
    displayName = displayName,
    photoUrl = photoUrl,
    settings = NotificationSettings(
        notifyFeatures = notifyFeatures,
        notifySecurity = notifySecurity,
        notifyFixes = notifyFixes,
        notifyOptimizations = notifyOptimizations,
    ),
    isAdmin = isAdmin,
)

fun User.toEntity(): UserEntity = UserEntity(
    uid = uid,
    email = email,
    displayName = displayName,
    photoUrl = photoUrl,
    notifyFeatures = settings.notifyFeatures,
    notifySecurity = settings.notifySecurity,
    notifyFixes = settings.notifyFixes,
    notifyOptimizations = settings.notifyOptimizations,
    isAdmin = isAdmin,
)
