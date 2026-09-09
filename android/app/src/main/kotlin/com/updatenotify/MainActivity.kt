package com.updatenotify

import android.Manifest
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.viewModels
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.updatenotify.core.designsystem.theme.UpdateNotifyTheme
import com.updatenotify.navigation.UpdateNotifyNavHost
import com.updatenotify.notification.UpdateNotifyMessagingService
import dagger.hilt.android.AndroidEntryPoint

@AndroidEntryPoint
class MainActivity : ComponentActivity() {

    private val viewModel: MainViewModel by viewModels()

    private val notificationPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) { granted ->
        // Only ask Firebase for a token once the user has agreed to be notified.
        if (granted) viewModel.registerForPush()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        val splashScreen = installSplashScreen()
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        var appState: AppState = AppState.Loading
        // Hold the splash until auth resolves, so an already-signed-in user never
        // sees the landing screen flash past.
        splashScreen.setKeepOnScreenCondition { appState == AppState.Loading }

        val startSoftwareId =
            intent?.getStringExtra(UpdateNotifyMessagingService.EXTRA_SOFTWARE_ID)

        setContent {
            val state by viewModel.appState.collectAsStateWithLifecycle()
            appState = state

            LaunchedEffect(state) {
                if (state == AppState.SignedIn) requestNotificationPermission()
            }

            UpdateNotifyTheme {
                UpdateNotifyNavHost(
                    isSignedIn = state == AppState.SignedIn,
                    serverClientId = BuildConfig.GOOGLE_WEB_CLIENT_ID,
                    startSoftwareId = startSoftwareId,
                )
            }
        }
    }

    /**
     * POST_NOTIFICATIONS is a runtime permission from Android 13. Below that it is
     * granted at install time and the token can be registered directly.
     */
    private fun requestNotificationPermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            notificationPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
        } else {
            viewModel.registerForPush()
        }
    }
}
