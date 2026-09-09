package com.updatenotify.feature.library

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.updatenotify.core.domain.repository.InterestRepository
import com.updatenotify.core.domain.repository.SoftwareRepository
import com.updatenotify.core.model.Software
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.FlowPreview
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.debounce
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.launchIn
import kotlinx.coroutines.flow.onEach
import kotlinx.coroutines.launch
import javax.inject.Inject

data class AddSoftwareUiState(
    val query: String = "",
    val results: List<Software> = emptyList(),
    val isSearching: Boolean = false,
    val isDiscovering: Boolean = false,
    val message: String? = null,
    val addedSoftwareId: String? = null,
) {
    /**
     * Offer "search the web for this" only once a local search has actually come
     * back empty. Showing it while results are still loading invites the user to
     * spend a Gemini call on something already in the catalog.
     */
    val canDiscover: Boolean
        get() = query.isNotBlank() && !isSearching && results.isEmpty()
}

@HiltViewModel
class AddSoftwareViewModel @Inject constructor(
    private val softwareRepository: SoftwareRepository,
    private val interestRepository: InterestRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(AddSoftwareUiState())
    val uiState: StateFlow<AddSoftwareUiState> = _uiState.asStateFlow()

    private val queryFlow = MutableStateFlow("")

    init {
        @OptIn(FlowPreview::class)
        queryFlow
            // Debounced so typing does not fire a Firestore query per keystroke;
            // reads are billed.
            .debounce(SEARCH_DEBOUNCE_MS)
            .distinctUntilChanged()
            .onEach { query -> search(query) }
            .launchIn(viewModelScope)
    }

    fun onQueryChange(query: String) {
        _uiState.value = _uiState.value.copy(query = query)
        queryFlow.value = query
    }

    private suspend fun search(query: String) {
        if (query.isBlank()) {
            _uiState.value = _uiState.value.copy(results = emptyList(), isSearching = false)
            return
        }
        _uiState.value = _uiState.value.copy(isSearching = true)
        softwareRepository.searchCatalog(query).fold(
            onSuccess = { results ->
                _uiState.value = _uiState.value.copy(results = results, isSearching = false)
            },
            onFailure = { error ->
                _uiState.value = _uiState.value.copy(
                    isSearching = false,
                    message = error.message ?: "Search failed",
                )
            },
        )
    }

    /**
     * Asks the backend to find sources for something not in the catalog.
     *
     * This costs a Gemini call, so it is an explicit user action rather than an
     * automatic fallback from an empty search (ADR-0003).
     */
    fun discover() {
        val query = _uiState.value.query.trim()
        if (query.isEmpty() || _uiState.value.isDiscovering) return

        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isDiscovering = true)
            softwareRepository.requestDiscovery(query).fold(
                onSuccess = { software ->
                    interestRepository.follow(software)
                    _uiState.value = _uiState.value.copy(
                        isDiscovering = false,
                        addedSoftwareId = software.id,
                        message = "Added ${software.name}. Looking for release notes…",
                    )
                },
                onFailure = { error ->
                    _uiState.value = _uiState.value.copy(
                        isDiscovering = false,
                        message = error.message ?: "Could not find that",
                    )
                },
            )
        }
    }

    fun follow(software: Software) {
        viewModelScope.launch {
            interestRepository.follow(software).fold(
                onSuccess = {
                    _uiState.value = _uiState.value.copy(
                        addedSoftwareId = software.id,
                        message = "Following ${software.name}",
                    )
                },
                onFailure = { error ->
                    _uiState.value = _uiState.value.copy(
                        message = error.message ?: "Could not follow",
                    )
                },
            )
        }
    }

    /** Free-text topics are followed without a catalog entry. */
    fun followTopic() {
        val topic = _uiState.value.query.trim()
        if (topic.isEmpty()) return
        viewModelScope.launch {
            interestRepository.followTopic(topic).fold(
                onSuccess = {
                    _uiState.value = _uiState.value.copy(
                        query = "",
                        results = emptyList(),
                        message = "Tracking \"$topic\"",
                    )
                },
                onFailure = { error ->
                    _uiState.value = _uiState.value.copy(
                        message = error.message ?: "Could not add topic",
                    )
                },
            )
        }
    }

    fun dismissMessage() {
        _uiState.value = _uiState.value.copy(message = null)
    }

    private companion object {
        const val SEARCH_DEBOUNCE_MS = 300L
    }
}
