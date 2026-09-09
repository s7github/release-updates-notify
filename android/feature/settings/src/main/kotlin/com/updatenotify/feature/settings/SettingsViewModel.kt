package com.updatenotify.feature.settings

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.updatenotify.core.domain.repository.AuthRepository
import com.updatenotify.core.model.NotificationSettings
import com.updatenotify.core.model.User
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import javax.inject.Inject

data class SettingsUiState(
    val user: User? = null,
    val message: String? = null,
)

@HiltViewModel
class SettingsViewModel @Inject constructor(
    private val authRepository: AuthRepository,
) : ViewModel() {

    private val message = MutableStateFlow<String?>(null)

    val uiState: StateFlow<SettingsUiState> =
        combine(authRepository.currentUser, message) { user, msg ->
            SettingsUiState(user = user, message = msg)
        }.stateIn(
            scope = viewModelScope,
            started = SharingStarted.WhileSubscribed(5_000),
            initialValue = SettingsUiState(),
        )

    /**
     * Preferences are enforced server-side by the notifier before a push is sent
     * (ADR-0008), so a muted category costs no battery and never reaches the
     * device at all.
     */
    fun updateSettings(transform: (NotificationSettings) -> NotificationSettings) {
        val current = uiState.value.user?.settings ?: return
        viewModelScope.launch {
            authRepository.updateNotificationSettings(transform(current)).onFailure {
                message.value = it.message ?: "Could not save that"
            }
        }
    }

    fun signOut() {
        viewModelScope.launch { authRepository.signOut() }
    }

    fun dismissMessage() {
        message.value = null
    }
}
