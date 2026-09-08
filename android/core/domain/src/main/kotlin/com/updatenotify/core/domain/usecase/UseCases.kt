package com.updatenotify.core.domain.usecase

import com.updatenotify.core.domain.repository.InterestRepository
import com.updatenotify.core.domain.repository.ReleaseRepository
import com.updatenotify.core.domain.repository.SoftwareRepository
import com.updatenotify.core.model.Interest
import com.updatenotify.core.model.Release
import com.updatenotify.core.model.ReleaseCategory
import com.updatenotify.core.model.Software
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.map
import javax.inject.Inject

/**
 * Use cases hold logic that is not a plain repository passthrough and that more
 * than one ViewModel needs. A ViewModel that only forwards a flow calls the
 * repository directly — wrapping every call in a one-line use case is ceremony,
 * not architecture.
 */

/**
 * The dashboard feed, joined with catalog metadata and optionally filtered.
 *
 * The join happens here rather than in the ViewModel so the dashboard and any
 * future widget or Wear surface share one definition of "the feed".
 */
class GetFeedUseCase @Inject constructor(
    private val releaseRepository: ReleaseRepository,
    private val softwareRepository: SoftwareRepository,
) {
    operator fun invoke(
        categoryFilter: Set<ReleaseCategory> = emptySet(),
    ): Flow<List<FeedItem>> = combine(
        releaseRepository.observeFeed(),
        softwareRepository.observeFollowedSoftware(),
    ) { releases, software ->
        val byId = software.associateBy { it.id }
        releases
            .asSequence()
            .filter { categoryFilter.isEmpty() || it.category in categoryFilter }
            .map { release -> FeedItem(release = release, software = byId[release.softwareId]) }
            .sortedByDescending { it.release.sortTimestamp }
            .toList()
    }
}

/**
 * One row of the dashboard.
 *
 * [software] is nullable on purpose: a release can arrive for a catalog entry the
 * device has not synced yet. Showing the release with a missing icon beats
 * dropping it.
 */
data class FeedItem(
    val release: Release,
    val software: Software?,
) {
    val iconUrl: String? get() = software?.iconUrl
    val vendor: String? get() = software?.vendor
}

/** The library screen: what the user follows, with each item's catalog entry. */
class GetLibraryUseCase @Inject constructor(
    private val interestRepository: InterestRepository,
    private val softwareRepository: SoftwareRepository,
) {
    operator fun invoke(): Flow<List<LibraryItem>> = combine(
        interestRepository.observeInterests(),
        softwareRepository.observeFollowedSoftware(),
    ) { interests, software ->
        val byId = software.associateBy { it.id }
        interests
            .map { interest ->
                LibraryItem(
                    interest = interest,
                    software = interest.softwareId?.let { byId[it] },
                )
            }
            .sortedBy { it.interest.softwareName.lowercase() }
    }
}

data class LibraryItem(
    val interest: Interest,
    val software: Software?,
) {
    /**
     * True while the pipeline has not produced a first release for this item.
     * The UI shows "looking this up" rather than an empty state — a real state
     * during onboarding, not an edge case (ADR-0003).
     */
    val isAwaitingFirstPoll: Boolean
        get() = software?.isAwaitingFirstPoll ?: (interest.softwareId != null)
}

/** Version timeline for one software item. */
class GetReleaseTimelineUseCase @Inject constructor(
    private val releaseRepository: ReleaseRepository,
) {
    operator fun invoke(softwareId: String): Flow<List<Release>> =
        releaseRepository.observeReleases(softwareId)
            .map { releases -> releases.sortedByDescending { it.sortTimestamp } }
}

/**
 * Follow or unfollow, from anywhere in the app.
 *
 * Centralised because the same toggle appears on the dashboard, in the library,
 * and on the detail screen, and three copies would drift.
 *
 * Unfollowing needs the existing [Interest], not just the software — the
 * repository owns the UID and the caller must not try to reconstruct a document
 * ID it cannot know.
 */
class ToggleFollowUseCase @Inject constructor(
    private val interestRepository: InterestRepository,
) {
    /** Follows [software], or unfollows it when [existing] is non-null. */
    suspend operator fun invoke(software: Software, existing: Interest?): Result<Unit> =
        if (existing != null) {
            interestRepository.unfollow(existing.id)
        } else {
            interestRepository.follow(software)
        }
}

/**
 * Toggles push notifications for an item without removing it from the library.
 *
 * "Tracked but silent" is a distinct state from "not tracked" — see
 * [Interest.following].
 */
class ToggleNotifyUseCase @Inject constructor(
    private val interestRepository: InterestRepository,
) {
    suspend operator fun invoke(interest: Interest): Result<Unit> =
        interestRepository.setNotifying(interest.id, !interest.following)
}
