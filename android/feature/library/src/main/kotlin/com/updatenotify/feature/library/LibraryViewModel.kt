package com.updatenotify.feature.library

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.updatenotify.core.domain.repository.InterestRepository
import com.updatenotify.core.domain.usecase.GetLibraryUseCase
import com.updatenotify.core.domain.usecase.LibraryItem
import com.updatenotify.core.domain.usecase.ToggleNotifyUseCase
import com.updatenotify.core.model.Interest
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import javax.inject.Inject

data class LibraryUiState(
    val items: List<LibraryItem> = emptyList(),
    val errorMessage: String? = null,
)

@HiltViewModel
class LibraryViewModel @Inject constructor(
    getLibrary: GetLibraryUseCase,
    private val toggleNotify: ToggleNotifyUseCase,
    private val interestRepository: InterestRepository,
) : ViewModel() {

    private val error = MutableStateFlow<String?>(null)

    val uiState: StateFlow<LibraryUiState> =
        combine(getLibrary(), error) { items, err ->
            LibraryUiState(items = items, errorMessage = err)
        }.stateIn(
            scope = viewModelScope,
            started = SharingStarted.WhileSubscribed(5_000),
            initialValue = LibraryUiState(),
        )

    /** Mutes or unmutes an item without removing it from the library. */
    fun toggleNotifications(interest: Interest) {
        viewModelScope.launch {
            toggleNotify(interest).onFailure {
                error.value = it.message ?: "Could not update notifications"
            }
        }
    }

    fun unfollow(interest: Interest) {
        viewModelScope.launch {
            interestRepository.unfollow(interest.id).onFailure {
                error.value = it.message ?: "Could not remove"
            }
        }
    }

    fun dismissError() {
        error.value = null
    }
}
