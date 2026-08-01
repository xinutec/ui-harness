# @xinutec/ui-harness — the fleet's shared UI layer

Two halves, one repo:

- **`src/` — phone-width layout checks (Playwright).** The dynamic
  layout-measurement layer (L2 of the layout-quality architecture): render a
  screen at true phone geometry and assert about the **painted pixels**, not the
  source. Consumed over npm by twelve Angular frontends.
- **`android/` — the WebView app shell (Gradle).** The Activity every wrapper app
  is a WebView around: system-bar insets, page-coloured bars, back through SPA
  history, restore-on-reopen. Consumed by path, as a composite build.

They share a repo because they are the same job seen from two sides — one keeps
the web UI honest about phone geometry, the other is the frame that UI is shown
in on a phone — and because the alternative was eight hand-maintained copies of
one Activity, already drifting.

**Neither half can disturb the other's consumers.** `files: ["dist"]` in
`package.json` means `android/` never reaches an npm consumer's `node_modules`,
and npm consumers pin a SHA, so an Android commit is invisible to them until they
bump. Gradle consumers resolve by path against whatever is checked out, so a
change to `src/` is invisible to them entirely.

## Web: why it's a package (and why it builds to JS on install)

Extracted from the life app's e2e harness after it caught, in one week: a 497px
toggle row in a 380px sheet, nested scrollers that broke swipe, and a suite that
had silently run at 1280×720 while claiming 390px.

The measurement code imports only **types** from `@playwright/test` (erased at
compile), so the built JS pulls in **no** copy of the runner — load-bearing,
because two `@playwright/test` instances make every suite die with "No tests
found". The consuming app resolves the one real `@playwright/test` from its own
`node_modules` (declared here as a **peerDependency**).

Consumers load **compiled JS + `.d.ts`** from `dist/`, not TypeScript source:
Playwright only transpiles TS *outside* `node_modules`, so a TS-source package
would be unimportable from an installed dependency. `dist/` is gitignored; the
`prepare` script builds it at install time (`tsc`), so a plain `git clone`
install produces a ready-to-load package. (This replaces the old in-monorepo
mechanism of importing `src/ui-harness.ts` by relative path — that only worked
because both lived in the same tree.)

## Consuming (per app)

Installed as a **public git dependency** — anonymous `https` clone, no registry,
no token, no `.npmrc`:

```sh
npm i -D github:xinutec/ui-harness   # @playwright/test is a peer — apps already have it
```

```jsonc
// frontend/package.json
"devDependencies": { "@xinutec/ui-harness": "github:xinutec/ui-harness" }
```

In a Docker build on `node:alpine`, add git so `npm ci` can clone the dep:
`RUN apk add --no-cache git ca-certificates && npm ci`.

```ts
// frontend/e2e/ui-pages.spec.ts
import { expectNoTextOverlaps, expectNoHorizontalOverflow, expectViewportIsPhone } from '@xinutec/ui-harness';
```

## The config and the server

An app no longer writes a Playwright config; it says what it *is* and gets one.

```js
// frontend/e2e/harness.mjs — the app-specific half, read by BOTH the config
// and the static server, so they cannot disagree.
/** @type {import('@xinutec/ui-harness/config').HarnessSpec} */
export default {
  app: 'life',                      // must be in the APPS table (it IS the port)
  dist: 'dist/life-web/browser',    // the built bundle to serve
  api: { '/api/me': { userId: 'test' } },  // fallback for unrouted /api/ calls
};
```

```ts
// frontend/playwright.config.ts
import { defineConfig, devices } from '@playwright/test';
import { phoneConfig } from '@xinutec/ui-harness/config';
import harness from './e2e/harness.mjs';

export default defineConfig(phoneConfig(harness, devices, { goldens: true }));
```

**The port is an allocation, so it is allocated.** `APPS` in `src/config.ts` is
an ordered list and a port is an index into it — two apps cannot share one, and
an app the list does not name gets a loud error rather than a number someone
guessed. This replaces two fleet lint rules that read eleven hand-written
configs looking for collisions after the fact. They found real ones: recall and
utterance both on 4293 (recall's suite went 8/8 pass to 8/8 fail purely by
running at the same time), health and memview both on 4273, and three servers
that defaulted to the port of the app they had been copied from.

`devices` is passed **in** rather than imported here. That keeps this module
free of a runtime `@playwright/test` (see above), and it means an app hands over
its device table without getting to choose from it — `devices['Desktop Chrome']`
in a phone-width suite is not expressible. For the same reason `HarnessOptions`
has no `use` or `projects`: overriding those *is* the failure, so it is a type
error rather than a convention. What an app may still set: `testMatch`,
`timeout`, `goldens`.

`webServer.command` is generated and runs `dist/serve.js`, the fleet's one
static server for a production bundle — SPA fallback, the content types the
service worker needs, containment above the bundle, and the `/api/` stub from
the spec. To serve a build by hand, from `frontend/`:

```sh
node node_modules/@xinutec/ui-harness/dist/serve.js   # no arguments: the spec has them
```

