/**
 * Keeping the phone's screen on while somebody is watching — the policy half,
 * with no framework in it.
 *
 * **Why the fleet needs this and a desk browser does not.** Every app here is
 * also an Android WebView wrapper (`android/main`, the shared shell), and a
 * phone's display timeout has no way to tell looking from idling. Anything
 * watched rather than operated goes dark every thirty seconds: a session writing
 * its answer in the console, a route being followed, a chart filling in. Waking
 * it by hand is not merely a nuisance — on a view that follows its own end, a
 * touch is also the gesture that stops it following.
 *
 * ⚠ **A wake lock is a thing held, not a setting.** The browser takes it away
 * the moment the document stops being visible and hands nothing back when it
 * returns, so the intent has to outlive the lock and be re-asked for. That is
 * the split here: [`on`] is what was chosen and survives everything, the
 * sentinel is what is actually in hand and does not.
 *
 * That the browser drops it on hiding is also what makes remembering the choice
 * safe. An app left in front holds the screen open; one that goes in a pocket or
 * behind another app has already let go, so a preference set days ago costs
 * nothing at any moment nobody is looking at it.
 *
 * **A plain class, for the reason `TelemetryCore` is one**: this package is
 * built by plain `tsc`, and an `@Injectable` leaving it carries metadata an AOT
 * build cannot instantiate. Apps keep a thin adapter that turns [`AwakeConfig.onChange`]
 * into whatever their framework draws from.
 */

export interface AwakeConfig {
  /** Where the choice is remembered. Per-origin already, so the default suits
   *  every app; an override exists for one that wants two of these. */
  key?: string;
  /**
   * The answer to "is the screen being kept on" changed.
   *
   * The one seam a framework binding needs: an app turns this into a signal, an
   * observable, or a re-render, and this class stays ignorant of which.
   */
  onChange?: (on: boolean) => void;
  /**
   * The browser refused, in front of somebody.
   *
   * Separate from `onChange` because the two say different things: the state
   * went back to off either way, but only this says it was not the person's
   * doing. Apps put it in their activity trace.
   */
  onRefused?: (why: string) => void;
}

const DEFAULT_KEY = 'ui.awake';

/**
 * How often the lock is taken again.
 *
 * Cheap by construction: this only runs while the screen is being kept on, which
 * is a screen that is already lit. Short enough that a lock lost under a 30s
 * display timeout is back before the second timeout would fire.
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
   * Whether this browser can do it at all.
   *
   * Offered rather than assumed, because a control that cannot work should not
   * be on a 412px toolbar taking room from something that can. Every app in the
   * fleet is reached from two places — the phone's WebView and a desk browser —
   * and only the answer, not the reason, matters to a screen.
   */
  get possible(): boolean {
    return !!this.view && 'wakeLock' in this.view.navigator;
  }

  /** Whether the screen is being kept on. What a toolbar draws. */
  get on(): boolean {
    return this.wanted;
  }

  /**
   * Restore what was chosen last time, and take the lock back on every return
   * to the front.
   *
   * Idempotent, like `TelemetryCore.start`, so an adapter's `init()` need not
   * track anything itself.
   *
   * `visibilitychange` rather than `focus`: a WebView loses document visibility
   * when its activity stops, which is exactly the event that precedes both the
   * lock being dropped and Android freezing the process — and it does not also
   * fire for a keyboard or a dialog taking focus.
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
   * ⚠ **Take it again. Do not work out whether it is needed — that question has
   * no honest answer from in here, and asking it is what kept this broken.**
   *
   * Three versions tried to be clever and each was beaten by the same thing.
   * Re-take on return to the front: measured on the phone with the app in the
   * FOREGROUND the whole time, button lit, and no `KEEP_SCREEN_ON` on the device
   * — nothing had hidden the page, so the trigger never fired. Re-take when the
   * handle says it let go: `released` is written only by JS running in the page,
   * so a lock the platform took back while the process was frozen comes back
   * reading live. Re-take when a beat is late: catches a freeze and nothing else,
   * and the fault seen on 2026-08-15 13:10:05 had beats arriving on time — a
   * running page, an honest-looking handle, and no lock. All three conditions
   * were false; all three were wrong.
   *
   * Every signal available in the page is either the handle or the clock, and
   * both have now been caught lying. So there is nothing left to test, and
   * nothing worth testing: a wake lock is a thing held, not a fact to be
   * inferred, and asking for one costs a promise every fifteen seconds on a
   * screen that is already lit because we asked.
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
   * ⚠ **Whatever is in hand here is stale, and asking it is the bug.** The
   * browser drops the lock every time the document stops being visible, so on
   * the way back there is nothing held by definition — but `released` is written
   * only by JS running in the page, and a process Android froze in the
   * background had none to run. It thaws with a handle reporting itself live
   * over a lock the platform took back. Believing it left the button lit over a
   * screen that went dark, for the rest of the session, with nothing said.
   *
   * So the handle is let go rather than consulted. `wanted` is the state that
   * survives a hide; the sentinel is not, and must not be treated as evidence.
   */
  private readonly onVisible = (): void => {
    if (this.doc.visibilityState !== 'visible' || !this.wanted) return;
    void this.retake();
  };

  /**
   * Get a fresh lock, then let the old one go — in that order.
   *
   * ⚠ **Releasing first leaves a window holding nothing**, which was tolerable
   * while this ran only on a return to the front (the browser had already taken
   * the lock back, so there was nothing to drop) and is not now that it runs
   * every fifteen seconds. Two costs, and the second is the one that would have
   * been hard to find: the screen is briefly unclaimed, and `awake-watch.sh`
   * samples the phone once a minute for exactly the state "button lit, no lock"
   * — so a gap of our own making would eventually be sampled and logged as a
   * FAULT. The instrument would have been reporting the fix.
   *
   * Holding two locks for the width of one `release()` is harmless: the window
   * flag and `dumpsys power` both read "a lock is held", which is the truth.
   *
   * A refused request puts the old handle back rather than leaving nothing —
   * it may be dead, but a dead handle is no worse than none and dropping the
   * reference would leak a lock the process can never release.
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
    // One request in flight at a time. Asking again on every return is what
    // makes this necessary: two transitions in quick succession would both find
    // nothing in hand, both be handed a lock, and only the last handle be kept —
    // leaving the other held until the process dies, which is a screen that can
    // never sleep again.
    if (this.taking) return;
    this.taking = true;
    try {
      this.sentinel = await this.view?.navigator.wakeLock.request('screen');
    } catch (err: unknown) {
      // ⚠ **Only a refusal that happened in front of somebody is a refusal.**
      // A request made while the page is hidden is rejected by every browser
      // that implements this, and a restored choice on a cold start can land in
      // exactly that moment. Turning it off there would silently undo a decision
      // nobody was present for; the next return to the front asks again, and
      // that is when the answer means something.
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
    // Releasing a lock the browser has already taken back rejects, and letting
    // go of the screen is not worth an unhandled rejection.
    if (held && !held.released) await held.release().catch(() => undefined);
  }

  private announce(on: boolean): void {
    if (this.wanted === on) return;
    this.wanted = on;
    this.config.onChange?.(on);
  }

  // Storage is wrapped because a WebView can have it refused outright. An app
  // that cannot remember the choice still keeps the screen on for this visit,
  // and nothing on screen changes, so nothing is said about it.
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
