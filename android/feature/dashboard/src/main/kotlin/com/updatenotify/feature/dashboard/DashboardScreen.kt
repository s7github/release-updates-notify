package com.updatenotify.feature.dashboard

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Inbox
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.updatenotify.core.designsystem.component.MessageState
import com.updatenotify.core.designsystem.theme.style
import com.updatenotify.core.model.ReleaseCategory
import com.updatenotify.core.ui.ReleaseCard

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DashboardScreen(
    onReleaseClick: (softwareId: String) -> Unit,
    onBrowseLibrary: () -> Unit,
    modifier: Modifier = Modifier,
    viewModel: DashboardViewModel = hiltViewModel(),
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
        topBar = { TopAppBar(title = { Text("Updates") }) },
        snackbarHost = { SnackbarHost(snackbarHostState) },
    ) { padding ->
        PullToRefreshBox(
            isRefreshing = state.isRefreshing,
            onRefresh = viewModel::refresh,
            modifier = Modifier
                .fillMaxSize()
                .padding(padding),
        ) {
            if (state.isEmpty) {
                MessageState(
                    icon = Icons.Filled.Inbox,
                    title = if (state.activeFilters.isEmpty()) {
                        "Nothing here yet"
                    } else {
                        "Nothing matches those filters"
                    },
                    body = if (state.activeFilters.isEmpty()) {
                        "Follow some software and releases will show up here as " +
                            "they ship."
                    } else {
                        "Try clearing a filter to see more."
                    },
                    actionLabel = if (state.activeFilters.isEmpty()) {
                        "Find software"
                    } else {
                        "Clear filters"
                    },
                    action = if (state.activeFilters.isEmpty()) {
                        onBrowseLibrary
                    } else {
                        viewModel::clearFilters
                    },
                )
                return@PullToRefreshBox
            }

            LazyColumn(
                contentPadding = PaddingValues(16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                item {
                    CategoryFilterRow(
                        active = state.activeFilters,
                        onToggle = viewModel::toggleFilter,
                    )
                }

                items(state.items, key = { it.release.id }) { item ->
                    ReleaseCard(
                        release = item.release,
                        iconUrl = item.iconUrl,
                        onClick = { onReleaseClick(item.release.softwareId) },
                    )
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun CategoryFilterRow(
    active: Set<ReleaseCategory>,
    onToggle: (ReleaseCategory) -> Unit,
) {
    // UNKNOWN is a fallback for bad extraction, not something to filter on.
    val categories = remember {
        ReleaseCategory.entries.filter { it != ReleaseCategory.UNKNOWN }
    }

    LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        items(categories) { category ->
            val style = category.style
            FilterChip(
                selected = category in active,
                onClick = { onToggle(category) },
                label = { Text(style.label, style = MaterialTheme.typography.labelMedium) },
                colors = FilterChipDefaults.filterChipColors(
                    selectedContainerColor = style.color.copy(alpha = 0.2f),
                    selectedLabelColor = style.color,
                ),
            )
        }
    }
}
