package org.xinutec.shell

/**
 * Whether the WebView's renderer has stopped responding — the rule behind the
 * shell's escape from a page that hangs it.
 *
 * ⚠ **WHY THIS EXISTS: A RESTORE POINT CAN BRICK THE APP, AND HAS TWICE.**
 * [Restore] already refuses pages known in advance to be bad (the OAuth hops
 * that stranded fleetwatch on 2026-07-28). That defence cannot cover a page
 * which is perfectly legitimate and merely HANGS — health's map tab on
 * 2026-09-14, which spun Android WebView's synchronous compositor at a full
 * core and killed JavaScript. Because [WebShellActivity.restorePoint] reopens
 * the last page every cold launch, the app reloaded it forever: force-stopping
 * did not help, and reinstalling would not have either. The only escape was
 * editing the app's preferences over adb.
 *
 * Enumerating bad pages cannot work. Noticing that the renderer has stopped can.
 *
 * ⚠ **RESUMED TIME ONLY.** A backgrounded WebView legitimately stops painting,
 * so wall-clock would call every backgrounded app wedged. Only time while the
 * activity is resumed counts, which is why this holds the accumulation itself
 * rather than leaving it to the caller — a rule split across a helper and its
 * call site is one the test can only restate.
 */
class Liveness(
    private val wedgedAfterMs: Long = WEDGED_AFTER_MS,
) {
    private var unansweredResumedMs = 0L
    private var wedged = false

    /** The renderer proved it is alive (a visual-state callback came back). */
    fun onAnswered() {
        unansweredResumedMs = 0L
        wedged = false
    }

    /**
     * Advance by [elapsedMs] of RESUMED time with no answer.
     *
     * Returns true only on the transition into wedged, so a caller acts ONCE
     * rather than on every tick of a hang.
     */
    fun onResumedElapsed(elapsedMs: Long): Boolean {
        if (wedged) return false
        unansweredResumedMs += elapsedMs
        if (unansweredResumedMs < wedgedAfterMs) return false
        wedged = true
        return true
    }

    /**
     * The activity left the foreground.
     *
     * ⚠ Clears the accumulator rather than merely pausing it: the renderer is
     * not expected to paint while backgrounded, so anything counted up to here
     * is not evidence about it.
     */
    fun onPaused() {
        unansweredResumedMs = 0L
    }

    val isWedged: Boolean
        get() = wedged

    companion object {
        /** How often to ask the renderer to prove it is alive. */
        const val PROBE_INTERVAL_MS = 5_000L

        /**
         * Unanswered resumed time before the renderer is called wedged.
         *
         * ⚠ Generous on purpose. A renderer busy for a few seconds is slow, not
         * broken, and the cost of a false positive is discarding the user's
         * restore point. Thirty seconds of a frozen UI is already broken from
         * where the user is sitting.
         */
        const val WEDGED_AFTER_MS = 30_000L
    }
}
