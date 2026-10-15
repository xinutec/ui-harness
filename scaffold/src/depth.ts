/**
 * How deep in this page load's own history the screen on view is: 0 for the
 * screen the app first showed, one more for each screen pushed on top.
 *
 * Counted per history entry, not per navigation. Back is a navigation too, so
 * a count of them calls the first screen "opened" once the user has been
 * somewhere and come back, and up then steps back into nothing.
 */
export interface Depth {
  readonly current: number;
  /** The depth each navigation left, by its id: what a later back restores. */
  readonly byId: ReadonlyMap<number, number>;
}

/** One finished navigation, as the router started it. */
export interface Step {
  readonly id: number;
  readonly trigger: 'imperative' | 'popstate' | 'hashchange';
  /** For back and forward: the navigation whose entry is restored, if the entry says. */
  readonly restored?: number;
  /** Replaces the entry on view rather than pushing one. */
  readonly replace: boolean;
}

/** The depth after `step`, from the depth before it; `undefined` before the first. */
export function settle(before: Depth | undefined, step: Step): Depth {
  const current =
    before === undefined
      ? 0
      : step.trigger === 'imperative'
        ? before.current + (step.replace ? 0 : 1)
        : // An entry this page load did not make is outside the app's own history.
          ((step.restored === undefined ? undefined : before.byId.get(step.restored)) ?? 0);
  const byId = new Map(before?.byId);
  byId.set(step.id, current);
  return { current, byId };
}
