package com.updatenotify.feature.library

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.LibraryAddCheck
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.NotificationsOff
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
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
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.updatenotify.core.designsystem.component.MessageState
import com.updatenotify.core.domain.usecase.LibraryItem
import com.updatenotify.core.ui.SoftwareIcon

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LibraryScreen(
    onAddClick: () -> Unit,
    onItemClick: (softwareId: String) -> Unit,
    modifier: Modifier = Modifier,
    viewModel: LibraryViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val snackbarHostState = remember { SnackbarHostState() }

    LaunchedEffect(state.errorMessage) {
        state.errorMessage?.let {
            snackbarHostState.showSnackbar(it)
            viewModel.dismissError()
        }
    }

    Scaffold(
        modifier = modifier,
        topBar = { TopAppBar(title = { Text("Library") }) },
        snackbarHost = { SnackbarHost(snackbarHostState) },
        floatingActionButton = {
            FloatingActionButton(onClick = onAddClick) {
                Icon(Icons.Filled.Add, contentDescription = "Add software or topic")
            }
        },
    ) { padding ->
        if (state.items.isEmpty()) {
            MessageState(
                icon = Icons.Filled.LibraryAddCheck,
                title = "Your library is empty",
                body = "Add software or a topic and we will watch its releases for you.",
                actionLabel = "Add something",
                action = onAddClick,
                modifier = Modifier.padding(padding),
            )
            return@Scaffold
        }

        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding),
            contentPadding = PaddingValues(vertical = 8.dp),
        ) {
            items(state.items, key = { it.interest.id }) { item ->
                LibraryRow(
                    item = item,
                    onClick = { item.interest.softwareId?.let(onItemClick) },
                    onToggleNotify = { viewModel.toggleNotifications(item.interest) },
                )
            }
        }
    }
}

@Composable
private fun LibraryRow(
    item: LibraryItem,
    onClick: () -> Unit,
    onToggleNotify: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(enabled = item.interest.softwareId != null, onClick = onClick)
            .padding(horizontal = 16.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        SoftwareIcon(
            iconUrl = item.software?.iconUrl,
            name = item.interest.softwareName,
        )

        Column(Modifier.weight(1f)) {
            Text(
                text = item.interest.softwareName,
                style = MaterialTheme.typography.titleMedium,
                color = MaterialTheme.colorScheme.onSurface,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                text = when {
                    // "Looking this up" is a real state during onboarding, not an
                    // error — the pipeline populates a new entry asynchronously.
                    item.isAwaitingFirstPoll -> "Looking for release notes…"
                    item.software?.lastVersion != null ->
                        "Latest ${item.software?.lastVersion}"

                    else -> "Topic"
                },
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }

        IconButton(onClick = onToggleNotify) {
            Icon(
                imageVector = if (item.interest.following) {
                    Icons.Filled.Notifications
                } else {
                    Icons.Filled.NotificationsOff
                },
                contentDescription = if (item.interest.following) {
                    "Mute ${item.interest.softwareName}"
                } else {
                    "Notify me about ${item.interest.softwareName}"
                },
                tint = if (item.interest.following) {
                    MaterialTheme.colorScheme.primary
                } else {
                    MaterialTheme.colorScheme.onSurfaceVariant
                },
            )
        }
    }
}
