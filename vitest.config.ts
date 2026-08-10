import { defineConfig } from 'vitest/config';

/**
 * The harness's unit tests, for the parts that are pure functions rather than
 * measurements taken from a painted page. Those live in `tests/` and run under
 * Playwright in a real browser; these sit beside their source and run in jsdom,
 * because a DOM API is all they need.
 *
 * `scripts/` is in scope for the same reason `src/` is: bump-consumers rewrites
 * thirteen repos' pins, its first version shipped a substitution bug the moment
 * it ran, and type-checking cannot tell a regex that matches nothing from one
 * that matches the right line.
 */
export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['src/**/*.spec.ts', 'scripts/**/*.spec.ts'],
  },
});
