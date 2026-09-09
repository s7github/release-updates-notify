package com.updatenotify.feature.dashboard

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.updatenotify.core.domain.repository.ReleaseRepository
import com.updatenotify.core.domain.usecase.FeedItem
import com.updatenotify.core.domain.usecase.GetFeedUseCase
import com.updatenotify.core.model.ReleaseCategory
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import javax.inject.Inject

data class DashboardUiState(
    val items: List<FeedItem> = emptyList(),
    val activeFilters: Set<ReleaseCategory> = emptySet(),
    val isRefreshing: Boolean = false,
    val errorMessage: String? = null,
) {
    /**
     * Distinguishes "you follow nothing" from "you follow things but the pipeline
     * has not produced a release yet". Both look like an empty list; only one is
     * the user's problem to solve.
     */
    val isEmpty: Boolean get() = items.isEmpty()
}

@HiltViewModel
class DashboardViewModel @Inject constructor(
    getFeed: GetFeedUseCase,
    private val releaseRepository: ReleaseRepository,
) : ViewModel() {

    private val filters = MutableStateFlow<Set<ReleaseCategory>>(emptySet())
    private val refreshing = MutableStateFlow(false)
    private val error = MutableStateFlow<String?>(null)

    @OptIn(ExperimentalCoroutinesApi::class)
    private val feed = filters.flatMapLatest { active -> getFeed(active) }

    val uiState: StateFlow<DashboardUiState> =
        combine(feed, filters, refreshing, error) { items, active, isRefreshing, err ->
            DashboardUiState(
                items = items,
                activeFilters = active,
                isRefreshing = isRefreshing,
                errorMessage = err,
            )
        }.stateIn(
            scope = viewModelScope,
            // Survives a configuration change without re-querying, and stops the
            // Room listener when the screen is genuinely gone.
            started = SharingStarted.WhileSubscribed(5_000),
            initialValue = DashboardUiState(),
        )

    fun toggleFilter(category: ReleaseCategory) {
        filters.value = filters.value.let { current ->
            if (category in current) current - category else current + category
        }
    }

    fun clearFilters() {
        filters.value = emptySet()
    }

    /** Pulls anything new from Firestore. Does not trigger a backend poll. */
    fun refresh() {
        if (refreshing.value) return
        viewModelScope.launch {
            refreshing.value = true
            releaseRepository.sync()
                .onFailure { error.value = it.message ?: "Could not refresh" }
            refreshing.value = false
        }
    }

    fun dismissError() {
        error.value = null
    }
}
