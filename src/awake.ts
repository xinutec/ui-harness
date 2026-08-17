/**
 * Keeping the phone's screen on while somebody is watching — the policy half, with no
 * framework in it.
 *
 * **Why the fleet needs this and a desk browser does not.** Every app here is also an
 * Android WebView wrapper, and a phone's display timeout cannot tell looking from
 * idling, so anything watched rather than operated goes dark every thirty seconds. On a
 * view that follows its own end, waking it by hand is worse than a nuisance: the touch
 * is also the gesture that stops it following.
 *
 * ⚠ **A wake lock is a thing held, not a setting.** The browser takes it away the moment
 * the document stops being visible and hands nothing back on return, so the intent must
 * outlive the lock and be re-asked for. Hence the split: [`on`] is what was chosen and
 * survives everything, the sentinel is what is in hand and does not.
 *
 * That the browser drops it on hiding is also what makes remembering the choice safe —
 * an app in a pocket has already let go, so a preference set days ago costs nothing at
 * any moment nobody is looking.
 *
 * **A plain class, for the reason `TelemetryCore` is one**: this package is built by
 * plain `tsc`, and an `@Injectable` leaving it carries metadata an AOT build cannot
 * instantiate. Apps keep a thin adapter onto [`AwakeConfig.onChange`].
 */

export interface AwakeConfig {
  /** Where the choice is remembered. Per-origin already, so the default suits
   *  every app; an override exists for one that wants two of these. */
  key?: string;
  /**
   * The answer to "is the screen being kept on" changed. The one seam a framework
   * binding needs — a signal, an observable or a re-render, and this class stays
   * ignorant of which.
   */
  onChange?: (on: boolean) => void;
  /**
   * The browser refused, in front of somebody.
   *
   * Separate from `onChange` because they say different things: the state went back to
   * off either way, but only this says it was not the person's doing.
   */
  onRefused?: (why: string) => void;
}

const DEFAULT_KEY = 'ui.awake';

/**
 * How often the lock is taken again. Cheap by construction — it only runs while the
 * screen is being kept on, which is a screen already lit — and short enough that a lock
 * lost under a 30s display timeout is back before the second timeout would fire.
 */
const BEAT_MS = 15_000;

export class ScreenAwake {
  /** The lock in hand, while there is one. */
  private sentinel: WakeLockSentinel | undefined;
  private wanted = false;
  private started = false;
  /** A request is out. See [`take`] for what asking twice at once costs. */
  private taking = false;
  private beat: ReturnType<typeof setInterval> | undefined;
  private readonly view: (Window & typeof globalThis) | null;

  constructor(
    private readonly doc: Document,
    private readonly config: AwakeConfig = {},
  ) {
    this.view = doc.defaultView;
  }

  /**
   * Whether this browser can do it at all. Asked rather than assumed, because a control
   * that cannot work should not take room on a 412px toolbar from one that can — every
   * app here is reached from both a phone WebView and a desk browser.
   */
  get possible(): boolean {
    return !!this.view && 'wakeLock' in this.view.navigator;
  }

  /** Whether the screen is being kept on. What a toolbar draws. */
  get on(): boolean {
    return this.wanted;
  }

  /**
   * Restore what was chosen last time, and take the lock back on every return to the
   * front. Idempotent, like `TelemetryCore.start`, so an adapter's `init()` tracks
   * nothing itself.
   *
   * `visibilitychange` rather than `focus`: a WebView loses document visibility when its
   * activity stops, which is exactly what precedes both the lock being dropped and
   * Android freezing the process — and it does not fire for a keyboard or a dialog
   * taking focus.
   */
  start(): void {
    if (this.started || !this.possible) return;
    this.started = true;
    this.doc.addEventListener('visibilitychange', this.onVisible);
    this.beat = setInterval(this.onBeat, BEAT_MS);
    if (this.remembered() === 'yes') void this.set(true);
  }

  stop(): void {
    this.doc.removeEventListener('visibilitychange', this.onVisible);
    if (this.beat !== undefined) clearInterval(this.beat);
    this.beat = undefined;
    this.started = false;
    void this.drop();
  }

  /**
   * ⚠ **Take it again. Do NOT work out whether it is needed — that question has no
   * honest answer from in here, and asking it is what kept this broken.**
   *
   * Three conditions were tried and all three were wrong. *On return to the front*:
   * measured with the app in the FOREGROUND throughout, button lit, no
   * `KEEP_SCREEN_ON` on the device — nothing had hidden the page, so it never fired.
   * *When the handle says it let go*: `released` is written only by JS running in the
   * page, so a lock the platform took back while the process was frozen comes back
   * reading live. *When a beat is late*: catches a freeze and nothing else, and the
   * 2026-08-15 fault had beats arriving on time.
   *
   * Every signal in the page is either the handle or the clock, and both have been
   * caught lying — so there is nothing left worth testing. Asking costs one promise
   * every fifteen seconds, on a screen already lit because we asked.
   */
  private readonly onBeat = (): void => {
    if (!this.wanted || this.doc.visibilityState !== 'visible') return;
    void this.retake();
  };

