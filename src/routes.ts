/**
 * Every screen an app routes to, as the URLs a render visits.
 *
 * The list is the app's `e2e/routes.json`, which dev-lint's `ui-routes` writes
 * from the route table and DL-E2E-ROUTES-STALE keeps current, so a spec that
 * loops over it renders each screen, not only the ones another spec happens to
 * open. A `:param` is filled from the app's samples; a route with a parameter
 * the samples lack is refused by name, never skipped.
 */

import { readFileSync } from "node:fs";

/** One screen: its route as written, and the URL that renders it. */
export interface Screen {
  readonly route: string;
  readonly url: string;
}

/** The routes in an app's `routes.json`. */
export function routesFrom(file: string): string[] {
  const parsed: unknown = JSON.parse(readFileSync(file, "utf8"));
  const routes = typeof parsed === "object" && parsed !== null && "routes" in parsed ? parsed.routes : undefined;
  if (!Array.isArray(routes) || !routes.every((r): r is string => typeof r === "string")) {
    throw new Error(`${file}: want {"routes": ["/", …]} — regenerate it with dev-lint's ui-routes`);
  }
  return routes;
}

/**
 * Each route as a URL, every `:param` replaced by `samples[param]`, encoded.
 * Throws when any parameter has no sample, naming every one at once.
 */
export function screens(routes: readonly string[], samples: Readonly<Record<string, string>>): Screen[] {
  const lacking = new Set<string>();
  const out = routes.map((route) => ({
    route,
    url: route.replace(/:([A-Za-z0-9_]+)/g, (_, name: string) => {
      const value = samples[name];
      if (value === undefined) {
        lacking.add(name);
        return `:${name}`;
      }
      return encodeURIComponent(value);
    }),
  }));
  if (lacking.size > 0) {
    throw new Error(`no sample for ${[...lacking].map((n) => `:${n}`).join(", ")} — add it to the spec's samples`);
  }
  return out;
}
