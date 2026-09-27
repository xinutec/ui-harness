import { expect, test } from '@playwright/test';
import { expectBackClosesOverlay, expectUpInTheBar } from '../src/ui-harness';

/**
 * Fixture specs for the scaffold checks. They need history, which a
 * `setContent` page (about:blank) cannot push to, so each fixture is served at a
 * made-up origin by `page.route`.
 */
const ORIGIN = 'http://fixture.test';

async function serve(page: import('@playwright/test').Page, body: string): Promise<void> {
  await page.route(`${ORIGIN}/**`, (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>${body}</body></html>`,
    }),
  );
}

/** A bar whose leading icon button shows `icon`, titled `title`. */
const bar = (icon: string, title = 'screen'): string =>
  `<ui-scaffold><mat-toolbar><button><mat-icon>${icon}</mat-icon></button><h1>${title}</h1></mat-toolbar></ui-scaffold>`;

/** A button opening a sheet, wired into history as `Sheets` wires it, or not at all. */
const opener = `
  <button id="wired">wired</button><button id="raw">raw</button>
  <script>
    const show = () => {
      const sheet = document.createElement('mat-bottom-sheet-container');
      sheet.textContent = 'a sheet';
      document.body.append(sheet);
      return sheet;
    };
    document.getElementById('wired').onclick = () => {
      const sheet = show();
      history.pushState({ overlay: true }, '');
      addEventListener('popstate', () => sheet.remove(), { once: true });
    };
    document.getElementById('raw').onclick = show;
  </script>`;

test('a detail screen leading with the arrow passes', async ({ page }) => {
  await serve(page, bar('arrow_back'));
  await page.goto(`${ORIGIN}/s/1`);
  await expectUpInTheBar(page);
});

test('a detail screen that kept the root menu is named', async ({ page }) => {
  await serve(page, bar('menu'));
  await page.goto(`${ORIGIN}/s/1`);
  await expect(expectUpInTheBar(page)).rejects.toThrow(/leads with "menu", not arrow_back/);
});

test('a detail screen that never named itself is named', async ({ page }) => {
  await serve(page, bar('arrow_back', ''));
  await page.goto(`${ORIGIN}/s/1`);
  await expect(expectUpInTheBar(page)).rejects.toThrow(/heading is empty/);
});

test('back closes a sheet wired into history, and stays on the screen', async ({ page }) => {
  await serve(page, opener);
  await page.goto(`${ORIGIN}/`);
  await page.goto(`${ORIGIN}/s/1`);
  await expectBackClosesOverlay(page, () => page.locator('#wired').click());
});

test('back from an unwired sheet leaves the screen, and says so', async ({ page }) => {
  await serve(page, opener);
  await page.goto(`${ORIGIN}/`);
  await page.goto(`${ORIGIN}/s/1`);
  await expect(expectBackClosesOverlay(page, () => page.locator('#raw').click())).rejects.toThrow(
    /back left the screen/,
  );
});
