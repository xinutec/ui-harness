import { describe, expect, it } from 'vitest';

import { type Depth, type Step, settle } from './depth';

/** Run `steps` from the page load, and say how deep each left the screen on view. */
function depths(steps: readonly Step[]): number[] {
  let at: Depth | undefined;
  return steps.map((step) => {
    at = settle(at, step);
    return at.current;
  });
}

const push = (id: number): Step => ({ id, trigger: 'imperative', replace: false });
const pop = (id: number, restored?: number): Step => ({ id, trigger: 'popstate', restored, replace: false });

describe('settle', () => {
  it('starts at the screen the app first showed, which nothing in the app opened', () => {
    expect(depths([push(1)])).toEqual([0]);
  });

  it('goes one deeper for each screen pushed on top', () => {
    expect(depths([push(1), push(2), push(3)])).toEqual([0, 1, 2]);
  });

  it('stays at the same depth for a replaced screen', () => {
    expect(depths([push(1), push(2), { id: 3, trigger: 'imperative', replace: true }])).toEqual([0, 1, 1]);
  });

  it('returns to the depth of the entry back restores', () => {
    // The phone's case: a restored history screen, the overview opened from it,
    // then back. Counting navigations called this third screen "opened" and the
    // arrow stepped back into nothing.
    expect(depths([push(1), push(2), pop(3, 1)])).toEqual([0, 1, 0]);
  });

  it('knows an entry restored after its depth was itself restored', () => {
    expect(depths([push(1), push(2), pop(3, 1), pop(4, 2), pop(5, 3)])).toEqual([0, 1, 0, 1, 0]);
  });

  it('reads an entry this page load did not make as the first screen', () => {
    expect(depths([push(1), push(2), pop(3, 99)])).toEqual([0, 1, 0]);
    expect(depths([push(1), push(2), pop(3)])).toEqual([0, 1, 0]);
  });
});
