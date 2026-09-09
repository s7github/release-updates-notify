package com.updatenotify.feature.software

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.HourglassEmpty
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.updatenotify.core.designsystem.component.CategoryChip
import com.updatenotify.core.designsystem.component.LoadingState
import com.updatenotify.core.designsystem.component.MessageState
import com.updatenotify.core.designsystem.theme.style
import com.updatenotify.core.model.Release
import com.updatenotify.core.ui.SoftwareIcon
import com.updatenotify.core.ui.rememberMarkdown
import com.updatenotify.core.ui.rememberRelativeTime

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SoftwareDetailScreen(
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
    viewModel: SoftwareDetailViewModel = hiltViewModel(),
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
        topBar = {
            TopAppBar(
                title = { Text(state.software?.name ?: "") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
                actions = {
                    IconButton(
                        onClick = viewModel::requestRefresh,
                        enabled = state.activeTask == null,
                    ) {
                        Icon(Icons.Filled.Refresh, contentDescription = "Check for updates")
                    }
                },
            )
        },
        snackbarHost = { SnackbarHost(snackbarHostState) },
    ) { padding ->
        val software = state.software
        if (software == null) {
            LoadingState(Modifier.padding(padding))
            return@Scaffold
        }

        Column(
            Modifier
                .fillMaxSize()
                .padding(padding),
        ) {
            // Live progress from the pipeline's task document — a real bar rather
            // than an indeterminate spinner, because the backend reports percent.
            state.activeTask?.let { task ->
                Column(Modifier.padding(horizontal = 16.dp, vertical = 8.dp)) {
                    Text(
                        text = task.message.ifBlank { "Working…" },
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    LinearProgressIndicator(
                        progress = { task.progress / 100f },
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(top = 4.dp),
                    )
                }
            }

            SoftwareHeader(
                name = software.name,
                vendor = software.vendor,
                iconUrl = software.iconUrl,
                latestVersion = software.lastVersion,
                isFollowing = state.isFollowing,
                onToggleFollow = viewModel::toggleFollow,
            )

            HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)

            when {
                state.isAwaitingFirstPoll -> MessageState(
                    icon = Icons.Filled.HourglassEmpty,
                    title = "Looking for release notes",
                    body = "We are searching for this project's changelog. " +
                        "Check back in a few minutes.",
                )

                state.releases.isEmpty() -> MessageState(
                    icon = Icons.Filled.HourglassEmpty,
                    title = "No releases yet",
                    body = "Nothing has been published for this since we started watching.",
                    actionLabel = "Check now",
                    action = viewModel::requestRefresh,
                )

                else -> LazyColumn(contentPadding = PaddingValues(16.dp)) {
                    items(state.releases, key = { it.id }) { release ->
                        TimelineEntry(release)
                    }
                }
            }
        }
    }
}

@Composable
private fun SoftwareHeader(
    name: String,
    vendor: String?,
    iconUrl: String?,
    latestVersion: String?,
    isFollowing: Boolean,
    onToggleFollow: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(16.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        SoftwareIcon(iconUrl = iconUrl, name = name, size = 56.dp)

        Column(Modifier.weight(1f)) {
            Text(
                text = name,
                style = MaterialTheme.typography.titleLarge,
                color = MaterialTheme.colorScheme.onSurface,
            )
            Text(
                text = listOfNotNull(vendor, latestVersion?.let { "v$it" })
                    .joinToString(" · ")
                    .ifBlank { "Tracked" },
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }

        if (isFollowing) {
            OutlinedButton(onClick = onToggleFollow) { Text("Following") }
        } else {
            Button(onClick = onToggleFollow) { Text("Follow") }
        }
    }
}

/**
 * One release in the version timeline.
 *
 * The rail down the left is what makes this read as a history rather than a list
 * of cards — it is the same affordance the web app's desktop timeline uses.
 */
@Composable
private fun TimelineEntry(release: Release) {
    Row(Modifier.fillMaxWidth()) {
        // The rail: a category-coloured marker with a connecting line beneath it.
        // This is what makes the screen read as a history rather than a card list.
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            modifier = Modifier.width(24.dp),
        ) {
            Icon(
                imageVector = release.category.style.icon,
                contentDescription = null,
                tint = release.category.style.color,
                modifier = Modifier
                    .padding(top = 4.dp)
                    .size(14.dp),
            )
            Box(
                Modifier
                    .padding(top = 4.dp)
                    .width(1.dp)
                    .height(72.dp)
                    .background(MaterialTheme.colorScheme.outlineVariant),
            )
        }

        Column(
            modifier = Modifier
                .weight(1f)
                .padding(start = 12.dp, bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Text(
                    text = release.version,
                    style = MaterialTheme.typography.titleMedium,
                    fontFamily = FontFamily.Monospace,
                    color = MaterialTheme.colorScheme.onSurface,
                )
                Text(
                    text = rememberRelativeTime(release.sortTimestamp),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            CategoryChip(style = release.category.style)

            if (release.summary.isNotBlank()) {
                Text(
                    text = rememberMarkdown(release.summary),
                    style = MaterialTheme.typography.bodyMedium,
                )
            }
        }
    }
}