An app that serves its own bundle (thoth's Swift binary is the thing under test)
sets `server: { command: (port) => …, cwd, host, reuseExistingServer }` and still
takes the allocated port.

Every app's suite includes one viewport self-guard spec:

```ts
test('the suite really runs at phone geometry', async ({ page }) => {
  await page.goto('/');
  await expectViewportIsPhone(page);
});
```

## API

- `expectNoTextOverlaps(page, testInfo, rootSel?, tol?)` — no two pieces of
  painted text share pixels. Glyph-level (`Range.getClientRects()`), rects
  clipped to every overflow-clipping ancestor; same-node fragment pairs skipped.
- `expectNoHorizontalOverflow(page, testInfo, rootSel?, allow?, tol?)` — nothing
  escapes sideways, on EITHER edge; intended horizontal scrollers are an explicit
  allow-list (computed `overflow-x` is a trap). The left edge matters more than it
  sounds: a right-hand spill announces itself by scrolling the page, while content
  pushed off the left is silent — LTR gives no scroll room left of the origin, so
  it is simply unreadable, and a right-edge-only check stays green. (This check was
  right-edge-only until life's wellbeing chart shipped with its axis words off the
  screen and three passing tests.)
- `expectNoOccludedControls(page, sels, rootSel?)` — interactive controls aren't
  hidden behind other paint (a FAB sunk under the bottom nav).
- `expectViewportIsPhone(page, width?)` — the checker-checker: fails loudly if
  device emulation ever silently drops.
- `expectNoClippedText(page, testInfo, rootSel?, minPx?)` — no visible text is
  permanently sheared by an overflow-clipping ancestor. The scroll test keeps it
  honest: text scrolled out of a scroller comes back, so only a clip the container
  *cannot* scroll away counts.
- `expectIconFontLoaded(page, family?)` — the icon font actually loaded (no
  tofu boxes for Material Icons).
- `expectNoClippedIcons(page, testInfo, rootSel?, minPx?)` — every icon has room
  for its glyph. `mat-icon` carries `overflow: hidden`, which voids the
  `min-width: auto` floor that stops a flex item collapsing below its content, so
  an icon beside a long text sibling absorbs the row's shrink and is clipped
  rather than scaled — recall's status banner painted 9.6px of a 24px hourglass
  while the shorter sentence beside it lost 0.7px and looked fine. No other check
  sees it: shrinking is what *avoids* overflow, nothing overlaps, nothing is
  occluded, and `expectNoClippedText` skips icon ligatures by design. Measures the
  painted box against **font-size**, not `scrollWidth`, so an unloaded icon font
  (whose content is the literal ligature word) cannot flag every icon in the app —
  that failure belongs to `expectIconFontLoaded`, which is worth calling beside it.
- `expectCanvasLegible(page, testInfo, sel?, minRatio?, minPainted?)` — a
  canvas's marks are actually visible against the page behind them. Canvas is
  the one place the stylesheet does not reach: an unparseable colour assigned to
  `fillStyle` is ignored **in silence**, leaving the previous value (black, on a
  fresh context). Material's system tokens compute to `light-dark(#…, #…)`,
  which no canvas can parse, so passing one straight through paints black on a
  dark background with nothing anywhere reporting a problem — and nothing else
  here can see it, since the layout checks measure geometry, unit tests never
  rasterise, and the page stays valid. Solidly-painted pixels only (alpha > 200),
  scored against the nearest **opaque ancestor** rather than `document.body`,
  which several fleet apps leave transparent. Call it under
  `page.emulateMedia({ colorScheme })` for BOTH schemes — the classic form of
  this bug is invisible in light mode. It catches marks that are *illegible*,
  not merely *wrong-coloured*; dev-lint's `DL-CANVAS-SYSTEM-TOKEN` covers the
  known cause statically.
- `swipeUp(page, opts?)` — a real CDP touch flick, not a `scrollTop` shortcut.
- `expectReachableByScroll(page, locator, scrollerSel)` — swipe until the target
  is on-screen; fails if a nested-scroller fight keeps it unreachable.

## Android: the WebView app shell

`android/` is a Gradle build publishing one library, `org.xinutec:shell` — the
Activity the fleet's eight WebView wrappers are. An app declares its URL and its
opt-ins; the shell owns system-bar insets (including the IME), bars painted with
the page's own colour, restore-on-reopen filtered so a spent login callback can't
strand the app, and back through SPA history on the modern dispatcher.

Consumed as a **composite build**, resolved by path, with no version anywhere:

```kotlin
// the app's android/settings.gradle.kts
includeBuild("../../ui-harness/android") {
    dependencySubstitution {
        substitute(module("org.xinutec:shell")).using(project(":main"))
    }
}
```

Full API, the manifest attributes an app still owns, and how to build it:
[android/README.md](android/README.md).

## Developing the harness

`npm ci && npm test` runs the web half's own specs. Three kinds:
`tests/measurement.spec.ts` — `page.setContent` DOM fixtures for the layout
checks (ellipsis-phantom, clip-model and icon-glyph-vs-badge false positives,
real overlap/overflow detection, the allow-list); `tests/config.spec.ts` — the
port allocation and the shape of the config it hands out; `tests/serve.spec.ts`
— the static server against a real bundle-shaped directory. `npm run build`
compiles `src/` → `dist/`.

Twelve frontends consume this (coach, fleetwatch, gamepads, health, home, life,
memview, messages, observe, recall, thoth, utterance) and all of them now take
their config from it, so a change here lands everywhere at once — run their
`ui-check` after anything that touches `config.ts` or `serve.ts`.

`scripts/verify.sh` covers both halves and is what the pre-commit hook runs: the
npm build and specs, then the shell's unit tests and an `assembleDebug` of life
against it. Eight apps ride on the Android half, so a red run there is a real
regression in every one of them.
