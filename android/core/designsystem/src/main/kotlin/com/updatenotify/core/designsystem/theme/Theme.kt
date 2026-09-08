package com.updatenotify.core.designsystem.theme

import android.os.Build
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.dynamicDarkColorScheme
import androidx.compose.material3.dynamicLightColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.platform.LocalContext

private val DarkColors = darkColorScheme(
    primary = BrandOrange,
    onPrimary = Color_OnBrand,
    primaryContainer = BrandOrangeDark,
    onPrimaryContainer = TextPrimaryDark,
    secondary = BrandOrangeLight,
    background = SurfaceBlack,
    onBackground = TextPrimaryDark,
    surface = SurfacePaper,
    onSurface = TextPrimaryDark,
    surfaceVariant = SurfaceElevated,
    onSurfaceVariant = TextSecondaryDark,
    outline = TextSecondaryDark,
    outlineVariant = OutlineDark,
    error = CategorySecurity,
)

private val LightColors = lightColorScheme(
    primary = BrandOrangeDark,
    onPrimary = TextPrimaryDark,
    primaryContainer = BrandOrangeLight,
    onPrimaryContainer = TextPrimaryLight,
    secondary = BrandOrange,
    background = SurfaceWhite,
    onBackground = TextPrimaryLight,
    surface = SurfaceWhite,
    onSurface = TextPrimaryLight,
    surfaceVariant = SurfacePaperLight,
    onSurfaceVariant = TextSecondaryLight,
    outline = TextSecondaryLight,
    outlineVariant = OutlineLight,
    error = CategorySecurity,
)

/**
 * @param dynamicColor Material You colour extraction, on by default where the
 * platform supports it (Android 12+). Users expect their wallpaper palette; the
 * brand orange stays as the category accent regardless.
 */
@Composable
fun UpdateNotifyTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    dynamicColor: Boolean = true,
    content: @Composable () -> Unit,
) {
    val colorScheme = when {
        dynamicColor && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S -> {
            val context = LocalContext.current
            if (darkTheme) dynamicDarkColorScheme(context) else dynamicLightColorScheme(context)
        }

        darkTheme -> DarkColors
        else -> LightColors
    }

    MaterialTheme(
        colorScheme = colorScheme,
        typography = UpdateNotifyTypography,
        shapes = UpdateNotifyShapes,
        content = content,
    )
}
