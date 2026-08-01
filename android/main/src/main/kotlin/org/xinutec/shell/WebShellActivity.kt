package org.xinutec.shell

import android.annotation.SuppressLint
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.content.pm.ActivityInfo
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.graphics.Color
import android.os.Bundle
import android.util.Log
import android.view.ViewGroup
import android.webkit.ConsoleMessage
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.core.content.edit
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat

/**
 * The Activity every one of the fleet's WebView wrapper apps is.
 *
 * Each app is an Angular SPA presented as a native one: a single full-screen
 * [WebView], no address bar, no tabs, a home-screen icon. Deliberately tiny — one
 * WebView in one wrapper, no Compose, no AppCompat. A subclass declares its
 * [ShellConfig] and, if it needs anything beyond a viewer, overrides a hook.
 *
 * This exists because eight apps each kept their own copy of it, and copies drift:
 * by the time it was extracted, `parseCssColor` was byte-identical in all eight,
 * `Restore` existed five times under two different implementations, back-press had
 * split into two idioms — three apps on the modern dispatcher, five still overriding
 * the deprecated `onBackPressed`, a *behavioural* difference on API 33+ — and one
 * copy had lost `Type.ime()` from its insets, so its keyboard drew over the page.
 *
 * ## What the shell owns
 *
 * - **Insets, including the IME.** With edge-to-edge enforced at targetSdk 35+ the
 *   window no longer resizes for the keyboard, so the padding is applied here or
 *   the IME draws straight over the page and buries bottom sheets.
 * - **Bars painted with the page's own colour**, read from its `body` background
 *   after load, so the strips follow the web app's light/dark theme instead of a
 *   hardcoded black.
 * - **Restore-on-reopen**, filtered through [Restore] so a spent login callback can
 *   never become the page every cold launch reloads.
 * - **Back through SPA history**, on [androidx.activity.OnBackPressedDispatcher].
 *
 * ## What an app still owns
 *
 * Anything that is not "a viewer": notifications, reminders, geofencing, file
 * chooser, permission prompts, hardware keys, extra WebViews. Those are overrides
 * ([onWebViewCreated], [createWebViewClient], [createWebChromeClient],
 * [startUrl], [onBackBeforeHistory], [onBackAtRoot], [hasExtraBackTargets]) rather
 * than configuration flags — a flag can only express what was anticipated.
 *
 * ## What the app's manifest still owns
 *
 * `configChanges="orientation|screenSize|keyboardHidden|screenLayout"` on the
 * activity, so rotation keeps the WebView with its route and scroll position
 * intact; `windowSoftInputMode="adjustResize"` for pre-35 devices; and
 * `enableOnBackInvokedCallback="true"` for predictive back. A library cannot set
 * attributes on the app's own activity element, so the shell checks the first at
 * runtime and says so in logcat rather than letting rotation silently reload the
 * page. Held identical across apps by dev-lint's `DL-ANDROID-WEBVIEW-MANIFEST`.
 */
abstract class WebShellActivity : ComponentActivity() {
    /** What this app is. Read once, in [onCreate]. */
    protected abstract val shell: ShellConfig

    /** The WebView showing the app. Valid from [onWebViewCreated] onwards. */
    protected lateinit var web: WebView
        private set

    /**
     * The wrapper the insets are applied to and the bars are painted on. Add
     * anything that must sit over the page (a banner, an overlay) here, and
     * anything that must sit behind it at index 0.
     */
    protected lateinit var root: FrameLayout
        private set

    /** Where the restore point is kept; an app may use it for its own keys too. */
    protected lateinit var prefs: SharedPreferences
        private set

