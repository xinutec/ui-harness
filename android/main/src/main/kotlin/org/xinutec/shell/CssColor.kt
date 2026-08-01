package org.xinutec.shell

import android.graphics.Color

/**
 * The RGB in a CSS colour as `evaluateJavascript` hands it back — a JSON-encoded
 * string, e.g. `"rgb(18, 18, 18)"` (quotes included) or `"rgba(18, 18, 18, 1)"`.
 *
 * Alpha is ignored: this reads a page's *surface* colour, which is opaque. Null
 * when the page reported something unreadable (`null`, a keyword, a page that
 * never finished loading), so the caller keeps the colour it already had rather
 * than painting the bars a guess.
 *
 * Split from [parseCssColor] because `Color` is a framework stub on the JVM: it
 * throws in a unit test unless the whole android.jar is mocked into returning
 * zeros, at which point the test proves nothing. The parsing is the part that can
 * be wrong, so the parsing is the part that is testable.
 */
internal fun parseRgb(raw: String?): Triple<Int, Int, Int>? {
    val m = raw?.let { Regex("""rgba?\((\d+),\s*(\d+),\s*(\d+)""").find(it) } ?: return null
    val (r, g, b) = m.destructured
    return Triple(r.toInt(), g.toInt(), b.toInt())
}

/** [parseRgb], packed into the ARGB int the view layer paints with. */
internal fun parseCssColor(raw: String?): Int? =
    parseRgb(raw)?.let { (r, g, b) -> Color.rgb(r, g, b) }
