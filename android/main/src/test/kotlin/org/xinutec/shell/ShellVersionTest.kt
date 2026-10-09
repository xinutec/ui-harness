package org.xinutec.shell

import org.junit.Assert.assertEquals
import org.junit.Test

class ShellVersionTest {
    @Test
    fun `appends the shell commit to the WebView agent`() {
        assertEquals(
            "Mozilla/5.0 (Linux; Android 17; wv) Chrome/156 Mobile XinutecShell/5e3a464e2682",
            shellUserAgent("Mozilla/5.0 (Linux; Android 17; wv) Chrome/156 Mobile", "5e3a464e2682"),
        )
    }

    @Test
    fun `a second stamp replaces the first rather than stacking`() {
        val once = shellUserAgent("Base", "aaa")
        assertEquals("Base XinutecShell/bbb", shellUserAgent(once, "bbb"))
    }

    @Test
    fun `the beacon asks for the app's own root, naming the app as referer`() {
        val b = shellBeacon("https://life.xinutec.org/", "Base XinutecShell/abc")
        assertEquals("https://life.xinutec.org/", b.url)
        assertEquals("HEAD", b.method)
        assertEquals("https://life.xinutec.org/", b.headers["Referer"])
        assertEquals("Base XinutecShell/abc", b.headers["User-Agent"])
    }
}
