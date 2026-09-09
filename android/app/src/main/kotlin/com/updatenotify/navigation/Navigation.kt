package com.updatenotify.navigation

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.LibraryBooks
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.navigation.NavDestination.Companion.hierarchy
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import com.updatenotify.feature.auth.LandingScreen
import com.updatenotify.feature.dashboard.DashboardScreen
import com.updatenotify.feature.library.AddSoftwareScreen
import com.updatenotify.feature.library.LibraryScreen
import com.updatenotify.feature.settings.SettingsScreen
import com.updatenotify.feature.software.SoftwareDetailScreen
import com.updatenotify.feature.software.SoftwareDetailViewModel

/**
 * Routes are declared here, in `:app`, because feature modules may never depend
 * on one another (ADR-0007). This is the one place that knows they all exist.
 */
object Routes {
    const val LANDING = "landing"
    const val DASHBOARD = "dashboard"
    const val LIBRARY = "library"
    const val ADD_SOFTWARE = "library/add"
    const val SETTINGS = "settings"
    const val SOFTWARE_DETAIL = "software/{${SoftwareDetailViewModel.ARG_SOFTWARE_ID}}"

    fun softwareDetail(softwareId: String) = "software/$softwareId"
}

private data class TopLevelDestination(
    val route: String,
    val label: String,
    val icon: ImageVector,
)

private val topLevelDestinations = listOf(
    TopLevelDestination(Routes.DASHBOARD, "Updates", Icons.Filled.Notifications),
    TopLevelDestination(Routes.LIBRARY, "Library", Icons.AutoMirrored.Filled.LibraryBooks),
    TopLevelDestination(Routes.SETTINGS, "Settings", Icons.Filled.Settings),
)

@Composable
fun UpdateNotifyNavHost(
    isSignedIn: Boolean,
    serverClientId: String,
    startSoftwareId: String?,
    modifier: Modifier = Modifier,
    navController: NavHostController = rememberNavController(),
) {
    val backStackEntry by navController.currentBackStackEntryAsState()
    val currentRoute = backStackEntry?.destination

    val showBottomBar = currentRoute?.hierarchy?.any { destination ->
        topLevelDestinations.any { it.route == destination.route }
    } == true

    Scaffold(
        modifier = modifier,
        bottomBar = {
            // Animated rather than conditional so the bar slides out on the detail
            // screen instead of the content jumping.
            AnimatedVisibility(visible = showBottomBar && isSignedIn) {
                NavigationBar {
                    topLevelDestinations.forEach { destination ->
                        val selected = currentRoute?.hierarchy
                            ?.any { it.route == destination.route } == true
                        NavigationBarItem(
                            selected = selected,
                            onClick = {
                                navController.navigate(destination.route) {
                                    // Avoids growing an unbounded back stack of
                                    // tab switches.
                                    popUpTo(Routes.DASHBOARD) { saveState = true }
                                    launchSingleTop = true
                                    restoreState = true
                                }
                            },
                            icon = {
                                Icon(destination.icon, contentDescription = destination.label)
                            },
                            label = { Text(destination.label) },
                        )
                    }
                }
            }
        },
    ) { padding ->
        NavHost(
            navController = navController,
            startDestination = if (isSignedIn) Routes.DASHBOARD else Routes.LANDING,
            modifier = Modifier.padding(padding),
        ) {
            composable(Routes.LANDING) {
                LandingScreen(
                    serverClientId = serverClientId,
                    onSignedIn = {
                        navController.navigate(Routes.DASHBOARD) {
                            popUpTo(Routes.LANDING) { inclusive = true }
                        }
                    },
                )
            }

            composable(Routes.DASHBOARD) {
                DashboardScreen(
                    onReleaseClick = { navController.navigate(Routes.softwareDetail(it)) },
                    onBrowseLibrary = { navController.navigate(Routes.ADD_SOFTWARE) },
                )
            }

            composable(Routes.LIBRARY) {
                LibraryScreen(
                    onAddClick = { navController.navigate(Routes.ADD_SOFTWARE) },
                    onItemClick = { navController.navigate(Routes.softwareDetail(it)) },
                )
            }

            composable(Routes.ADD_SOFTWARE) {
                AddSoftwareScreen(onBack = { navController.popBackStack() })
            }

            composable(Routes.SETTINGS) {
                SettingsScreen(
                    onSignedOut = {
                        navController.navigate(Routes.LANDING) {
                            popUpTo(0) { inclusive = true }
                        }
                    },
                )
            }

            composable(Routes.SOFTWARE_DETAIL) {
                // The id is read from SavedStateHandle by the ViewModel.
                SoftwareDetailScreen(onBack = { navController.popBackStack() })
            }
        }
    }

    // Deep link from a notification tap: jump straight to the release that fired.
    if (startSoftwareId != null && isSignedIn) {
        androidx.compose.runtime.LaunchedEffect(startSoftwareId) {
            navController.navigate(Routes.softwareDetail(startSoftwareId))
        }
    }
}
