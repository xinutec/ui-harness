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
let made: ScreenAwake[] = [];

/**
 * One under test, torn down with the test.
 *
 * ⚠ **Not `new ScreenAwake` directly.** `start()` subscribes to the shared
 * `document`, and a test that never stops its instance leaves it listening for
 * the whole file — so the next test's visibility events are answered by every
 * instance before it, each asking for a lock of its own. That went unseen while
 * a stale instance would early-return on the sentinel it still held; the moment
 * returning to the front meant asking again, one visibility event produced
 * twelve requests and four tests failed on the leak rather than on themselves.
 */
function screenAwake(config?: ConstructorParameters<typeof ScreenAwake>[1]): ScreenAwake {
  const awake = new ScreenAwake(document, config);
  made.push(awake);
  return awake;
}

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
  made = [];
  localStorage.clear();
  visibility('visible');
  withWakeLock();
});

afterEach(() => {
  for (const awake of made) awake.stop();
  withoutWakeLock();
});

describe('possible', () => {
  it('is false where the browser has no wake lock, so no button is offered', () => {
    withoutWakeLock();
    expect(screenAwake().possible).toBe(false);
  });

  it('is true where it has one', () => {
    expect(screenAwake().possible).toBe(true);
  });
});

describe('holding it', () => {
  it('takes a screen lock when turned on, and lets it go when turned off', async () => {
    const awake = screenAwake();
    await awake.set(true);
    expect(request).toHaveBeenCalledWith('screen');
    expect(awake.on).toBe(true);

    await awake.set(false);
    expect(lock(0).release).toHaveBeenCalled();
    expect(awake.on).toBe(false);
  });

  it('does not take a second lock while it already holds one', async () => {
    const awake = screenAwake();
    await awake.set(true);
    await awake.set(true);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('says so once per change, not once per call', async () => {
    const onChange = vi.fn();
    const awake = screenAwake({ onChange });
    await awake.set(true);
    await awake.set(true);
    expect(onChange.mock.calls).toEqual([[true]]);
  });

  it('toggles from whatever it is', async () => {
    const awake = screenAwake();
    awake.toggle();
    await vi.waitFor(() => expect(awake.on).toBe(true));
    awake.toggle();
    await vi.waitFor(() => expect(awake.on).toBe(false));
  });
});

describe('taking it back', () => {
  it('asks again when the app returns to the front, because the browser dropped it', async () => {
    const awake = screenAwake();
    awake.start();
    await awake.set(true);

    // What Android does on the way out: the lock is gone and nobody is told.
    lock(0).released = true;
    visibility('hidden');
    visibility('visible');

    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(2));
    expect(awake.on).toBe(true);
  });

  it('asks again even holding a handle that still claims to be live', async () => {
    // ⚠ **The case above, with the one thing Android does not do.** There the
    // browser set `released` on the way out; `released` is only ever written by
    // JS running in the page, and a process frozen while it was in the
    // background has none to run. It thaws holding a handle that reports itself
    // live over a lock the platform took back — and the old guard believed it,
    // so nothing asked again for the rest of the session. The button stayed lit
    // over a screen that went dark, which is the whole complaint.
    const awake = screenAwake();
    awake.start();
    await awake.set(true);

    visibility('hidden');
    visibility('visible');

    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(2));
    expect(awake.on).toBe(true);
  });

  it('is holding exactly one lock however fast the app comes and goes', async () => {
    // Asking again on every return is what makes the leak possible: two
    // transitions can both find nothing in hand and each be given a lock, and
    // only the last handle is kept. The other is held until the process dies —
    // a screen that can never sleep again, which is worse than the fault fixed
    // above.
    const awake = screenAwake();
    awake.start();
    await awake.set(true);

    visibility('hidden');
    visibility('visible');
    visibility('hidden');
    visibility('visible');

    await vi.waitFor(() => expect(awake.on).toBe(true));
    expect(handed.filter((sentinel) => !sentinel.released)).toHaveLength(1);
  });

  it('does not ask again for a screen nobody chose to keep on', async () => {
    const awake = screenAwake();
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
    const awake = screenAwake({ onRefused });

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
    const awake = screenAwake({ onRefused });
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
    await screenAwake().set(true);

    const next = screenAwake();
    next.start();
    await vi.waitFor(() => expect(next.on).toBe(true));
  });

  it('starts loose when it was turned off', async () => {
    const first = screenAwake();
    await first.set(true);
    await first.set(false);

    const next = screenAwake();
    next.start();
    await Promise.resolve();
    expect(next.on).toBe(false);
  });

  it('starts loose when nothing was ever chosen', async () => {
    const awake = screenAwake();
    awake.start();
    await Promise.resolve();
    expect(awake.on).toBe(false);
  });

  it('keeps two apps on one origin apart when they ask for it', async () => {
    await screenAwake({ key: 'console.awake' }).set(true);
    const other = screenAwake({ key: 'other.awake' });
    other.start();
    await Promise.resolve();
    expect(other.on).toBe(false);
  });
});

