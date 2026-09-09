package com.updatenotify.feature.library

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.TravelExplore
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
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
import com.updatenotify.core.model.Software
import com.updatenotify.core.ui.SoftwareIcon

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AddSoftwareScreen(
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
    viewModel: AddSoftwareViewModel = hiltViewModel(),
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
                title = { Text("Add to library") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
            )
        },
        snackbarHost = { SnackbarHost(snackbarHostState) },
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding),
        ) {
            OutlinedTextField(
                value = state.query,
                onValueChange = viewModel::onQueryChange,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(16.dp),
                label = { Text("Software or topic") },
                placeholder = { Text("e.g. Suno, macOS, FL Studio") },
                leadingIcon = { Icon(Icons.Filled.Search, contentDescription = null) },
                singleLine = true,
            )

            if (state.isSearching || state.isDiscovering) {
                LinearProgressIndicator(Modifier.fillMaxWidth())
            }

            LazyColumn(Modifier.weight(1f)) {
                items(state.results, key = { it.id }) { software ->
                    SearchResultRow(
                        software = software,
                        onFollow = { viewModel.follow(software) },
                    )
                }

                if (state.canDiscover) {
                    item {
                        DiscoverPrompt(
                            query = state.query,
                            isDiscovering = state.isDiscovering,
                            onDiscover = viewModel::discover,
                            onAddTopic = viewModel::followTopic,
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun SearchResultRow(software: Software, onFollow: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onFollow)
            .padding(horizontal = 16.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        SoftwareIcon(iconUrl = software.iconUrl, name = software.name)
        Column(Modifier.weight(1f)) {
            Text(
                text = software.name,
                style = MaterialTheme.typography.titleMedium,
                color = MaterialTheme.colorScheme.onSurface,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            software.vendor?.let { vendor ->
                Text(
                    text = vendor,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
        Button(onClick = onFollow) { Text("Follow") }
    }
}

/**
 * Shown only when the catalog has nothing.
 *
 * Two distinct offers, because they cost differently: tracking a topic is free
 * and local, while discovery spends a backend Gemini call. Making that an
 * explicit choice rather than an automatic fallback keeps the bill predictable.
 */
@Composable
private fun DiscoverPrompt(
    query: String,
    isDiscovering: Boolean,
    onDiscover: () -> Unit,
    onAddTopic: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Icon(
            imageVector = Icons.Filled.TravelExplore,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.size(40.dp),
        )
        Text(
            text = "\"$query\" is not in the catalog yet",
            style = MaterialTheme.typography.titleMedium,
            color = MaterialTheme.colorScheme.onSurface,
        )
        Text(
            text = "We can search the web for its official changelog, or just track " +
                "it as a topic.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Button(onClick = onDiscover, enabled = !isDiscovering) {
            if (isDiscovering) {
                CircularProgressIndicator(
                    modifier = Modifier.size(18.dp),
                    strokeWidth = 2.dp,
                    color = MaterialTheme.colorScheme.onPrimary,
                )
            } else {
                Text("Find its changelog")
            }
        }
        OutlinedButton(onClick = onAddTopic, enabled = !isDiscovering) {
            Text("Track as a topic")
        }
    }
}
