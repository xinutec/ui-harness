package org.xinutec.shell

// Which navigations stay inside the WebView.
//
// A chromeless view has no URL bar, so a page that opens in place *is* the app as
// far as anyone looking at it can tell. Confinement is therefore the default: an
// app is allowed its own authority, and anything else is handed to the real
// browser, where it arrives with an address bar and its own identity.
//
// **"The app" means scheme + host + port**, and it means that here and in
// [Restore] alike. The port is not incidental: thoth is one of many services on
// the Mac (:8089) and recall's viewer one of many on isis (:8000), so a
// host-only rule would let every neighbouring service open in place wearing the
// app's face. Restore has always compared the port — this file used to compare
// only the host, and two definitions of "the app" in one library is how a URL
// comes to be reachable but not rememberable.
//
// These are string predicates rather than `Uri` work so they can be unit-tested;
// the framework's parser is only used for the request that comes off the wire.

/**
 * The authority in [url] — host, plus `:port` when it is not the scheme's default.
 * Userinfo is dropped. Null if [url] has no authority at all.
 */
internal fun authorityOf(url: String): String? {
    val afterScheme = url.substringAfter("://", missingDelimiterValue = "")
    if (afterScheme.isEmpty()) return null
    val raw =
        afterScheme
            .substringBefore('/')
            .substringBefore('?')
            .substringBefore('#')
            .substringAfterLast('@')
    if (raw.isEmpty()) return null
    return normaliseAuthority(schemeOf(url), raw)
}

/** The scheme in [url] (`https`, `http`, …), lowercased. Null if it has none. */
internal fun schemeOf(url: String): String? =
    url.substringBefore("://", missingDelimiterValue = "").lowercase().ifEmpty { null }

/**
 * The path in [url], from its leading `/`, without query or fragment. Empty when the
 * URL is bare authority (`https://example.test`).
 */
internal fun pathOf(url: String): String {
    val afterScheme = url.substringAfter("://", missingDelimiterValue = "")
    if (afterScheme.isEmpty()) return ""
    val slash = afterScheme.indexOf('/')
    if (slash < 0) return ""
    return afterScheme.substring(slash).substringBefore('?').substringBefore('#')
}

/**
 * `host[:port]` with a redundant port removed, so `example.test:443` under https
 * and `example.test` are one authority rather than two that never match.
 */
internal fun normaliseAuthority(scheme: String?, hostAndPort: String): String {
    // An IPv6 literal is bracketed and full of colons; its port, if any, follows
    // the closing bracket.
    val hostEnd = if (hostAndPort.startsWith("[")) hostAndPort.indexOf(']') + 1 else 0
    val sep = hostAndPort.indexOf(':', startIndex = hostEnd)
    if (sep < 0) return hostAndPort
    val host = hostAndPort.substring(0, sep)
    val port = hostAndPort.substring(sep + 1)
    val default =
        when (scheme?.lowercase()) {
            "https" -> "443"
            "http" -> "80"
            else -> null
        }
    return if (port.isEmpty() || port == default) host else "$host:$port"
}

/**
 * Whether [url] is the same origin as [base] — scheme, host and port, which is
 * the web platform's own definition of "the same site" and the one every other
 * rule in this library already uses.
 *
 * Public because the wrappers need it too, and the alternative is each of them
 * writing its own. coach's native bridge gated itself with
 * `url.startsWith(BASE_URL)`, which admits `https://coach.xinutec.org.evil.test/`
 * — a prefix is not an origin, and the host it actually names is somebody else's.
 * That is the same mistake [Restore] used to make, described in its own doc, and
 * a fourth hand-rolled version of "is this the app?" is how the three that exist
 * come to disagree.
 *
 * A null [url] is not the app: `WebView.getUrl()` is null before the first load.
 */
fun sameOrigin(base: String, url: String?): Boolean {
    if (url == null) return false
    val scheme = schemeOf(base) ?: return false
    if (schemeOf(url) != scheme) return false
    val authority = authorityOf(base) ?: return false
    return authorityOf(url) == authority
}

/**
 * Whether a navigation stays in the app.
 *
 * [isMainFrame] false always stays: a sub-frame is part of the page the app is
 * already showing, not a navigation away from it. Ejecting one would cancel the
 * frame's load and open the phone's browser over the app, which is a far stranger
 * outcome than whatever the frame was going to render.
 *
 * An empty [allowed] means the app deliberately declined confinement. Otherwise
 * the authority must be listed *and* the scheme must be one the app itself uses:
 * cleartext is allowed only to an app that is already cleartext (a LAN-only
 * viewer), so an https app can never be walked down to http in place.
 */
internal fun staysInApp(
    appUrl: String,
    allowed: Set<String>,
    isMainFrame: Boolean,
    scheme: String?,
    host: String?,
    port: Int,
): Boolean {
    if (!isMainFrame) return true
    if (allowed.isEmpty()) return true
    if (host == null) return false
    val authority = normaliseAuthority(scheme, if (port >= 0) "$host:$port" else host)
    if (allowed.none { normaliseAuthority(scheme, it) == authority }) return false
    return when (scheme?.lowercase()) {
        "https" -> true
        "http" -> schemeOf(appUrl) == "http"
        else -> false
    }
}
