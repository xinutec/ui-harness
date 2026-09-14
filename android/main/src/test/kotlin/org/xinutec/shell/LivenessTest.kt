package org.xinutec.shell

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class LivenessTest {
    @Test
    fun `a responsive renderer is never wedged`() {
        val l = Liveness(wedgedAfterMs = 30_000)
        repeat(20) {
            assertFalse(l.onResumedElapsed(5_000))
            l.onAnswered()
        }
        assertFalse(l.isWedged)
    }

    @Test
    fun `silence for the threshold is wedged`() {
        val l = Liveness(wedgedAfterMs = 30_000)
        repeat(5) { assertFalse(l.onResumedElapsed(5_000)) } // 25 s
        assertTrue(l.onResumedElapsed(5_000)) // 30 s — tips over
        assertTrue(l.isWedged)
    }

    @Test
    fun `it fires ONCE, not on every tick of a hang`() {
        // ⚠ The caller discards the restore point and tells the user. Doing that
        // every 5 s for as long as the page is frozen would be its own defect.
        val l = Liveness(wedgedAfterMs = 30_000)
        repeat(6) { l.onResumedElapsed(5_000) }
        assertTrue(l.isWedged)
        repeat(10) { assertFalse(l.onResumedElapsed(5_000)) }
    }

    @Test
    fun `background time is not evidence about the renderer`() {
        // ⚠ THE CASE THAT WOULD MAKE THIS WORSE THAN NOTHING. A backgrounded
        // WebView legitimately stops painting; counting that as a hang would
        // throw away the restore point of every app the user simply left.
        val l = Liveness(wedgedAfterMs = 30_000)
        repeat(5) { l.onResumedElapsed(5_000) } // 25 s, nearly there
        l.onPaused()
        repeat(5) { assertFalse(l.onResumedElapsed(5_000)) } // 25 s more, still fine
        assertFalse(l.isWedged)
    }

    @Test
    fun `an answer after a long silence clears it`() {
        val l = Liveness(wedgedAfterMs = 30_000)
        repeat(6) { l.onResumedElapsed(5_000) }
        assertTrue(l.isWedged)
        l.onAnswered()
        assertFalse(l.isWedged)
        repeat(5) { assertFalse(l.onResumedElapsed(5_000)) }
    }
}
