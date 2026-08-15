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
    // ⚠ **The invariant is EVENTUAL now, and deliberately.** `retake` acquires
    // before releasing, so between the new lock arriving and the old one going
    // there is a moment holding two — which is the point: releasing first left a
    // moment holding NONE, and `awake-watch.sh` samples the phone for exactly
    // that state once a minute. Asserting immediately reads that moment and
    // reports a leak; this waits for the settled count, which is what "holding
    // exactly one" ever meant.
    await vi.waitFor(() => {
      expect(handed.filter((sentinel) => !sentinel.released)).toHaveLength(1);
    });
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
 * ⚠ **A beat's LATENESS was the next answer, and it is also not enough.** The
 * reasoning was sound as far as it went: a frozen process cannot be told about
 * from inside except by the clock, since its timers do not run. But it catches a
 * freeze and only a freeze, and the 13:10:05 fault had beats arriving on time.
 *
 * Every signal in the page is the handle or the clock; both have been caught
 * lying. So the beat stopped asking whether the lock is there and simply takes
 * it again — which is why the tests below count REQUESTS rather than conditions.
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
      //
      // This survives the beat no longer reading the clock at all: a thaw must
      // still come back with a lock, and that is what it asserts. It would pass
      // vacuously now, so it is kept for the case it names rather than as the
      // proof of anything — the test below is the one that would fail.
      vi.setSystemTime(Date.now() + 5 * 60_000);
      await vi.advanceTimersByTimeAsync(15_000);

      expect(request.mock.calls.length).toBeGreaterThan(1);
      expect(awake.on).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('is never holding nothing while it swaps one lock for the next', async () => {
    // ⚠ **The reason `retake` acquires before releasing, and it is about the
    // INSTRUMENT as much as the screen.** `awake-watch.sh` samples the phone once
    // a minute for "button lit, no lock" and calls it a fault. Releasing first
    // opens a window of exactly that state four times a minute, so the watcher
    // would eventually sample one and log a FAULT caused by the fix — evidence
    // for #892 manufactured by #892's own repair.
    //
    // ⚠ **The window has to be held OPEN to be seen, and the first version of
    // this test did not.** Letting the swap run to completion and then counting
    // passes whichever order it happens in — the gap is real and closes within a
    // microtask. Ablated against `drop(); take();` it reported nothing wrong. So
    // the next request is made to hang, and the invariant is read while it does.
    const awake = screenAwake();
    awake.start();
    await awake.set(true);

    let hand: () => void = () => undefined;
    request.mockImplementationOnce(
      async () =>
        new Promise<FakeSentinel>((resolve) => {
          hand = () => {
            const sentinel = new FakeSentinel();
            handed.push(sentinel);
            resolve(sentinel);
          };
        }),
    );

    visibility('hidden');
    visibility('visible');
    await Promise.resolve();

    // Mid-swap: a request is outstanding and nothing new has arrived. The lock
    // from before must still be held, or the screen — and the watcher — sees a
    // phone claiming to be kept awake by nobody.
    expect(handed.some((sentinel) => !sentinel.released)).toBe(true);

    hand();
    await vi.waitFor(() => {
      expect(handed.filter((sentinel) => !sentinel.released)).toHaveLength(1);
    });
  });

  it('asks again on every beat, even with the beats on time and a handle in hand', async () => {
    // ⚠ **This test asserted the OPPOSITE until 2026-08-15, and its reason —
    // "the lock is held and the flag is honest" — was the assumption the phone
    // disproved.** At 13:10:05 the watcher caught the app in front, the button
    // lit, beats arriving on time, `released` false, and NO lock on the device
    // by either instrument. Every condition the beat used to gate on was false;
    // the lock was gone anyway.
    //
    // So there is nothing left to test from in here, and re-requesting is not
    // churn but the entire fix: four promises a minute on a screen that is lit
    // because we asked for it to be.
    vi.useFakeTimers();
    try {
      const awake = screenAwake();
      awake.start();
      await awake.set(true);
      expect(request).toHaveBeenCalledTimes(1);

      for (let i = 0; i < 4; i += 1) await vi.advanceTimersByTimeAsync(15_000);

      expect(request).toHaveBeenCalledTimes(5);
      // And it did not accumulate them: one beat's lock replaces the last.
      await vi.waitFor(() => {
        expect(handed.filter((sentinel) => !sentinel.released)).toHaveLength(1);
      });
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
