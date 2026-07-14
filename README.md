# @xinutec/ui-harness — shared phone-width layout checks (Playwright)

The fleet's dynamic layout-measurement layer (L2 of the layout-quality
architecture): render a screen at true phone geometry and assert about the
**painted pixels**, not the source. Extracted from the life app's e2e harness
after it caught, in one week: a 497px toggle row in a 380px sheet, nested
scrollers that broke swipe, and a suite that had silently run at 1280×720 while
claiming 390px.

## Why it's a package (and why it builds to JS on install)

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

Config convention (the viewport MUST live in the project `use`, not the global
one — a device spread carries its own viewport and project-level `use` overrides
global; that exact mistake ran life's "phone" tests at desktop width for months):

```ts
projects: [{ name: 'chromium', use: { ...devices['Pixel 7'], deviceScaleFactor: 1 } }],
```

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
- `expectIconFontLoaded(page, family?)` — the icon font actually loaded (no
  tofu boxes for Material Icons).
- `swipeUp(page, opts?)` — a real CDP touch flick, not a `scrollTop` shortcut.
- `expectReachableByScroll(page, locator, scrollerSel)` — swipe until the target
  is on-screen; fails if a nested-scroller fight keeps it unreachable.

## Developing the harness

`npm ci && npm test` runs the package's own fixture specs (`page.setContent` DOM
fixtures — no app server): ellipsis-phantom, clip-model and icon-glyph-vs-badge
false positives, real overlap/overflow detection, the allow-list. `npm run build`
compiles `src/` → `dist/`. Seven frontends consume this (coach, home, life,
messages, health, fleetwatch + thoth) — run both after any change.
