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
    fun `the host comes out without scheme, port or userinfo`() {
        assertEquals("life.xinutec.org", hostOf("https://life.xinutec.org/"))
        assertEquals("life.xinutec.org", hostOf("https://life.xinutec.org/planner?x=1#y"))
        assertEquals("192.168.1.81", hostOf("http://192.168.1.81:8089/"))
        assertEquals("10.100.0.2", hostOf("http://10.100.0.2:8000/"))
        assertEquals("dash.xinutec.org", hostOf("https://user@dash.xinutec.org/login"))
        assertNull(hostOf("not-a-url"))
    }

    @Test
    fun `an app is confined to its own host by default`() {
        val cfg = ShellConfig(url = "https://health.xinutec.org/")
        assertEquals(setOf("health.xinutec.org"), cfg.allowedHosts)
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
        val thoth = ShellConfig(url = "http://192.168.1.81:8089/").allowedHosts
        assertEquals(setOf("192.168.1.81"), thoth)
        assertTrue(inApp("http://192.168.1.81:8089/", thoth, "http", "192.168.1.81"))
        assertTrue(inApp("http://192.168.1.81:8089/", thoth, "https", "192.168.1.81"))
    }

    @Test
    fun `a non-web scheme never opens in place`() {
        val allowed = setOf("life.xinutec.org")
        assertFalse(inApp("https://life.xinutec.org/", allowed, "intent", "life.xinutec.org"))
        assertFalse(inApp("https://life.xinutec.org/", allowed, null, "life.xinutec.org"))
    }

    @Test
    fun `an empty set is a deliberate refusal to confine`() {
        assertTrue(inApp("https://home.xinutec.org/", emptySet(), "https", "anywhere.test"))
    }

    private fun inApp(app: String, allowed: Set<String>, scheme: String?, host: String?) =
        staysInApp(app, allowed, scheme, host)
}
