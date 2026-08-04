package org.xinutec.shell

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * What may open in place.
 *
 * The cost of getting this wrong runs both ways, so both directions are tested:
 * too loose and a foreign page wears the app's face in a window with no address
 * bar; too tight and the login hop is ejected to the browser, which means the app
 * can never sign in — and that only shows up months later, when the session
 * finally expires.
 */
class ConfinementTest {
    @Test
    fun `the authority comes out without scheme or userinfo, and keeps the port`() {
        assertEquals("life.xinutec.org", authorityOf("https://life.xinutec.org/"))
        assertEquals("life.xinutec.org", authorityOf("https://life.xinutec.org/planner?x=1#y"))
        assertEquals("192.168.1.81:8089", authorityOf("http://192.168.1.81:8089/"))
        assertEquals("10.100.0.2:8000", authorityOf("http://10.100.0.2:8000/"))
        assertEquals("dash.xinutec.org", authorityOf("https://user@dash.xinutec.org/login"))
        assertNull(authorityOf("not-a-url"))
    }

    @Test
    fun `a port that is the scheme's default is not a second authority`() {
        assertEquals("health.xinutec.org", authorityOf("https://health.xinutec.org:443/"))
        assertEquals("thoth.test", authorityOf("http://thoth.test:80/"))
        assertEquals("thoth.test:8089", authorityOf("https://thoth.test:8089/"))
    }

    @Test
    fun `an IPv6 literal keeps its brackets and its port`() {
        assertEquals("[fd00::1]", authorityOf("http://[fd00::1]/"))
        assertEquals("[fd00::1]:8000", authorityOf("http://[fd00::1]:8000/"))
    }

    @Test
    fun `an app is confined to its own authority by default`() {
        assertEquals(
            setOf("health.xinutec.org"),
            ShellConfig(url = "https://health.xinutec.org/").allowedHosts,
        )
        // The port travels with it: thoth is one of several services on the Mac.
        assertEquals(
            setOf("192.168.1.81:8089"),
            ShellConfig(url = "http://192.168.1.81:8089/").allowedHosts,
        )
    }

    @Test
    fun `the app's own pages stay in-app`() {
        val allowed = setOf("health.xinutec.org")
        assertTrue(inApp("https://health.xinutec.org/", allowed, "https", "health.xinutec.org"))
    }

    @Test
    fun `an unlisted host goes to the real browser`() {
        val allowed = setOf("health.xinutec.org")
        assertFalse(inApp("https://health.xinutec.org/", allowed, "https", "example.test"))
        // The near-miss that a prefix check would have let through.
        assertFalse(
            inApp("https://health.xinutec.org/", allowed, "https", "health.xinutec.org.evil.test"),
        )
    }

    @Test
    fun `a neighbouring service on the same box is not the app`() {
        // The disagreement this resolves: Restore has always compared the port, so a
        // host-only confinement let :8090 open in place and then refused to remember
        // it. Both now mean the same thing by "the app".
        val thoth = "http://192.168.1.81:8089/"
        val allowed = ShellConfig(url = thoth).allowedHosts
        assertTrue(inApp(thoth, allowed, "http", "192.168.1.81", port = 8089))
        assertFalse(inApp(thoth, allowed, "http", "192.168.1.81", port = 8090))
        assertFalse(Restore.isRestorable(thoth, "http://192.168.1.81:8090/speakers"))
    }

    @Test
    fun `a sub-frame is never ejected to the browser`() {
        // Ejecting one would cancel the frame's load and throw the phone's browser
        // over the app — stranger than whatever the frame meant to render.
        val allowed = setOf("life.xinutec.org")
        assertFalse(inApp("https://life.xinutec.org/", allowed, "https", "embed.example.test"))
        assertTrue(
            staysInApp(
                appUrl = "https://life.xinutec.org/",
                allowed = allowed,
                isMainFrame = false,
                scheme = "https",
                host = "embed.example.test",
                port = -1,
            ),
        )
    }

    @Test
    fun `the identity provider must be listed, or the login hop is ejected`() {
        val idp = "dash.xinutec.org"
        val confined = ShellConfig(url = "https://health.xinutec.org/").allowedHosts
        assertFalse(inApp("https://health.xinutec.org/", confined, "https", idp))
        val withIdp = setOf("health.xinutec.org", idp)
        assertTrue(inApp("https://health.xinutec.org/", withIdp, "https", idp))
    }

    @Test
    fun `an https app cannot be walked down to cleartext in place`() {
        val allowed = setOf("health.xinutec.org")
        assertFalse(inApp("https://health.xinutec.org/", allowed, "http", "health.xinutec.org"))
    }

