package com.updatenotify

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.google.firebase.messaging.FirebaseMessaging
import com.updatenotify.core.domain.repository.AuthRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import javax.inject.Inject

sealed interface AppState {
    data object Loading : AppState
    data object SignedOut : AppState
    data object SignedIn : AppState
}

@HiltViewModel
class MainViewModel @Inject constructor(
    private val authRepository: AuthRepository,
    private val messaging: FirebaseMessaging,
) : ViewModel() {

    val appState: StateFlow<AppState> = authRepository.currentUser
        .map { user -> if (user != null) AppState.SignedIn else AppState.SignedOut }
        .stateIn(
            scope = viewModelScope,
            started = SharingStarted.WhileSubscribed(5_000),
            // Loading keeps the splash screen up until auth resolves, so the app
            // never flashes the landing screen at an already-signed-in user.
            initialValue = AppState.Loading,
        )

    /**
     * Registers this device for push.
     *
     * Called after the notification permission is granted, not at startup:
     * requesting a token before the user has agreed to be notified is pointless,
     * and on Android 13+ the notification would be dropped anyway.
     */
    // FirebaseMessaging.token is marked deprecated in messaging 25.x, but the
    // artifact ships no replacement — getToken() is still the only way to obtain a
    // registration token. Suppressed deliberately; revisit when Firebase publishes
    // the successor API. Tracked in docs/STATUS.md.
    @Suppress("DEPRECATION")
    fun registerForPush() {
        viewModelScope.launch {
            runCatching {
                val token = messaging.token.await()
                authRepository.registerPushToken(token)
            }
        }
    }
}
