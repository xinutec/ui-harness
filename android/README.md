# org.xinutec:shell — the fleet's Android WebView shell

Seven apps (coach, fleetwatch, health, home, life, messages, thoth) are the same
thing: an Angular SPA shown full-screen in a `WebView`, no address bar, no tabs, a
home-screen icon. Each used to keep its own copy of that Activity. This is the
copy they share.

## Consuming it

In the app's `android/settings.gradle.kts`, at the top level:

```kotlin
includeBuild("../../ui-harness/android") {
    dependencySubstitution {
        substitute(module("org.xinutec:shell")).using(project(":main"))
    }
}
```

In `app/build.gradle.kts`:

```kotlin
// Fail in a sentence rather than a stacktrace when the shell isn't beside us.
require(file("../../ui-harness/android").isDirectory) {
    "ui-harness must be checked out beside this repo (~/Code/ui-harness)"
}

dependencies {
    implementation("org.xinutec:shell")
}
```

**No version, ever.** The build resolves by path against whatever is checked out —
the same roll-forward stance as `:latest` for the fleet's images. There is no
publishing step, no submodule and no pin to bump, so a fix here is live in every
app at its next build, and an app that would break the shell breaks it *here*,
where the change is.

The included build brings its own `pluginManagement`, but AGP and Kotlin must
agree with the app's version catalog — one Gradle invocation cannot load two
Android plugins. They diverge loudly rather than silently; that is the feature.

## Writing an app

The smallest one is its URL:

```kotlin
class MainActivity : WebShellActivity() {
    override val shell = ShellConfig(url = "https://home.xinutec.org/")
}
```

Everything else is an override rather than a flag, because a flag can only express
what was anticipated:

| you need | override |
|---|---|
| JS bridges, extra `WebSettings` | `onWebViewCreated(web)` |
| a notification's deep link | `startUrl(intent)` |
| anything else on the page's lifecycle | `createWebViewClient()` → subclass `ShellWebViewClient` |
| camera grants, file chooser, console | `createWebChromeClient()` → subclass `ShellWebChromeClient` |
| an overlay that swallows back | `onBackBeforeHistory()` + `hasExtraBackTargets()` + `syncBack()` |
| "up" where SPA history has none | `onBackAtRoot()` + `hasExtraBackTargets()` |
| work on launch (schedule a poll, arm a geofence) | `onCreate`, after `super` |
| hardware keys | `onKeyDown` / `onKeyUp`, as on any Activity |

The two client classes are `open inner class`es, so an app subclasses them and
calls `super` — it extends the shell's behaviour rather than replacing it.

## What the app's manifest still owns

A library cannot set attributes on the app's own `<activity>`, so these stay in
each manifest (and are held identical across apps by dev-lint's
`DL-ANDROID-WEBVIEW-MANIFEST`):

- `configChanges="orientation|screenSize|keyboardHidden|screenLayout"` — keeps the
  WebView, its route and its scroll position across rotation. The shell checks
  this one at runtime and warns in logcat under `web-shell`, because without it
  nothing fails: the page just reloads on every turn of the phone.
- `windowSoftInputMode="adjustResize"` — pre-35 devices resize the window for the
  keyboard; 35+ get the shell's `Type.ime()` padding instead.
- `enableOnBackInvokedCallback="true"` — predictive back on API 33+.

## Building it

```sh
nix develop .#android --command ./android/gradlew -p android :main:test
```

Building any consuming app builds this too, through the composite. `scripts/verify.sh`
runs the library's own unit tests and then builds life against it, so a breaking
change lands in this repo rather than in seven apps at once.
