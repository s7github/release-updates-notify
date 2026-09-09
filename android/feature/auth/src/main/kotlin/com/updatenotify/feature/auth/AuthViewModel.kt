package com.updatenotify.feature.auth

import android.content.Context
import androidx.credentials.CredentialManager
import androidx.credentials.CustomCredential
import androidx.credentials.GetCredentialRequest
import androidx.credentials.exceptions.GetCredentialCancellationException
import androidx.credentials.exceptions.GetCredentialException
import androidx.credentials.exceptions.NoCredentialException
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
import kotlin.coroutines.cancellation.CancellationException
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
            try {
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

                val credential = response.credential
                // Credential Manager can return other credential types. Reading a
                // non-Google credential as one throws deep inside createFrom, so the
                // type is checked here where the message can be useful.
                if (credential !is CustomCredential ||
                    credential.type != GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL
                ) {
                    _uiState.value = AuthUiState.Error(
                        "Unexpected sign-in response. Please try again.",
                    )
                    return@launch
                }

                val googleCredential = GoogleIdTokenCredential.createFrom(credential.data)
                authRepository.signInWithGoogle(googleCredential.idToken).getOrThrow()
                _uiState.value = AuthUiState.Success
            } catch (cancellation: CancellationException) {
                // Structured concurrency: the ViewModel scope was cancelled, not the
                // user. Must propagate or the coroutine machinery breaks.
                throw cancellation
            } catch (dismissed: GetCredentialCancellationException) {
                // The person closed the sheet. That is a decision, not a failure —
                // showing them an error for it is the app arguing with them.
                _uiState.value = AuthUiState.Idle
            } catch (noCredential: NoCredentialException) {
                // No Google account on the device. "Try again" is useless advice
                // here; the fix is in system settings.
                _uiState.value = AuthUiState.Error(
                    "No Google account found on this device. Add one in Settings, " +
                        "then try again.",
                )
            } catch (credentialError: GetCredentialException) {
                // Play Services missing or out of date, no network, provider error.
                _uiState.value = AuthUiState.Error(
                    "Could not reach Google Sign-In. Check your connection and " +
                        "try again.",
                )
            } catch (error: Exception) {
                _uiState.value = AuthUiState.Error(
                    error.message ?: "Sign-in failed. Please try again.",
                )
            }
        }
    }

    fun dismissError() {
        if (_uiState.value is AuthUiState.Error) _uiState.value = AuthUiState.Idle
    }
}
