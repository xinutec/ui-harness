package org.xinutec.shell

/** The marker the shell adds to its WebView's user agent, ahead of its commit. */
internal const val SHELL_MARKER = "XinutecShell/"

/**
 * `base` with the shell's commit appended: every request the app makes says which
 * shell built it, which is how fleetwatch notices a phone running a stale one.
 */
internal fun shellUserAgent(base: String, commit: String): String =
    "${base.substringBefore(" $SHELL_MARKER")} $SHELL_MARKER$commit"
