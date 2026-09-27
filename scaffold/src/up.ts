/**
 * Where up goes from a screen, declared on its route and read by the bar.
 *
 * Up is the parent screen, not history: a screen opened from a link or a
 * notification still has a parent, and back from it must not leave the app.
 * Declared on the route rather than set by the page, so that whether a screen
 * has one is visible in the route table without running anything.
 *
 *     { path: 's/:id/w/:run', component: WorkflowView, data: { up: '/s/:id' } }
 */

/** A route's `data.up`: a path, whose `:name` segments are filled from the route's parameters. */
export type UpDeclaration =
  | string
  | {
      readonly path: string;
      /** Query parameters carried over from the screen's own URL to its parent's. */
      readonly keep?: readonly string[];
      /** What the arrow says to a screen reader. Defaults to `back`. */
      readonly label?: string;
    };

/** Up, resolved against the screen on view: a router link. */
export interface Up {
  readonly path: string;
  readonly query: Readonly<Record<string, string>>;
  readonly label: string;
}

/** The key a route's `data` declares up under. */
export const UP = 'up';

/**
 * Fill `declared` from the parameters and query of the screen on view.
 *
 * Throws on a `:name` the route does not supply: that is a route table naming
 * a parent it cannot reach, and a bar pointing somewhere wrong is worse than a
 * build that fails.
 */
export function resolveUp(
  declared: UpDeclaration,
  params: Readonly<Record<string, string>>,
  query: Readonly<Record<string, string>>,
): Up {
  const { path, keep = [], label = 'back' }: Exclude<UpDeclaration, string> =
    typeof declared === 'string' ? { path: declared } : declared;
  const filled = path
    .split('/')
    .map((segment) => {
      if (!segment.startsWith(':')) return segment;
      const value = params[segment.slice(1)];
      if (value === undefined) throw new Error(`up ${path}: the route has no parameter ${segment}`);
      return encodeURIComponent(value);
    })
    .join('/');
  const carried: Record<string, string> = {};
  for (const name of keep) {
    const value = query[name];
    if (value !== undefined) carried[name] = value;
  }
  return { path: filled, query: carried, label };
}
