import { defineConfig } from 'vitest/config';

/**
 * The harness's unit tests, for the parts that are pure functions rather than
 * measurements taken from a painted page. Those live in `tests/` and run under
 * Playwright in a real browser; these sit beside their source and run in jsdom,
 * because a DOM API is all they need.
 */
export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['src/**/*.spec.ts'],
  },
});
