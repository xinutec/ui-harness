/**
 * What keeping the screen on has to get right, tested where it can be.
 *
 * All of it is bookkeeping around one browser API — what is held, what is
 * remembered, and which refusals count — so jsdom with a stand-in `wakeLock` is
 * the whole environment it needs. What cannot be tested here is whether Android
 * honours the lock; that is a phone, and it is checked on one.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ScreenAwake } from './awake.js';

/** A lock the browser might hand out, and can take back. */
class FakeSentinel {
  released = false;
  release = vi.fn(async () => {
    this.released = true;
  });
}

let handed: FakeSentinel[] = [];
let request: ReturnType<typeof vi.fn>;

/** Give the window a wake lock that works. */
function withWakeLock(): void {
  request = vi.fn(async () => {
    const sentinel = new FakeSentinel();
    handed.push(sentinel);
    return sentinel;
  });
  Object.defineProperty(window.navigator, 'wakeLock', {
    value: { request },
    configurable: true,
  });
}

function withoutWakeLock(): void {
  delete (window.navigator as { wakeLock?: unknown }).wakeLock;
}

/** The lock handed out at `i`. Named rather than indexed so a test that never
 *  got one fails saying that, instead of on a property of undefined. */
function lock(i: number): FakeSentinel {
  const held = handed[i];
  if (!held) throw new Error(`no lock was handed out at ${i}`);
  return held;
}

function visibility(state: 'visible' | 'hidden'): void {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
  document.dispatchEvent(new Event('visibilitychange'));
}

beforeEach(() => {
  handed = [];
  localStorage.clear();
  visibility('visible');
  withWakeLock();
});

afterEach(() => {
  withoutWakeLock();
});

describe('possible', () => {
  it('is false where the browser has no wake lock, so no button is offered', () => {
    withoutWakeLock();
    expect(new ScreenAwake(document).possible).toBe(false);
  });

  it('is true where it has one', () => {
    expect(new ScreenAwake(document).possible).toBe(true);
  });
});

describe('holding it', () => {
  it('takes a screen lock when turned on, and lets it go when turned off', async () => {
    const awake = new ScreenAwake(document);
    await awake.set(true);
    expect(request).toHaveBeenCalledWith('screen');
    expect(awake.on).toBe(true);

    await awake.set(false);
    expect(lock(0).release).toHaveBeenCalled();
    expect(awake.on).toBe(false);
  });

  it('does not take a second lock while it already holds one', async () => {
    const awake = new ScreenAwake(document);
    await awake.set(true);
    await awake.set(true);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('says so once per change, not once per call', async () => {
    const onChange = vi.fn();
    const awake = new ScreenAwake(document, { onChange });
    await awake.set(true);
    await awake.set(true);
    expect(onChange.mock.calls).toEqual([[true]]);
  });

  it('toggles from whatever it is', async () => {
    const awake = new ScreenAwake(document);
    awake.toggle();
    await vi.waitFor(() => expect(awake.on).toBe(true));
    awake.toggle();
    await vi.waitFor(() => expect(awake.on).toBe(false));
  });
});

describe('taking it back', () => {
  it('asks again when the app returns to the front, because the browser dropped it', async () => {
    const awake = new ScreenAwake(document);
    awake.start();
    await awake.set(true);

    // What Android does on the way out: the lock is gone and nobody is told.
    lock(0).released = true;
    visibility('hidden');
    visibility('visible');

    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(2));
    expect(awake.on).toBe(true);
  });

  it('does not ask again for a screen nobody chose to keep on', async () => {
    const awake = new ScreenAwake(document);
    awake.start();
    visibility('hidden');
    visibility('visible');
    await Promise.resolve();
    expect(request).not.toHaveBeenCalled();
  });
});

describe('a refusal', () => {
  it('turns the button back off and reports why, when somebody was looking', async () => {
    const onRefused = vi.fn();
    request.mockRejectedValue(new DOMException('denied', 'NotAllowedError'));
    const awake = new ScreenAwake(document, { onRefused });

    await awake.set(true);

    expect(awake.on).toBe(false);
    expect(onRefused).toHaveBeenCalledWith('NotAllowedError: denied');
  });

  it('leaves the choice standing when the page was hidden, and is retried on return', async () => {
    // The cold start a restored choice can land in: every browser rejects a
    // request made while hidden, and undoing the choice there would discard a
    // decision nobody was present for.
    const onRefused = vi.fn();
    request.mockRejectedValueOnce(new DOMException('hidden', 'NotAllowedError'));
    const awake = new ScreenAwake(document, { onRefused });
    awake.start();

    visibility('hidden');
    await awake.set(true);

    expect(awake.on).toBe(true);
    expect(onRefused).not.toHaveBeenCalled();

    visibility('visible');
    await vi.waitFor(() => expect(handed).toHaveLength(1));
    expect(awake.on).toBe(true);
  });
});

describe('remembering', () => {
  it('starts held when it was held last time', async () => {
    await new ScreenAwake(document).set(true);

    const next = new ScreenAwake(document);
    next.start();
    await vi.waitFor(() => expect(next.on).toBe(true));
  });

  it('starts loose when it was turned off', async () => {
    const first = new ScreenAwake(document);
    await first.set(true);
    await first.set(false);

    const next = new ScreenAwake(document);
    next.start();
    await Promise.resolve();
    expect(next.on).toBe(false);
  });

  it('starts loose when nothing was ever chosen', async () => {
    const awake = new ScreenAwake(document);
    awake.start();
    await Promise.resolve();
    expect(awake.on).toBe(false);
  });

  it('keeps two apps on one origin apart when they ask for it', async () => {
    await new ScreenAwake(document, { key: 'console.awake' }).set(true);
    const other = new ScreenAwake(document, { key: 'other.awake' });
    other.start();
    await Promise.resolve();
    expect(other.on).toBe(false);
  });
});

describe('start', () => {
  it('wires one listener however often it is called', async () => {
    const awake = new ScreenAwake(document);
    awake.start();
    awake.start();
    await awake.set(true);
    lock(0).released = true;
    visibility('visible');
    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(2));
  });

  it('does nothing at all where there is no wake lock', () => {
    withoutWakeLock();
    const awake = new ScreenAwake(document);
    expect(() => awake.start()).not.toThrow();
    awake.toggle();
    expect(awake.on).toBe(false);
  });
});