    @Test
    fun `a cleartext LAN app keeps its own scheme`() {
        // thoth and recall's viewer are http on private addresses; confining them
        // must not eject every page they serve.
        val thoth = "http://192.168.1.81:8089/"
        val allowed = ShellConfig(url = thoth).allowedHosts
        assertTrue(inApp(thoth, allowed, "http", "192.168.1.81", port = 8089))
        assertTrue(inApp(thoth, allowed, "https", "192.168.1.81", port = 8089))
    }

    @Test
    fun `a non-web scheme never opens in place`() {
        val allowed = setOf("life.xinutec.org")
        assertFalse(inApp("https://life.xinutec.org/", allowed, "intent", "life.xinutec.org"))
        assertFalse(inApp("https://life.xinutec.org/", allowed, null, "life.xinutec.org"))
    }

    @Test
    fun `an entry written as a URL is refused on the way up`() {
        // It would compare against a navigation's authority, which never carries a
        // scheme, so it would match nothing in silence — and on an app behind a login
        // that is the identity provider quietly confined out, surfacing months later
        // when the session expires.
        val thrown =
            try {
                ShellConfig(
                    url = "https://health.xinutec.org/",
                    allowedHosts = setOf("health.xinutec.org", "https://dash.xinutec.org"),
                )
                null
            } catch (e: IllegalArgumentException) {
                e
            }
        assertTrue("a scheme-bearing entry must be refused", thrown != null)
        assertTrue(thrown!!.message!!.contains("https://dash.xinutec.org"))
        // A trailing slash is the same mistake in a smaller spelling.
        assertThrowsIae { ShellConfig(url = "https://x.test/", allowedHosts = setOf("x.test/")) }
        assertThrowsIae { ShellConfig(url = "https://x.test/", allowedHosts = setOf("")) }
    }

    private fun assertThrowsIae(body: () -> Unit) {
        val threw =
            try {
                body()
                false
            } catch (_: IllegalArgumentException) {
                true
            }
        assertTrue("expected IllegalArgumentException", threw)
    }

    @Test
    fun `an empty set is a deliberate refusal to confine`() {
        assertTrue(inApp("https://home.xinutec.org/", emptySet(), "https", "anywhere.test"))
    }

    private fun inApp(
        app: String,
        allowed: Set<String>,
        scheme: String?,
        host: String?,
        port: Int = -1,
    ) = staysInApp(app, allowed, isMainFrame = true, scheme = scheme, host = host, port = port)

    // ---- sameOrigin: the test the native bridges gate on ----

    @Test
    fun `a page of the app is the app`() {
        val app = "https://coach.xinutec.org"
        assertTrue(sameOrigin(app, "https://coach.xinutec.org/"))
        assertTrue(sameOrigin(app, "https://coach.xinutec.org/settings"))
        assertTrue(sameOrigin(app, "https://coach.xinutec.org/settings?tab=1#x"))
        // The scheme's default port is the same origin, not a second one.
        assertTrue(sameOrigin(app, "https://coach.xinutec.org:443/settings"))
    }

    /**
     * The reason this function exists. A prefix test says yes to a host that
     * merely *starts* with the app's — which is a host the attacker owns, and
     * registering one costs nothing.
     */
    @Test
    fun `a look-alike host is not the app, however much of the name it shares`() {
        val app = "https://coach.xinutec.org"
        assertFalse(sameOrigin(app, "https://coach.xinutec.org.evil.test/"))
        assertFalse(sameOrigin(app, "https://coach.xinutec.org.evil.test/settings"))
        assertFalse(sameOrigin(app, "https://notcoach.xinutec.org/"))
        assertFalse(sameOrigin(app, "https://evil.test/?x=https://coach.xinutec.org"))
    }

    @Test
    fun `the neighbours on the same box are not the app either`() {
        assertTrue(sameOrigin("http://192.168.1.81:8089", "http://192.168.1.81:8089/x"))
        assertFalse(sameOrigin("http://192.168.1.81:8089", "http://192.168.1.81:8090/x"))
        assertFalse(sameOrigin("http://192.168.1.81:8089", "http://192.168.1.81/x"))
    }

    // An https app walked down to cleartext is a different origin, and the page
    // that answers is whoever is on the wire.
    @Test
    fun `the same host over cleartext is not the same origin`() {
        assertFalse(sameOrigin("https://coach.xinutec.org", "http://coach.xinutec.org/"))
    }

    @Test
    fun `nothing loaded yet is not the app`() {
        assertFalse(sameOrigin("https://coach.xinutec.org", null))
        assertFalse(sameOrigin("https://coach.xinutec.org", ""))
        assertFalse(sameOrigin("https://coach.xinutec.org", "about:blank"))
        assertFalse(sameOrigin("https://coach.xinutec.org", "javascript:alert(1)"))
    }
}