describe('start', () => {
  it('wires one listener however often it is called', async () => {
    const awake = screenAwake();
    awake.start();
    awake.start();
    await awake.set(true);
    lock(0).released = true;
    visibility('visible');
    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(2));
  });

  it('does nothing at all where there is no wake lock', () => {
    withoutWakeLock();
    const awake = screenAwake();
    expect(() => awake.start()).not.toThrow();
    awake.toggle();
    expect(awake.on).toBe(false);
  });
});

/**
 * The trigger that does not depend on anything happening.
 *
 * ⚠ **`visibilitychange` was the only way back, and that is not enough.**
 * Measured on the Pixel 9 on 2026-08-15, on a build that already had the
 * stale-handle fix: the console sat in the FOREGROUND, visible, with the button
 * lit and `KEEP_SCREEN_ON` absent from every window on the device. A probe took
 * a lock instantly, with no gesture — so it was never refused, it was never
 * asked for. Nothing had hidden the page since the lock went, so nothing fired.
 *
 * A frozen process cannot be told about from inside except by the clock: its
 * timers do not run, so a beat that should have come 15 seconds ago and comes
 * five minutes late IS the freeze, observed. That is the one signal available,
 * and the sentinel's own `released` flag is not — Android leaves it lying.
 */
describe('the heartbeat', () => {
  it('takes it back after a gap no timer should leave, holding a handle that claims to be live', async () => {
    vi.useFakeTimers();
    try {
      const awake = screenAwake();
      awake.start();
      await awake.set(true);
      expect(request).toHaveBeenCalledTimes(1);

      // ⚠ **Frozen is the clock moving while the timers do NOT run.** Advancing
      // fake timers runs every beat on schedule, which is the opposite of the
      // thing under test — written that way first, it reported a lateness of
      // zero twenty times over and the test passed against no fix at all. So the
      // wall clock is moved on its own, and only then is one beat let through.
      vi.setSystemTime(Date.now() + 5 * 60_000);
      await vi.advanceTimersByTimeAsync(15_000);

      expect(request.mock.calls.length).toBeGreaterThan(1);
      expect(awake.on).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('asks nothing while the beats arrive on time', async () => {
    // The lock is held and the flag is honest: re-requesting on every beat would
    // churn a new sentinel every 15 seconds for no reason.
    vi.useFakeTimers();
    try {
      const awake = screenAwake();
      awake.start();
      await awake.set(true);

      for (let i = 0; i < 4; i += 1) await vi.advanceTimersByTimeAsync(15_000);

      expect(request).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('says nothing about a screen nobody chose to keep on', async () => {
    vi.useFakeTimers();
    try {
      screenAwake().start();
      await vi.advanceTimersByTimeAsync(5 * 60_000);
      expect(request).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('stops beating when it is stopped', async () => {
    vi.useFakeTimers();
    try {
      const awake = screenAwake();
      awake.start();
      await awake.set(true);
      awake.stop();
      request.mockClear();

      await vi.advanceTimersByTimeAsync(5 * 60_000);

      expect(request).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
