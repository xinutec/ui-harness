import { expect, type Page, test } from '@playwright/test';
import { expectRecoversFromMissingBundle, MISSING_BUNDLE_RECOVERY } from '../src/ui-harness';

/**
 * Fixture specs for the missing-bundle recovery. The page is an index whose
 * `main-*.js` draws `#ready`, served at a made-up origin, since a reload needs a
 * real URL.
 */
const ORIGIN = 'http://fixture.test';

async function serve(page: Page, withRecovery: boolean, bundle: (n: number) => number): Promise<() => number> {
  let loads = 0;
  let bundles = 0;
  await page.route(`${ORIGIN}/**`, (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.startsWith('/main-')) {
      bundles += 1;
      const status = bundle(bundles);
      return status === 200
        ? route.fulfill({
            contentType: 'text/javascript',
            body: "document.body.insertAdjacentHTML('beforeend', '<p id=ready>started</p>');",
          })
        : route.fulfill({ status, body: '' });
    }
    loads += 1;
    return route.fulfill({
      contentType: 'text/html',
      body: `<!doctype html><html><head>${withRecovery ? MISSING_BUNDLE_RECOVERY : ''}</head><body><script src="main-ABC123.js" type="module"></script></body></html>`,
    });
  });
  return () => loads;
}

test('a page carrying the recovery starts after its bundle fails once', async ({ page }) => {
  await serve(page, true, () => 200);
  await expectRecoversFromMissingBundle(page, `${ORIGIN}/`, '#ready');
});

test('a page without it stays blank, and the check says so', async ({ page }) => {
  await serve(page, false, () => 200);
  await expect(expectRecoversFromMissingBundle(page, `${ORIGIN}/`, '#ready')).rejects.toThrow(
    /never started/,
  );
});

test('a bundle that is really gone reloads the page once, not forever', async ({ page }) => {
  const loads = await serve(page, true, () => 404);
  await page.goto(`${ORIGIN}/`);
  await page.waitForTimeout(2_000);
  expect(loads()).toBe(2);
});

test('a check that never saw the bundle refused says so, rather than passing', async ({ page }) => {
  // The page starts without asking for main-*.js at all: nothing was tested.
  await page.route(`${ORIGIN}/**`, (route) =>
    route.fulfill({ contentType: 'text/html', body: '<p id=ready>started</p>' }),
  );
  await expect(expectRecoversFromMissingBundle(page, `${ORIGIN}/`, '#ready')).rejects.toThrow(
    /requested 0 time/,
  );
});
