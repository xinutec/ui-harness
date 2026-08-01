package org.xinutec.shell

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * What the page can hand back for the system-bar strips.
 *
 * The failure this guards is silent by construction: an unreadable answer that
 * parsed as *something* would paint the bars a colour the page never had, and the
 * only symptom is two strips that don't match the app. Returning null instead
 * keeps the black the shell already set.
 */
class CssColorTest {
    @Test
    fun `an opaque rgb triple, as evaluateJavascript quotes it`() {
        assertEquals(Triple(18, 18, 18), parseRgb("\"rgb(18, 18, 18)\""))
    }

    @Test
    fun `rgba parses, and its alpha is dropped`() {
        assertEquals(Triple(255, 251, 254), parseRgb("\"rgba(255, 251, 254, 1)\""))
        // A translucent surface still reports its own colour; the strip behind the
        // bars is opaque either way.
        assertEquals(Triple(18, 18, 18), parseRgb("\"rgba(18, 18, 18, 0.5)\""))
    }

    @Test
    fun `whitespace between the components is optional`() {
        assertEquals(Triple(1, 2, 3), parseRgb("\"rgb(1,2,3)\""))
    }

    @Test
    fun `nothing readable yields null rather than a guess`() {
        assertNull(parseRgb(null))
        assertNull(parseRgb("null")) // the page hadn't finished loading
        assertNull(parseRgb("\"transparent\""))
        assertNull(parseRgb("\"\""))
        // A colour space a canvas-era page can report but this doesn't decode.
        assertNull(parseRgb("\"color(display-p3 0.07 0.07 0.07)\""))
    }
}
