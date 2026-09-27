/**
 * Where up goes from a screen, declared on its route and read by the bar.
 *
 * Up is the parent screen, not history: a screen opened from a link or a
 * notification still has a parent, and back from it must not leave the app.
 * Declared on the route rather than set by the page, so that whether a screen
 * has one is visible in the route table without running anything.
 *
 *     { path: 's/:id/w/:run', component: WorkflowView, data: { up: '/s/:id' } }
 *
 * A screen with several parents — a detail reached from many lists — declares
 * `opener: true`: up returns to the screen that opened it, as back does, and
 * `path` is where it goes when nothing in the app did (Android's "Up vs Back").
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
      /** Return to the screen that opened this one; `path` only when none in the app did. */
      readonly opener?: boolean;
    };

/** Up, resolved against the screen on view: a router link. */
export interface Up {
  readonly path: string;
  readonly query: Readonly<Record<string, string>>;
  readonly label: string;
  /** Up is back while an in-app screen opened this one. */
  readonly opener: boolean;
}

/** The key a route's `data` declares up under. */
export const UP = 'up';

/**
 * The key a route's `data` sets to `true` for a peer top-level screen: one of
 * several equal main screens, which keeps the menu and has no up: a destination
 * the menu lists. Every route but the root declares one or the other (dev-lint
 * #1793); a utility screen the menu opens is drilled in, and declares up.
 */
export const TOP = 'top';

/**
 * A route's up, from its `data`: none for the root or a `top` screen. Throws on
 * a route that declares both, which says two contradictory things about its bar.
 */
export function declaredUp(data: Readonly<Record<string, unknown>>): UpDeclaration | undefined {
  const up = data[UP] as UpDeclaration | undefined;
  if (up !== undefined && data[TOP] === true) throw new Error('a route declares both up and top');
  return up;
}

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
  const { path, keep = [], label = 'back', opener = false }: Exclude<UpDeclaration, string> =
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
  return { path: filled, query: carried, label, opener };
}
