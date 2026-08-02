/**
 * The fleet's client activity trace — the policy half, with no framework in it.
 *
 * Every Angular app in the fleet carried its own copy of this — ten of them,
 * 1,301 lines, all exporting the same two symbols and drifted 38 to 98 lines
 * apart. The flush cadence, the queue cap, the endpoint and both capture seams
 * were identical in all ten; the only real variation was how the batch got
 * posted, and the four API wrappers doing that turned out to be
 * `http.post('/api/telemetry', events)` verbatim — three spellings of one POST.
 *
 * **Why this is a plain class and not an `@Injectable` service.** It was one,
 * briefly, and a production build of the first consumer died on `JIT compiler
 * unavailable`. Angular's decorators need the Angular compiler to emit their
 * Ivy definitions; this package is built by plain `tsc`, so a decorated class
 * leaving it carries only inert metadata that an AOT build cannot instantiate.
 * Shipping an Angular service from here would mean adopting ng-packagr and the
 * Angular Package Format for the whole package. The framework binding is about
 * a dozen lines per app and the policy below is a hundred and thirty, so the
 * boundary goes where the volume is: apps keep a thin `@Injectable` adapter,
 * and this owns everything it can own without knowing what a Router is.
 *
 * The pure label rules live in `./telemetry-label` and are re-exported here so
 * a consumer has one import site.
 */

import { labelFor, oneLine, type TelemetryEvent } from './telemetry-label.js';

export { labelFor, oneLine, type TelemetryEvent } from './telemetry-label.js';

/** The two things that genuinely varied between apps, and nothing else. */
export interface TelemetryConfig {
  /** Where the batch goes. Every app in the fleet uses the default. */
  endpoint?: string;
  /** How often the queue is sent, in ms. */
  flushMs?: number;
  /** Queue length that forces an early flush, so a burst cannot grow it
   *  without bound between ticks. */
  maxQueue?: number;
  /**
   * Extra request headers, resolved per send.
   *
   * Exists for memview, whose requests carry an `X-Share-Token` when the page
   * is being read through a share link rather than a session. A function, not
   * a value, because the token can appear or change after `start()`.
   */
  headers?: () => Record<string, string>;
}

const DEFAULTS = {
  endpoint: '/api/telemetry',
  flushMs: 5000,
  maxQueue: 50,
} as const;

/**
 * Queue, flush policy and transport for the activity trace.
 *
 * Best-effort by design: a failed send is dropped, never retried, never
 * surfaced. A trace that interferes with the app it observes is worse than no
 * trace at all.
 *
 * **That contract is why this posts with `fetch` rather than Angular's
 * `HttpClient`, and the choice is load-bearing rather than incidental.** Three
 * apps register HTTP interceptors with side effects on failure: fleetwatch's
 * navigates the browser to `/login` on any 401, and memview's and utterance's
 * flip the app into its signed-out state. Routed through those, a background
 * batch that happens to fire against a stale session can hijack navigation or
 * blank the screen — the app being changed by the thing observing it. Going
 * around the interceptor stack makes "never interferes" structural instead of
 * a promise in a comment. Cookies still ride along: same-origin is `fetch`'s
 * default credentials mode.
 *
 * The corollary, stated so nobody re-adds it: telemetry must never need an
 * interceptor to authenticate. Anything a request genuinely needs goes through
 * `TelemetryConfig.headers`.
 */
export class TelemetryCore {
  private queue: TelemetryEvent[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly doc: Document,
    private readonly config: TelemetryConfig = {},
  ) {}

  /** Whether `start()` has already run — what makes an adapter's `init()`
   *  idempotent without the adapter tracking anything itself. */
  get started(): boolean {
    return this.timer !== null;
  }

  /**
   * Begin flushing, and take a last flush when the page is hidden — a tab being
   * closed, or a WebView being frozen by Android's cached-app freezer — so the
   * final few events are not stranded in the queue.
   *
   * The two capture seams stay with the caller: they are the framework's, and
   * not knowing about them is the whole point of this class.
   */
  start(): void {
    if (this.timer !== null) return;
    this.timer = setInterval(() => this.flush(false), this.config.flushMs ?? DEFAULTS.flushMs);
    this.doc.addEventListener('visibilitychange', () => {
      if (this.doc.visibilityState === 'hidden') this.flush(true);
    });
  }

  stop(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
  }

  /** Record one action. `label` is null for a navigation. */
  record(kind: string, path: string, label: string | null): void {
    this.queue.push({ kind, path: oneLine(path), label, at: Date.now() });
    if (this.queue.length >= (this.config.maxQueue ?? DEFAULTS.maxQueue)) this.flush(false);
  }

  /** Record a tap, if it landed on something a person meant to press. */
  recordTap(target: EventTarget | null, path: string): void {
    const label = labelFor(target);
    if (label !== null) this.record('tap', path, label);
  }

  flush(final: boolean): void {
    if (this.queue.length === 0) return;
    const batch = this.queue;
    this.queue = [];
    const body = JSON.stringify(batch);
    const endpoint = this.config.endpoint ?? DEFAULTS.endpoint;

    // On hiding, `sendBeacon` survives a teardown an in-flight request would
    // not. It cannot carry headers, so an app that needs them keeps the normal
    // path and accepts losing the last partial batch rather than sending one
    // that will be refused.
    const view = this.doc.defaultView;
    if (final && view?.navigator.sendBeacon && !this.config.headers) {
      view.navigator.sendBeacon(endpoint, new Blob([body], { type: 'application/json' }));
      return;
    }

    void fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(this.config.headers?.() ?? {}) },
      body,
      // Lets the request outlive the page on a final flush.
      keepalive: final,
    }).catch(() => undefined);
  }
}
