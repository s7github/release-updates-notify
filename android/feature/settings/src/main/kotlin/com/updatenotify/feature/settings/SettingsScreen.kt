package com.updatenotify.feature.settings

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.updatenotify.core.ui.SoftwareIcon

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(
    onSignedOut: () -> Unit,
    modifier: Modifier = Modifier,
    viewModel: SettingsViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val snackbarHostState = remember { SnackbarHostState() }

    LaunchedEffect(state.message) {
        state.message?.let {
            snackbarHostState.showSnackbar(it)
            viewModel.dismissMessage()
        }
    }

    Scaffold(
        modifier = modifier,
        topBar = { TopAppBar(title = { Text("Settings") }) },
        snackbarHost = { SnackbarHost(snackbarHostState) },
    ) { padding ->
        val user = state.user
        Column(
            Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState()),
        ) {
            if (user != null) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(16.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    SoftwareIcon(
                        iconUrl = user.photoUrl,
                        name = user.displayName ?: user.email,
                        size = 48.dp,
                    )
                    Column {
                        Text(
                            text = user.displayName ?: "Signed in",
                            style = MaterialTheme.typography.titleMedium,
                            color = MaterialTheme.colorScheme.onSurface,
                        )
                        Text(
                            text = user.email,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
                HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
            }

            Text(
                text = "Notify me about",
                style = MaterialTheme.typography.labelLarge,
                color = MaterialTheme.colorScheme.primary,
                modifier = Modifier.padding(start = 16.dp, top = 20.dp, bottom = 4.dp),
            )

            val settings = user?.settings
            SettingToggle(
                title = "New features and updates",
                subtitle = "Feature releases and improvements",
                checked = settings?.notifyFeatures ?: true,
                enabled = user != null,
                onCheckedChange = { value ->
                    viewModel.updateSettings { it.copy(notifyFeatures = value) }
                },
            )
            SettingToggle(
                title = "Security patches",
                subtitle = "Fixes for known vulnerabilities",
                checked = settings?.notifySecurity ?: true,
                enabled = user != null,
                onCheckedChange = { value ->
                    viewModel.updateSettings { it.copy(notifySecurity = value) }
                },
            )
            SettingToggle(
                title = "Bug fixes",
                subtitle = "Patch releases and corrections",
                checked = settings?.notifyFixes ?: true,
                enabled = user != null,
                onCheckedChange = { value ->
                    viewModel.updateSettings { it.copy(notifyFixes = value) }
                },
            )
            SettingToggle(
                title = "Optimisations and tips",
                subtitle = "Performance work and usage notes",
                checked = settings?.notifyOptimizations ?: true,
                enabled = user != null,
                onCheckedChange = { value ->
                    viewModel.updateSettings { it.copy(notifyOptimizations = value) }
                },
            )

            Text(
                // Being explicit here heads off the obvious support question, and
                // it is a genuine product decision rather than an oversight.
                text = "Major releases are always sent.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
            )

            HorizontalDivider(
                color = MaterialTheme.colorScheme.outlineVariant,
                modifier = Modifier.padding(top = 12.dp),
            )

            TextButton(
                onClick = {
                    viewModel.signOut()
                    onSignedOut()
                },
                modifier = Modifier.padding(horizontal = 8.dp, vertical = 8.dp),
            ) {
                Text("Sign out", color = MaterialTheme.colorScheme.error)
            }
        }
    }
}

@Composable
private fun SettingToggle(
    title: String,
    subtitle: String,
    checked: Boolean,
    enabled: Boolean,
    onCheckedChange: (Boolean) -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(enabled = enabled) { onCheckedChange(!checked) }
            .padding(horizontal = 16.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Text(
                text = title,
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.onSurface,
            )
            Text(
                text = subtitle,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        Switch(checked = checked, onCheckedChange = onCheckedChange, enabled = enabled)
    }
}
