import { Subject } from 'rxjs';
import { describe, expect, it } from 'vitest';

import { type History, wireBack } from './history';

type Pop = Parameters<Parameters<History['subscribe']>[0]>[0];

/** A history stack that records what was done to it, and says when back pops. */
function stack(): History & { entries: unknown[]; navigate(): void } {
  const entries: unknown[] = [null];
  const listeners: ((event: Pop) => void)[] = [];
  const history = {
    entries,
    go: (_path: string, _query?: string, state?: unknown) => void entries.push(state),
    back: () => {
      entries.pop();
      for (const listen of listeners) listen({ state: entries.at(-1) } as Pop);
    },
    path: () => '/s/x?task=1',
    getState: () => entries.at(-1),
    subscribe: (listen: (event: Pop) => void) => {
      listeners.push(listen);
      return { unsubscribe: () => undefined };
    },
    navigate: () => void entries.push({ route: true }),
  };
  return history as unknown as History & { entries: unknown[]; navigate(): void };
}

describe('wireBack', () => {
  it('gives the overlay one history entry of its own', () => {
    const history = stack();
    wireBack(history, new Subject());
    expect(history.entries).toEqual([null, { overlay: expect.any(String) }]);
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

  // A sheet that navigates as it closes: the route is pushed before the exit
  // animation ends, so the sheet's entry is under it when the sheet reports
  // closed. Back from the new screen must not stop on that entry (#1801).
  it('steps past an entry whose overlay closed under a navigation', () => {
    const history = stack();
    const closed = new Subject<void>();
    wireBack(history, closed);
    history.navigate();
    closed.next();
    expect(history.entries).toHaveLength(3);
    history.back();
    expect(history.entries).toEqual([null]);
  });

  it('stops on the entry of an overlay still open', () => {
    const history = stack();
    wireBack(history, new Subject());
    history.navigate();
    history.back();
    expect(history.entries).toEqual([null, { overlay: expect.any(String) }]);
  });
});
