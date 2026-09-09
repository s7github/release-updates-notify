package com.updatenotify.feature.auth

import android.content.Context
import androidx.credentials.CredentialManager
import androidx.credentials.GetCredentialRequest
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.google.android.libraries.identity.googleid.GetGoogleIdOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import com.updatenotify.core.domain.repository.AuthRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

sealed interface AuthUiState {
    data object Idle : AuthUiState
    data object SigningIn : AuthUiState
    data object Success : AuthUiState
    data class Error(val message: String) : AuthUiState
}

@HiltViewModel
class AuthViewModel @Inject constructor(
    private val authRepository: AuthRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow<AuthUiState>(AuthUiState.Idle)
    val uiState: StateFlow<AuthUiState> = _uiState.asStateFlow()

    /**
     * Google Sign-In through Credential Manager.
     *
     * [serverClientId] is the **web** OAuth client id from the Firebase console,
     * not the Android one — a detail that costs everybody an afternoon exactly
     * once. See docs/SETUP.md.
     */
    fun signIn(context: Context, serverClientId: String) {
        if (_uiState.value == AuthUiState.SigningIn) return
        _uiState.value = AuthUiState.SigningIn

        viewModelScope.launch {
            runCatching {
                val option = GetGoogleIdOption.Builder()
                    // false so the sheet also offers accounts that have never used
                    // this app; true shows nothing at all on a first install.
                    .setFilterByAuthorizedAccounts(false)
                    .setServerClientId(serverClientId)
                    .setAutoSelectEnabled(true)
                    .build()

                val request = GetCredentialRequest.Builder()
                    .addCredentialOption(option)
                    .build()

                val response = CredentialManager.create(context)
                    .getCredential(context, request)

                val credential = GoogleIdTokenCredential
                    .createFrom(response.credential.data)

                authRepository.signInWithGoogle(credential.idToken).getOrThrow()
            }.fold(
                onSuccess = { _uiState.value = AuthUiState.Success },
                onFailure = { error ->
                    _uiState.value = AuthUiState.Error(
                        error.message ?: "Sign-in failed. Please try again.",
                    )
                },
            )
        }
    }

    fun dismissError() {
        if (_uiState.value is AuthUiState.Error) _uiState.value = AuthUiState.Idle
    }
}
