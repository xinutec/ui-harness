/**
 * The fleet's client activity trace, in one place.
 *
 * Every Angular app in the fleet carried its own copy of this file — ten of
 * them, 1,301 lines, all exporting the same two symbols and drifted 38 to 98
 * lines apart. The constants, the endpoint, the two capture seams and the flush
 * policy were identical in all ten; the only real variation was how the batch
 * got posted, and that turned out to be three spellings of the same POST.
 *
 * What the trace is for: the per-request log records every API call, and that
 * reads as sufficient until something goes wrong. It is not — a tap that hits a
 * cache, a control that was disabled, a screen that rendered wrong: none of it
 * reaches the server, so "I pressed it and nothing happened" is undiagnosable.
 * Read together, the two streams make it answerable.
 *
 * Instrumented once, at two central seams — the router's navigation events and
 * a single capture-phase click listener — so no screen knows this exists and no
 * new control can be missed by forgetting to annotate it.
 *
 * The pure half lives in `./telemetry-label`; it is re-exported here so a
 * consumer has one import site.
 */

import { DOCUMENT, InjectionToken, Injectable, inject, type OnDestroy } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';

import { type TelemetryEvent, labelFor, oneLine } from './telemetry-label.js';

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
   * a value, because the token can appear or change after `init()`.
   */
  headers?: () => Record<string, string>;
}

export const TELEMETRY_CONFIG = new InjectionToken<TelemetryConfig>('TELEMETRY_CONFIG');

const DEFAULTS = {
  endpoint: '/api/telemetry',
  flushMs: 5000,
  maxQueue: 50,
} as const;

/**
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
@Injectable({ providedIn: 'root' })
export class Telemetry implements OnDestroy {
  private readonly router = inject(Router);
  private readonly doc = inject(DOCUMENT);
  private readonly config = inject(TELEMETRY_CONFIG, { optional: true }) ?? {};

  private queue: TelemetryEvent[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;

  private get endpoint(): string {
    return this.config.endpoint ?? DEFAULTS.endpoint;
  }

  /** Wire the two capture points. Called once from the app shell; idempotent. */
  init(): void {
    if (this.timer !== null) return;

    this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe((e) => this.enqueue('nav', e.urlAfterRedirects, null));

    // Capture phase, so the tap is seen even where a handler stops propagation.
    this.doc.addEventListener(
      'click',
      (ev) => {
        const label = labelFor(ev.target);
        if (label !== null) this.enqueue('tap', this.router.url, label);
      },
      { capture: true },
    );

    this.timer = setInterval(() => this.flush(false), this.config.flushMs ?? DEFAULTS.flushMs);

    // A last flush when the page is hidden — a tab being closed, or a WebView
    // being frozen by Android's cached-app freezer — so the final few events
    // are not stranded in the queue.
    this.doc.addEventListener('visibilitychange', () => {
      if (this.doc.visibilityState === 'hidden') this.flush(true);
    });
  }

  ngOnDestroy(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
  }

  private enqueue(kind: string, path: string, label: string | null): void {
    this.queue.push({ kind, path: oneLine(path), label, at: Date.now() });
    if (this.queue.length >= (this.config.maxQueue ?? DEFAULTS.maxQueue)) this.flush(false);
  }

  private flush(final: boolean): void {
    if (this.queue.length === 0) return;
    const batch = this.queue;
    this.queue = [];
    const body = JSON.stringify(batch);

    // On hiding, `sendBeacon` survives a teardown an in-flight request would
    // not. It cannot carry headers, so an app that needs them keeps the normal
    // path and accepts losing the last partial batch rather than sending one
    // that will be refused.
    const beacon = this.doc.defaultView?.navigator.sendBeacon;
    if (final && beacon && !this.config.headers) {
      this.doc.defaultView?.navigator.sendBeacon(
        this.endpoint,
        new Blob([body], { type: 'application/json' }),
      );
      return;
    }

    void fetch(this.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(this.config.headers?.() ?? {}) },
      body,
      // Lets the request outlive the page on a final flush.
      keepalive: final,
    }).catch(() => undefined);
  }
}
