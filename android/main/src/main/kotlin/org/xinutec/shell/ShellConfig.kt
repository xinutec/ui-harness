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
     * Hosts allowed to load inside the WebView. **Defaults to the app's own host**,
     * so the safe case needs no thought: a chromeless view has no URL bar, and a
     * foreign page opening in place would still look like the app. Anything not
     * listed is handed to the real browser, where it arrives with an address bar.
     *
     * An app behind a login **must list its identity provider's host** too, or the
     * login hop itself gets ejected to the browser and the app can never sign in.
     *
     * Passing `emptySet()` declines confinement entirely — every navigation stays
     * in-app. That is a deliberate, visible choice, not the default it used to be.
     */
    val allowedHosts: Set<String> = setOfNotNull(hostOf(url)),
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