  /** The button. */
  toggle(): void {
    void this.set(!this.wanted);
  }

  async set(on: boolean): Promise<void> {
    if (!this.possible) return;
    this.announce(on);
    this.remember(on);
    if (on) await this.take();
    else await this.drop();
  }

  /**
   * ⚠ **Whatever is in hand here is stale, and asking it is the bug.** The browser drops
   * the lock whenever the document stops being visible, so on the way back nothing is
   * held by definition — but `released` is written only by JS running in the page, and a
   * process Android froze had none to run. It thaws with a handle reporting itself live
   * over a lock the platform took back, which left the button lit over a dark screen for
   * the rest of the session with nothing said.
   *
   * So the handle is let go rather than consulted: `wanted` survives a hide, the
   * sentinel does not, and it is not evidence.
   */
  private readonly onVisible = (): void => {
    if (this.doc.visibilityState !== 'visible' || !this.wanted) return;
    void this.retake();
  };

  /**
   * Get a fresh lock, then let the old one go — in that order.
   *
   * ⚠ **Releasing first leaves a window holding nothing.** Tolerable while this ran only
   * on a return to the front, since the browser had already taken the lock back; not now
   * that it runs every fifteen seconds. The screen is briefly unclaimed — and
   * `awake-watch.sh` samples the phone once a minute for exactly "button lit, no lock",
   * so a gap of our own making would eventually be logged as a FAULT and the instrument
   * would be reporting the fix.
   *
   * Holding two locks for the width of one `release()` is harmless: the window flag and
   * `dumpsys power` both read "a lock is held", which is true.
   *
   * A refused request puts the old handle back rather than leaving nothing — it may be
   * dead, but dropping the reference would leak a lock the process can never release.
   */
  private async retake(): Promise<void> {
    const held = this.sentinel;
    // Cleared so `take` does not see a live-looking handle and return early —
    // that guard is what makes "already holding one" cheap everywhere else.
    this.sentinel = undefined;
    await this.take();
    if (this.sentinel === undefined) {
      this.sentinel = held;
      return;
    }
    if (held && !held.released) await held.release().catch(() => undefined);
  }

  private async take(): Promise<void> {
    if (this.sentinel && !this.sentinel.released) return;
    // ⚠ One request in flight at a time: two transitions in quick succession would both
    // find nothing in hand, both be handed a lock, and only the last handle be kept —
    // leaving the other held until the process dies, i.e. a screen that can never sleep.
    if (this.taking) return;
    this.taking = true;
    try {
      this.sentinel = await this.view?.navigator.wakeLock.request('screen');
    } catch (err: unknown) {
      // ⚠ **Only a refusal in front of somebody is a refusal.** Every browser rejects a
      // request made while the page is hidden, and a restored choice on a cold start can
      // land in exactly that moment. Turning it off there would silently undo a decision
      // nobody was present for; the next return to the front asks again.
      if (this.doc.visibilityState !== 'visible') return;
      this.announce(false);
      this.remember(false);
      this.config.onRefused?.(why(err));
    } finally {
      this.taking = false;
    }
  }

  private async drop(): Promise<void> {
    const held = this.sentinel;
    this.sentinel = undefined;
    // Releasing a lock the browser already took back rejects, and letting go of the
    // screen is not worth an unhandled rejection.
    if (held && !held.released) await held.release().catch(() => undefined);
  }

  private announce(on: boolean): void {
    if (this.wanted === on) return;
    this.wanted = on;
    this.config.onChange?.(on);
  }

  // Wrapped because a WebView can have storage refused outright. An app that cannot
  // remember the choice still keeps the screen on for this visit, so nothing is said.
  private remember(on: boolean): void {
    try {
      this.view?.localStorage.setItem(this.key, on ? 'yes' : 'no');
    } catch {
      /* not remembered; still held */
    }
  }

  private remembered(): string | null {
    try {
      return this.view?.localStorage.getItem(this.key) ?? null;
    } catch {
      return null;
    }
  }

  private get key(): string {
    return this.config.key ?? DEFAULT_KEY;
  }
}

/** Why a request failed, as one line for a trace. */
function why(value: unknown): string {
  return value instanceof Error ? `${value.name}: ${value.message}` : String(value);
}
