package com.updatenotify.core.designsystem.theme

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.BugReport
import androidx.compose.material.icons.automirrored.filled.HelpOutline
import androidx.compose.material.icons.filled.RocketLaunch
import androidx.compose.material.icons.filled.Security
import androidx.compose.material.icons.filled.Speed
import androidx.compose.material.icons.filled.Upgrade
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import com.updatenotify.core.model.ReleaseCategory

/**
 * How a category is rendered.
 *
 * Colour is always paired with an icon and a label — never colour alone. Category
 * is the app's primary signal, so it has to survive colour-vision deficiency and
 * greyscale screenshots.
 */
data class CategoryStyle(
    val color: Color,
    val icon: ImageVector,
    val label: String,
)

val ReleaseCategory.style: CategoryStyle
    get() = when (this) {
        ReleaseCategory.NEW_FEATURES -> CategoryStyle(
            CategoryNewFeatures, Icons.Filled.AutoAwesome, "New features",
        )

        ReleaseCategory.FEATURE_UPDATES -> CategoryStyle(
            CategoryFeatureUpdates, Icons.Filled.Upgrade, "Feature update",
        )

        ReleaseCategory.OPTIMIZATION -> CategoryStyle(
            CategoryOptimization, Icons.Filled.Speed, "Optimisation",
        )

        ReleaseCategory.BUG_FIXES -> CategoryStyle(
            CategoryBugFixes, Icons.Filled.BugReport, "Bug fixes",
        )

        ReleaseCategory.SECURITY_PATCHES -> CategoryStyle(
            CategorySecurity, Icons.Filled.Security, "Security patch",
        )

        ReleaseCategory.MAJOR_MILESTONE -> CategoryStyle(
            CategoryMilestone, Icons.Filled.RocketLaunch, "Major release",
        )

        // Reachable: extraction is non-deterministic and will eventually return
        // something off-list. Render it rather than dropping the release.
        ReleaseCategory.UNKNOWN -> CategoryStyle(
            CategoryBugFixes, Icons.AutoMirrored.Filled.HelpOutline, "Update",
        )
    }
