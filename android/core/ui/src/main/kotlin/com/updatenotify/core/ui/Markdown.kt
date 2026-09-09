package com.updatenotify.core.ui

import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle

/**
 * Minimal Markdown rendering for release summaries.
 *
 * Deliberately not a Markdown library. Release notes from the extraction prompt
 * use a narrow subset — headings, bullets, bold, inline code — and a full parser
 * would be a large dependency, an HTML-injection surface for text that ultimately
 * originates from scraped vendor pages, and far more capability than the content
 * needs. Anything unrecognised renders as plain text, which is the correct
 * failure mode.
 */
@Composable
fun rememberMarkdown(source: String): AnnotatedString {
    val bodyColor = MaterialTheme.colorScheme.onSurface
    val accentColor = MaterialTheme.colorScheme.primary
    val mutedColor = MaterialTheme.colorScheme.onSurfaceVariant

    return remember(source, bodyColor, accentColor, mutedColor) {
        buildAnnotatedString {
            source.lines().forEachIndexed { index, rawLine ->
                if (index > 0) append('\n')
                val line = rawLine.trimEnd()

                when {
                    line.startsWith("### ") -> withStyle(
                        SpanStyle(fontWeight = FontWeight.SemiBold, color = bodyColor),
                    ) { appendInline(line.removePrefix("### "), accentColor) }

                    line.startsWith("## ") -> withStyle(
                        SpanStyle(fontWeight = FontWeight.Bold, color = bodyColor),
                    ) { appendInline(line.removePrefix("## "), accentColor) }

                    line.startsWith("# ") -> withStyle(
                        SpanStyle(fontWeight = FontWeight.Bold, color = bodyColor),
                    ) { appendInline(line.removePrefix("# "), accentColor) }

                    line.startsWith("- ") || line.startsWith("* ") -> {
                        withStyle(SpanStyle(color = accentColor)) { append("  •  ") }
                        withStyle(SpanStyle(color = mutedColor)) {
                            appendInline(line.drop(2), accentColor)
                        }
                    }

                    else -> withStyle(SpanStyle(color = mutedColor)) {
                        appendInline(line, accentColor)
                    }
                }
            }
        }
    }
}

/** Handles `**bold**` and `` `code` `` within a line. Everything else is literal. */
private fun androidx.compose.ui.text.AnnotatedString.Builder.appendInline(
    text: String,
    codeColor: androidx.compose.ui.graphics.Color,
) {
    var rest = text
    while (rest.isNotEmpty()) {
        val bold = rest.indexOf("**")
        val code = rest.indexOf('`')

        val next = listOf(bold, code).filter { it >= 0 }.minOrNull()
        if (next == null) {
            append(rest)
            return
        }

        append(rest.substring(0, next))
        rest = rest.substring(next)

        if (rest.startsWith("**")) {
            val end = rest.indexOf("**", startIndex = 2)
            if (end < 0) { append(rest); return }
            withStyle(SpanStyle(fontWeight = FontWeight.Bold)) {
                append(rest.substring(2, end))
            }
            rest = rest.substring(end + 2)
        } else {
            val end = rest.indexOf('`', startIndex = 1)
            if (end < 0) { append(rest); return }
            withStyle(SpanStyle(fontFamily = FontFamily.Monospace, color = codeColor)) {
                append(rest.substring(1, end))
            }
            rest = rest.substring(end + 1)
        }
    }
}
