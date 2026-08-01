package org.xinutec.shell

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * What an app is allowed to reopen on. The case that matters is the spent OAuth
 * callback: saving one stranded the Pixel 9 in a launch-and-fail loop it could not get
 * out of, because the dead page was also the only page it would ever load.
 */
class RestoreTest {
    private val base = "https://fleetwatch.xinutec.org/"

    private fun restorable(url: String) = Restore.isRestorable(base, url)

    @Test
    fun `the dashboard root restores`() {
        assertTrue(restorable(base))
    }

    @Test
    fun `app pages restore, with their query and fragment`() {
        assertTrue(restorable(base + "problems"))
        assertTrue(restorable(base + "history?source=amun&collector=vpn-nodes"))
        assertTrue(restorable(base + "problems#muted"))
    }

    @Test
    fun `the spent OAuth callback that stranded the phone never restores`() {
        assertFalse(restorable(base + "auth/callback?state=&code=h1EaSwY19M1ExjvPyAgm"))
    }

    @Test
    fun `neither end of the login round-trip restores`() {
        assertFalse(restorable(base + "login"))
        assertFalse(restorable(base + "login?return_to=%2Fproblems"))
        assertFalse(restorable(base + "logout"))
        assertFalse(restorable(base + "auth/callback"))
    }

    @Test
    fun `a page whose name merely starts with a transient one still restores`() {
        assertTrue(restorable(base + "logins"))
        assertTrue(restorable(base + "authors"))
    }

    @Test
    fun `another origin never restores`() {
        assertFalse(restorable("https://dash.xinutec.org/login/flow"))
        assertFalse(restorable("https://fleetwatch.xinutec.org.evil.test/problems"))
    }

    @Test
    fun `a base written without its trailing slash behaves the same`() {
        // coach's URL is written that way; the predicate is shared verbatim.
        val bare = "https://fleetwatch.xinutec.org"
        assertTrue(Restore.isRestorable(bare, bare))
        assertTrue(Restore.isRestorable(bare, "$bare/problems"))
        assertFalse(Restore.isRestorable(bare, "$bare/auth/callback?state=&code=x"))
        assertFalse(Restore.isRestorable(bare, "https://fleetwatch.xinutec.org.evil.test/"))
    }

    @Test
    fun `it agrees with confinement about a redundant default port`() {
        // The spelling the two predicates used to disagree on: confinement normalises
        // :443 away and opens the page in place, so refusing to remember it would make
        // the page reachable but not rememberable. They share the implementation now.
        assertTrue(restorable("https://fleetwatch.xinutec.org:443/problems"))
        assertTrue(Restore.isRestorable("https://fleetwatch.xinutec.org:443/", base + "problems"))
        // A port that is NOT the default is still a different app.
        assertFalse(restorable("https://fleetwatch.xinutec.org:8443/problems"))
    }

    @Test
    fun `a different scheme is a different app`() {
        assertFalse(restorable("http://fleetwatch.xinutec.org/problems"))
    }

    @Test
    fun `a base carrying a path confines to that subtree`() {
        val sub = "https://example.test/app/"
        assertTrue(Restore.isRestorable(sub, "https://example.test/app/page"))
        assertTrue(Restore.isRestorable(sub, "https://example.test/app"))
        assertFalse(Restore.isRestorable(sub, "https://example.test/other"))
        // The transient check applies to the first segment BELOW the base, not the URL.
        assertFalse(Restore.isRestorable(sub, "https://example.test/app/login"))
        assertTrue(
            Restore.isRestorable("https://example.test/login/", "https://example.test/login/x"),
        )
    }

    @Test
    fun `a cleartext LAN base restores like any other`() {
        // thoth serves plain HTTP on the LAN, with a port in the authority.
        val lan = "http://192.168.1.81:8089/"
        assertTrue(Restore.isRestorable(lan, lan))
        assertTrue(Restore.isRestorable(lan, lan + "speakers"))
        assertFalse(Restore.isRestorable(lan, "http://192.168.1.81:8090/speakers"))
    }
}
