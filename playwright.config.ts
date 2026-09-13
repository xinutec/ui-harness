import { defineConfig, devices } from '@playwright/test';

/**
 * Config for the harness's OWN fixture specs (tests/), which exercise the
 * measurement functions against page.setContent DOM — no app, no server.
 * Same device convention the consuming apps use, so the fixtures measure at
 * the geometry the real checks run at — and, since `phoneConfig` pins them,
 * the same locale and zone. Repeated rather than imported: this file cannot
 * call phoneConfig (there is no app and no server to describe), and fixtures
 * measured in a different locale from the consumers would be measuring
 * something else.
 */
export default defineConfig({
  testDir: './tests',
  reporter: [['list']],
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Pixel 7'],
        deviceScaleFactor: 1,
        locale: 'en-GB',
        timezoneId: 'Europe/London',
      },
    },
  ],
});
