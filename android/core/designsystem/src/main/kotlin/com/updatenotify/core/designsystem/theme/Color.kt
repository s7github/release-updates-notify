package com.updatenotify.core.designsystem.theme

import androidx.compose.ui.graphics.Color

/**
 * Palette carried over from the web app (`web/src/theme.ts`) so the two surfaces
 * stay recognisably the same product: warm orange on near-black.
 *
 * The web app is dark-only. Android users expect to be able to follow the system
 * theme, so a light scheme is derived here — same hues, inverted surfaces.
 */

// Brand
val BrandOrange = Color(0xFFF27D26)
val BrandOrangeDark = Color(0xFFC25F16)
val BrandOrangeLight = Color(0xFFFFB27A)

// Dark surfaces — from the web palette
val SurfaceBlack = Color(0xFF050505)
val SurfacePaper = Color(0xFF151619)
val SurfaceElevated = Color(0xFF1E2024)
val TextPrimaryDark = Color(0xFFFFFFFF)
val TextSecondaryDark = Color(0xFF8E9299)
val OutlineDark = Color(0x1AFFFFFF)

// Light surfaces
val SurfaceWhite = Color(0xFFFDFCFB)
val SurfacePaperLight = Color(0xFFF4F2F0)
val TextPrimaryLight = Color(0xFF1A1A1A)
val TextSecondaryLight = Color(0xFF5F6368)
val OutlineLight = Color(0x1A000000)

/**
 * Per-category accents.
 *
 * Category is the app's primary signal — it is what the user filters and mutes on
 * — so it gets a colour, not just a label. Security and milestone releases read
 * as urgent; fixes and optimisations read as calm. Deliberately never colour
 * alone: every use is paired with an icon and text, since roughly 8% of men have
 * some form of colour-vision deficiency.
 */
val CategoryNewFeatures = Color(0xFF3ECF8E)
val CategoryFeatureUpdates = Color(0xFF4A90D9)
val CategoryOptimization = Color(0xFF9B8AFB)
val CategoryBugFixes = Color(0xFF8E9299)
val CategorySecurity = Color(0xFFE5484D)
val CategoryMilestone = Color(0xFFF27D26)

/** Text/icon colour on top of the brand orange. Dark, for contrast against a warm mid-tone. */
val Color_OnBrand = Color(0xFF1A0E04)
