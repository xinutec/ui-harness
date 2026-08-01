package org.xinutec.shell

/**
 * Everything an app must say about itself to become a WebView wrapper.
 *
 * Every field but [url] has a working default, so the smallest app is one line.
 * What is *not* here is deliberate: behaviour that only some apps want (bridges,
 * pickers, notifications, hardware keys) is an override on [WebShellActivity],
 * not a flag — a config option can only express what was anticipated, while an
 * override can express anything.
 */
data class ShellConfig(
    /**
     * The app's own URL: the first-run default, and the base every restorable page
     * is measured against (see [Restore]).
     */
    val url: String,
    /**
     * Hosts allowed to load inside the WebView. **Empty means no confinement** —
     * every navigation stays in-app, which is correct for a viewer whose pages
     * never link outward. A non-empty set confines: anything else is handed to the
     * real browser, because a chromeless view has no URL bar, so a foreign page
     * opening in place would still look like the app.
     *
     * An app behind a login must list its identity provider's host too, or the
     * login hop itself gets ejected to the browser.
     */
    val allowedHosts: Set<String> = emptySet(),
    /**
     * logcat tag to mirror the page's `console.*` to, or null to leave the web
     * console invisible. Without this a wrapper carrying only a `WebViewClient`
     * logs nothing at all — the page's own diagnostics never leave the WebView.
     */
    val consoleTag: String? = null,
    /** When to expose the WebView to Chrome DevTools over adb. */
    val webDebugging: WebDebugging = WebDebugging.NEVER,
    /** SharedPreferences file holding the restore point. */
    val prefsName: String = "viewer",
)

/**
 * Whether the live page can be inspected over adb (`chrome://inspect`, or CDP
 * against the app's `*_devtools_remote` socket).
 *
 * Worth turning on: the alternative is inferring what the page did from server
 * logs and screenshots, which is how a Nextcloud login error once took an hour to
 * identify instead of a minute.
 */
enum class WebDebugging {
    /** Never inspectable. */
    NEVER,

    /** Inspectable on debuggable builds only, so a release build stays closed. */
    DEBUG_BUILDS,

    /** Always inspectable — for an app that only ever ships as a sideloaded build. */
    ALWAYS,
}
