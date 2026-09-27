import { Subject } from 'rxjs';
import { describe, expect, it } from 'vitest';

import { type History, wireBack } from './history';

/** A history stack that records what was done to it. */
function stack(): History & { entries: unknown[] } {
  const entries: unknown[] = [null];
  return {
    entries,
    go: (_path, _query, state) => void entries.push(state),
    back: () => void entries.pop(),
    path: () => '/s/x?task=1',
    getState: () => entries.at(-1),
  };
}

describe('wireBack', () => {
  it('gives the overlay one history entry of its own', () => {
    const history = stack();
    wireBack(history, new Subject());
    expect(history.entries).toEqual([null, { overlay: true }]);
  });

  it('takes the entry away when the overlay closes some other way', () => {
    const history = stack();
    const closed = new Subject<void>();
    wireBack(history, closed);
    closed.next();
    expect(history.entries).toEqual([null]);
  });

  it('leaves the page alone when back is what closed it', () => {
    const history = stack();
    const closed = new Subject<void>();
    wireBack(history, closed);
    history.back();
    closed.next();
    expect(history.entries).toEqual([null]);
  });
});
