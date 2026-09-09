package com.updatenotify.core.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import coil3.compose.SubcomposeAsyncImage

/**
 * Software logo, falling back to a monogram.
 *
 * The fallback matters more than it looks: icons come from Clearbit by domain
 * guess, so a decent proportion will 404. A tile with the first letter is a
 * deliberate design element, not an error state.
 */
@Composable
fun SoftwareIcon(
    iconUrl: String?,
    name: String,
    modifier: Modifier = Modifier,
    size: Dp = 40.dp,
) {
    val shape = RoundedCornerShape(percent = 22)

    if (iconUrl.isNullOrBlank()) {
        MonogramTile(name, modifier, size, shape)
        return
    }

    SubcomposeAsyncImage(
        model = iconUrl,
        contentDescription = null, // decorative; the name is always adjacent
        contentScale = ContentScale.Fit,
        modifier = modifier
            .size(size)
            .clip(shape)
            .background(MaterialTheme.colorScheme.surfaceVariant),
        loading = { MonogramTile(name, Modifier, size, shape) },
        error = { MonogramTile(name, Modifier, size, shape) },
    )
}

@Composable
private fun MonogramTile(
    name: String,
    modifier: Modifier,
    size: Dp,
    shape: RoundedCornerShape,
) {
    Box(
        modifier = modifier
            .size(size)
            .clip(shape)
            .background(MaterialTheme.colorScheme.surfaceVariant),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = name.trim().take(1).uppercase().ifEmpty { "?" },
            style = MaterialTheme.typography.titleMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}
