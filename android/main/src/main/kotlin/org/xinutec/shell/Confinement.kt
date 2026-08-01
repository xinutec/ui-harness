package org.xinutec.shell

// Which navigations stay inside the WebView.
//
// A chromeless view has no URL bar, so a page that opens in place *is* the app as
// far as anyone looking at it can tell. Confinement is therefore the default: an
// app is allowed its own host, and anything else is handed to the real browser,
// where it arrives with an address bar and its own identity.
//
// These are string predicates rather than `Uri` work so they can be unit-tested;
// the framework's parser is only used for the request that comes off the wire.

/** The host in [url], without userinfo or port. Null if it has no authority. */
internal fun hostOf(url: String): String? {
    val afterScheme = url.substringAfter("://", missingDelimiterValue = "")
    if (afterScheme.isEmpty()) return null
    val authority =
        afterScheme.substringBefore('/').substringBefore('?').substringBefore('#')
    val host = authority.substringAfterLast('@').substringBefore(':')
    return host.ifEmpty { null }
}

/** The scheme in [url] (`https`, `http`, …), lowercased. Null if it has none. */
internal fun schemeOf(url: String): String? =
    url.substringBefore("://", missingDelimiterValue = "").lowercase().ifEmpty { null }

/**
 * Whether a navigation to [scheme]://[host] stays in the app.
 *
 * An empty [allowed] means the app deliberately declined confinement — every
 * navigation stays in-app, which is what a viewer whose pages never link outward
 * wants. Otherwise the host must be listed *and* the scheme must be one the app
 * itself uses: cleartext is allowed only to an app that is already cleartext (a
 * LAN-only viewer), so an https app can never be walked down to http in place.
 */
internal fun staysInApp(
    appUrl: String,
    allowed: Set<String>,
    scheme: String?,
    host: String?,
): Boolean {
    if (allowed.isEmpty()) return true
    if (host == null || host !in allowed) return false
    return when (scheme?.lowercase()) {
        "https" -> true
        "http" -> schemeOf(appUrl) == "http"
        else -> false
    }
}
