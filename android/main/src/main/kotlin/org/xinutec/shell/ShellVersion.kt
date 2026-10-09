package org.xinutec.shell

/** The marker the shell adds to its WebView's user agent, ahead of its commit. */
internal const val SHELL_MARKER = "XinutecShell/"

/**
 * `base` with the shell's commit appended: every request the app makes says which
 * shell built it, which is how fleetwatch notices a phone running a stale one.
 */
internal fun shellUserAgent(base: String, commit: String): String =
    "${base.substringBefore(" $SHELL_MARKER")} $SHELL_MARKER$commit"

/** One request: what the beacon sends. */
internal data class Beacon(
    val url: String,
    val method: String,
    val headers: Map<String, String>,
)

/**
 * The launch beacon: the app's root, asked for once per start with the stamped
 * agent. The page's own requests cannot carry the stamp — Angular's service worker
 * fetches them, and a service worker sends the WebView's default agent — so this
 * native request is how the server log learns which shell an app runs. The
 * referer names the app, which is how the log tells apps apart.
 */
internal fun shellBeacon(appUrl: String, userAgent: String): Beacon =
    Beacon(appUrl, "HEAD", mapOf("User-Agent" to userAgent, "Referer" to appUrl))