    // Modern back handling (predictive back on API 33+, opted into via the
    // manifest's enableOnBackInvokedCallback). Enabled only while there is
    // somewhere in-app to go, so at the root the system shows its own predictive
    // "exit to launcher" gesture instead of the app swallowing the gesture.
    private val backCallback =
        object : OnBackPressedCallback(false) {
            override fun handleOnBackPressed() {
                if (onBackBeforeHistory()) return
                if (web.canGoBack()) {
                    web.goBack()
                    return
                }
                if (onBackAtRoot()) return
                // Nothing left in-app: hand back to the system to finish.
                isEnabled = false
                onBackPressedDispatcher.onBackPressed()
            }
        }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        applyWebDebugging()
        warnIfRotationRecreates()
        prefs = getSharedPreferences(shell.prefsName, Context.MODE_PRIVATE)
        web =
            WebView(this).apply {
                layoutParams =
                    ViewGroup.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT,
                        ViewGroup.LayoutParams.MATCH_PARENT,
                    )
                settings.javaScriptEnabled = true // Angular needs JS
                settings.domStorageEnabled = true // localStorage / sessionStorage
                settings.useWideViewPort = true
                settings.loadWithOverviewMode = true
                webViewClient = createWebViewClient()
                webChromeClient = createWebChromeClient()
                // Black until the page loads and reports its surface colour; avoids
                // a white flash on launch.
                setBackgroundColor(Color.BLACK)
            }
        onWebViewCreated(web)
        // Inset the WebView from the system bars by padding a wrapper ViewGroup
        // (WebView.setPadding() doesn't offset content under wide-viewport mode).
        // Once the WebView no longer underlaps the bars its env(safe-area-inset-*)
        // collapse to 0, so the page's own safe-area CSS adds nothing on top.
        root =
            FrameLayout(this).apply {
                addView(web)
                setBackgroundColor(Color.BLACK)
            }
        ViewCompat.setOnApplyWindowInsetsListener(root) { v, insets ->
            // ime() included: with enforced edge-to-edge (targetSdk 35+) the window
            // no longer auto-resizes for the keyboard — without this the IME just
            // draws over the page and bottom sheets stay buried under it.
            val bars =
                insets.getInsets(
                    WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.ime(),
                )
            v.setPadding(bars.left, bars.top, bars.right, bars.bottom)
            WindowInsetsCompat.CONSUMED
        }
        setContentView(root)
        onBackPressedDispatcher.addCallback(this, backCallback)
        // An intent may name the page to open (a tapped notification); otherwise
        // reopen where we left off. The configured URL is only the first-run default.
        web.loadUrl(startUrl(intent) ?: restorePoint() ?: shell.url)
    }

    /**
     * A notification tapped while we're already running arrives here rather than
     * through a fresh [onCreate] — navigate the live WebView to whatever it names.
     */
    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        startUrl(intent)?.let { web.loadUrl(it) }
    }

    // `configChanges` keeps the Activity across rotation, so this only fires on a
    // real finish — release the WebView instead of leaking it. A subclass with its
    // own views to release overrides this and calls super LAST.
    override fun onDestroy() {
        root.removeView(web)
        web.destroy()
        super.onDestroy()
    }

    /**
     * The page a cold launch reopens on, or null to use [ShellConfig.url].
     *
     * Re-checked against the *current* configured URL rather than trusted: a point
     * saved before the app was repointed at another host would otherwise pin every
     * launch to the old one, which no amount of restarting could clear. Same test
     * as on the way in, so a restore point written by an older build that predates
     * the login-hop filter is dropped rather than replayed.
     */
    private fun restorePoint(): String? =
        prefs.getString(KEY_LAST_URL, null)?.takeIf { Restore.isRestorable(shell.url, it) }

    // ---- hooks ----

    /**
     * The WebView exists and its clients are set, but nothing has loaded yet.
     * Attach `@JavascriptInterface` bridges and any extra settings here — after
     * the page starts loading is too late for a bridge the first render uses.
     */
    protected open fun onWebViewCreated(web: WebView) {}

    /**
     * The in-app URL this intent asks to open, or null for none — a tapped
     * notification's deep link. Returning null falls back to the restore point.
     *
     * An implementation must confine the result to the app's own URL: an intent is
     * an external input, and a wrapper with no address bar gives no way to notice
     * that it is showing somewhere else.
     */
    protected open fun startUrl(intent: Intent?): String? = null

    /** Handle back before the SPA's history is walked; true if it was consumed. */
    protected open fun onBackBeforeHistory(): Boolean = false

    /**
     * Handle back once in-app history is exhausted; true if it was consumed. This
     * is where "up" lives when the SPA's history doesn't express it — messages
     * escapes a deep-linked conversation to the list rather than exiting.
     */
    protected open fun onBackAtRoot(): Boolean = false

    /**
     * Whether back has somewhere to go beyond the WebView's own history — an open
     * overlay, or a screen [onBackAtRoot] would escape from. Consulted by
     * [syncBack]; an app whose answer changes must call [syncBack] when it does.
     */
    protected open fun hasExtraBackTargets(): Boolean = false

    /**
     * Re-check whether back should be intercepted. Called by the shell on every
     * navigation; call it yourself when app state changes the answer.
     */
    protected fun syncBack() {
        backCallback.isEnabled = web.canGoBack() || hasExtraBackTargets()
    }

    /** The client driving the main WebView. Override returning a subclass of
     *  [ShellWebViewClient], so the shell's own behaviour can't be dropped. */
    protected open fun createWebViewClient(): ShellWebViewClient = ShellWebViewClient()

    /** As [createWebViewClient], for the chrome client. */
    protected open fun createWebChromeClient(): ShellWebChromeClient = ShellWebChromeClient()

    // ---- the shell's clients ----

    open inner class ShellWebViewClient : WebViewClient() {
        override fun shouldOverrideUrlLoading(
            view: WebView,
            request: WebResourceRequest,
        ): Boolean {
            val url = request.url
            val inApp =
                staysInApp(
                    appUrl = shell.url,
                    allowed = shell.allowedHosts,
                    isMainFrame = request.isForMainFrame,
                    scheme = url.scheme,
                    host = url.host,
                    port = url.port,
                )
            if (inApp) return false
            try {
                startActivity(Intent(Intent.ACTION_VIEW, url))
            } catch (_: ActivityNotFoundException) {
                // No handler for this URL — drop the navigation.
            }
            return true
        }

        // Remember the current in-app page so a cold reopen returns to it. SPA route
        // changes fire this too, which is the only reason a route is restorable at all.
        override fun doUpdateVisitedHistory(view: WebView, url: String, isReload: Boolean) {
            super.doUpdateVisitedHistory(view, url, isReload)
            if (Restore.isRestorable(shell.url, url)) {
                prefs.edit { putString(KEY_LAST_URL, url) }
            }
            syncBack()
        }

        // Paint the strips behind the system bars with the web UI's own surface
        // colour instead of a hardcoded black; it follows the page's light/dark
        // theme, so read its body background.
        override fun onPageFinished(view: WebView, url: String) {
            super.onPageFinished(view, url)
            view.evaluateJavascript("getComputedStyle(document.body).backgroundColor") { result ->
                parseCssColor(result)?.let(root::setBackgroundColor)
            }
        }
    }

    open inner class ShellWebChromeClient : WebChromeClient() {
        // Mirror the page's console to logcat, keeping its levels: an error that
        // arrives as Log.i is invisible to `adb logcat *:W`, which is how anyone
        // actually reads this.
        override fun onConsoleMessage(msg: ConsoleMessage): Boolean {
            val tag = shell.consoleTag ?: return super.onConsoleMessage(msg)
            val line = "${msg.message()} (${msg.sourceId()}:${msg.lineNumber()})"
            when (msg.messageLevel()) {
                ConsoleMessage.MessageLevel.ERROR -> Log.e(tag, line)
                ConsoleMessage.MessageLevel.WARNING -> Log.w(tag, line)
                ConsoleMessage.MessageLevel.DEBUG -> Log.d(tag, line)
                else -> Log.i(tag, line)
            }
            return true
        }
    }

    // ---- setup ----

    private fun applyWebDebugging() {
        val on =
            when (shell.webDebugging) {
                WebDebugging.NEVER -> {
                    false
                }

                WebDebugging.ALWAYS -> {
                    true
                }

                WebDebugging.DEBUG_BUILDS -> {
                    (applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE) != 0
                }
            }
        if (on) WebView.setWebContentsDebuggingEnabled(true)
    }

    /**
     * Say so in logcat if the activity will be recreated on rotation. Without the
     * `configChanges` declaration nothing fails — the app simply reloads the page
     * and loses the scroll position on every turn of the phone, which reads as a
     * slow app rather than as a missing manifest attribute.
     */
    private fun warnIfRotationRecreates() {
        val wanted =
            ActivityInfo.CONFIG_ORIENTATION or
                ActivityInfo.CONFIG_SCREEN_SIZE or
                ActivityInfo.CONFIG_KEYBOARD_HIDDEN or
                ActivityInfo.CONFIG_SCREEN_LAYOUT
        val declared =
            try {
                packageManager.getActivityInfo(componentName, 0).configChanges
            } catch (_: PackageManager.NameNotFoundException) {
                return
            }
        if (wanted and declared.inv() != 0) {
            Log.w(
                TAG,
                "$componentName does not declare configChanges for " +
                    "orientation|screenSize|keyboardHidden|screenLayout — the WebView " +
                    "will be recreated (and the page reloaded) on rotation",
            )
        }
    }

    private companion object {
        const val TAG = "web-shell"
        const val KEY_LAST_URL = "last_url"
    }
}
