// @vitest-environment node
/**
 * The runner and the browser read the same clock.
 *
 * messages built an expected midnight in the runner (`new Date(y, m, 1)`) and
 * compared it with the app's; in CI the runner kept UTC while the browser
 * rendered in London, and the two were an hour apart.
 */

import { afterEach, describe, expect, it } from 'vitest';

import { phoneConfig } from './config.js';

const devices = {
  'Pixel 7': {
    viewport: { width: 412, height: 915 },
    userAgent: 'phone',
    deviceScaleFactor: 2.625,
    isMobile: true,
    hasTouch: true,
    defaultBrowserType: 'chromium' as const,
  },
};
const spec = { app: 'messages', dist: 'dist' } as const;

describe('phoneConfig zone', () => {
  const before = process.env.TZ;
  afterEach(() => {
    process.env.TZ = before;
  });

  it('gives the runner the zone the browser renders in', () => {
    process.env.TZ = 'UTC';
    const config = phoneConfig(spec, devices);
    expect(config.projects?.[0]?.use?.timezoneId).toBe('Europe/London');
    expect(process.env.TZ).toBe('Europe/London');
    // 1 October 2026 is in British Summer Time: midnight there is 23:00 UTC.
    expect(new Date(2026, 9, 1).getTime()).toBe(Date.UTC(2026, 8, 30, 23));
  });

  it('follows an app that renders in another zone', () => {
    const config = phoneConfig(spec, devices, { timezoneId: 'UTC' });
    expect(config.projects?.[0]?.use?.timezoneId).toBe('UTC');
    expect(new Date(2026, 9, 1).getTime()).toBe(Date.UTC(2026, 9, 1));
  });
});
