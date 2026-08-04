package org.xinutec.shell

/**
 * Which pages may become the app's restore point — the URL a cold launch reopens on.
 *
 * Only pages of the app itself. The OAuth hops (`/login`, `/auth/callback`) are
 * transient: the callback carries a **one-shot** authorization code, so replaying it
 * always fails. Saving one as the restore point turns a single failed login into a
 * permanent one — every launch reloads a spent callback, is refused, and never reaches
 * the app to try again. That is not hypothetical: it happened to the fleetwatch wrapper
 * on the Pixel 9 (2026-07-28), which could not recover on its own.
 *
 * Applied to every wrapper, including the two with no login at all: a rule that only
 * holds where someone remembered to copy it is the rule that stranded fleetwatch.
 *
 * "The app itself" is [schemeOf] + [authorityOf] — the same call, not merely the same
 * intention, as the one confinement makes in `Confinement.kt`. It used to be a string
 * prefix here, which agreed with confinement almost everywhere and disagreed exactly
 * where the port normalisation applies: `https://app/` against `https://app:443/page`
 * would open in place and then be refused as a restore point. A page reachable but not
 * rememberable is the failure this whole predicate exists to prevent, so the two share
 * an implementation rather than a resemblance.
 */
object Restore {
    /** First path segments that belong to the login round-trip, not to the app. */
    private val TRANSIENT = setOf("login", "logout", "auth")

    /** True if [url] is a page of the app worth reopening on. */
    fun isRestorable(base: String, url: String): Boolean {
        // Same origin, port and all — so a look-alike host (…xinutec.org.evil.test)
        // can't pass as the app by sharing a prefix, and a neighbouring service on the
        // same box is not the app either. [sameOrigin] is that test, shared with the
        // native bridges rather than restated here.
        if (!sameOrigin(base, url)) return false
        // A [base] carrying a path confines to that subtree; an origin-only base (every
        // app today) confines to all of it. Tolerates a base written with or without
        // its trailing slash.
        val root = pathOf(base).removeSuffix("/")
        val path = pathOf(url)
        if (path != root && !path.startsWith("$root/")) return false
        // Match on the whole first segment, so a page called "logins" still restores.
        val head = path.removePrefix(root).removePrefix("/").substringBefore('/')
        return head !in TRANSIENT
    }
}
