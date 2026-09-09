package com.updatenotify.core.ui

import android.content.Context
import android.text.format.DateUtils
import androidx.compose.runtime.Composable
import androidx.compose.ui.platform.LocalContext
import java.text.DateFormat
import java.util.Date

/**
 * Relative time ("2 days ago") for recent items, absolute dates for older ones.
 *
 * Uses the platform formatter so it is localised and respects the user's locale
 * and 12/24-hour preference without shipping a date library.
 */
@Composable
fun rememberRelativeTime(epochMillis: Long?): String {
    val context = LocalContext.current
    return formatRelativeTime(context, epochMillis)
}

fun formatRelativeTime(context: Context, epochMillis: Long?): String {
    if (epochMillis == null || epochMillis <= 0L) return ""
    val now = System.currentTimeMillis()
    val age = now - epochMillis

    // Past ~30 days, "42 days ago" stops being useful and a date reads better.
    return if (age in 0 until THIRTY_DAYS_MS) {
        DateUtils.getRelativeTimeSpanString(
            epochMillis,
            now,
            DateUtils.MINUTE_IN_MILLIS,
            DateUtils.FORMAT_ABBREV_RELATIVE,
        ).toString()
    } else {
        DateFormat.getDateInstance(DateFormat.MEDIUM).format(Date(epochMillis))
    }
}

private const val THIRTY_DAYS_MS = 30L * 24 * 60 * 60 * 1000
