/**
 * When to reload a running app onto a newer build — the policy, without Angular.
 *
 * ngsw alone caches an app that never learns a new build exists. That is what
 * fleetwatch had: a dashboard that can show stale fleet status indefinitely, and
 * stale monitoring is worse than none because it looks fine. The rules below were
 * written and debugged in `life`, the only app in the fleet that had them, and are
 * here so the other six do not each rediscover the edge cases.
 *
 * The rules:
 *
 *  - **startup, or hidden** — reload at once; invisible either way.
 *  - **mid-session and visible** — hold the reload until the app is next
 *    backgrounded, so an update never eats a half-typed form.
 *  - ⚠ **becoming visible — RE-CHECK.** ngsw only re-checks on its own at a
 *    navigation, which a resumed long-lived tab never performs. This is the whole
 *    fix for the stale-tab problem, and a dashboard left open for days IS that tab.
 *  - **unrecoverable** — the cached build is broken and the server no longer holds
 *    the files to repair it, which is what a roll-forward deploy of `:latest` leaves
 *    a client whose cache was evicted meanwhile. Only a fresh load escapes, so take
 *    exactly one per tab and then leave it alone: a build broken badly enough to
 *    wedge again would otherwise loop the app forever.
 *
 * ⚠ **No `@Injectable`, and that is a packaging constraint rather than taste.**
 * This package is compiled by plain `tsc` with no `experimentalDecorators` and no
 * Angular compiler, so a decorated service would ship without the provider metadata
 * `ngtsc` generates and fail to inject in an AOT build. Depending on Angular here
 * would mean an `ng-packagr` build for one file. The app keeps the three lines of
 * Angular glue; the part worth sharing is the policy.
 *
 * ⚠ **Typed against [ServiceWorkerPort], not `SwUpdate`,** so this package gains no
 * dependency on Angular or rxjs at all — and so the policy is testable against a
 * fake, which it could not be while it was welded to a real service worker.
 */

/** What the policy needs from a service worker, and nothing more. */
export interface ServiceWorkerPort {
  /** False in a dev build, which has no service worker at all. */
  readonly isEnabled: boolean;
  /** A newer build has finished downloading and is ready to activate. */
  onVersionReady(handler: () => void): void;
  /** The cached build is broken beyond repair from the server. */
  onUnrecoverable(handler: () => void): void;
  /** Resolves true when a newer build was discovered. */
  checkForUpdate(): Promise<boolean>;
  /** Resolves false when there was nothing to activate. */
  activateUpdate(): Promise<boolean>;
}

/** What the policy needs from the page. Injected so a test can drive visibility
 *  and observe a reload without navigating the test runner. */
export interface PagePort {
  readonly hidden: boolean;
  onVisibilityChange(handler: () => void): void;
  /** Already recovered once in this tab. Session-scoped so it survives the very
   *  reload it is guarding against. */
  recoveryAttempted(): boolean;
  markRecoveryAttempted(): void;
  reload(): void;
  now(): number;
}

/** Updates arriving this soon after start() reload immediately — nothing is in
 *  progress yet, so you basically never see it. */
const STARTUP_MS = 10_000;

/**
 * What the policy is currently doing about updates.
 *
 * ⚠ **One field rather than a pair of booleans**, because the pair could express a
 * state with no answer: "the user asked" was reset on a single branch, so a FAILED
 * check latched it on for the rest of the session and every later background update
 * then reloaded mid-use — exactly what the deferral exists to prevent.
 */
type Mode = 'idle' | 'staged' | 'asked';

/** The outcome of a manual "Check for updates". */
export type UpdateOutcome =
  /** A newer build is being activated — the page is about to reload. */
  | 'updating'
  /** Already on the latest build. */
  | 'current'
  /** The check, or the activation, failed — nothing has changed. */
  | 'failed'
  /** No service worker, so there is nothing to check (dev build). */
  | 'unsupported';

export class SwUpdates {
  private startedAt = 0;
  private mode: Mode = 'idle';

  constructor(
    private readonly sw: ServiceWorkerPort,
    private readonly page: PagePort,
  ) {}

  start(): void {
    if (!this.sw.isEnabled) return; // dev build has no service worker
    this.startedAt = this.page.now();
    this.sw.onVersionReady(() => this.onVersionReady());
    this.sw.onUnrecoverable(() => this.recover());
    this.page.onVisibilityChange(() => this.onVisibilityChange());
    this.backgroundCheck();
  }

  private onVersionReady(): void {
    const inStartup = this.page.now() - this.startedAt < STARTUP_MS;
    if (this.mode === 'asked' || inStartup || this.page.hidden) {
      void this.applyUpdate();
    } else {
      this.mode = 'staged';
    }
  }

  private onVisibilityChange(): void {
    if (this.page.hidden) {
      if (this.mode === 'staged') void this.applyUpdate();
    } else {
      this.backgroundCheck();
    }
  }

  /** A check nobody asked for (startup, or returning to a stale tab). Failure is
   *  ordinary here — being offline is the common case — so it goes unreported; the
   *  next time the app becomes visible it simply tries again. */
  private backgroundCheck(): void {
    void this.sw.checkForUpdate().catch(() => undefined);
  }

  /** Activate the staged build and reload. Resolves false when activation failed,
   *  so a caller never claims an update is happening that is not. */
  async applyUpdate(): Promise<boolean> {
    try {
      // Resolves false when there was nothing to activate; reload regardless, since
      // a fresh load is the reliable way to land on the current build.
      await this.sw.activateUpdate();
    } catch {
      // Keep the build staged so the next backgrounding — or the next manual check
      // — retries it, rather than dropping it and going quietly stale.
      this.mode = 'staged';
      return false;
    }
    this.page.reload();
    return true;
  }

  private recover(): void {
    if (this.page.recoveryAttempted()) return; // already spent this tab's attempt
    this.page.markRecoveryAttempted();
    this.page.reload();
  }

  /** Manual "Check for updates". Never rejects — every failure comes back as
   *  `'failed'` so the caller can say so. */
  async checkNow(): Promise<UpdateOutcome> {
    if (!this.sw.isEnabled) return 'unsupported';
    // A newer build may already be downloaded and STAGED — VERSION_READY fired
    // mid-session and the reload was held so it would not interrupt. In that case
    // checkForUpdate() reports "nothing newer" (false), and we would wrongly say
    // "you are on the latest" while a staged update sits waiting. The user just
    // asked, so activate that pending update now.
    if (this.mode === 'staged') {
      return (await this.applyUpdate()) ? 'updating' : 'failed';
    }
    const previous = this.mode;
    this.mode = 'asked';
    let found: boolean;
    try {
      found = await this.sw.checkForUpdate();
    } catch {
      this.disarm(previous); // the check failed — nothing is coming to apply
      return 'failed';
    }
    if (!found) {
      this.disarm(previous);
      return 'current';
    }
    // Stay 'asked'. The VERSION_READY this promises can land after we return, and
    // the user asked for it, so it must apply at once instead of deferring.
    // applyUpdate() takes the state back off 'asked' if activation fails.
    return 'updating';
  }

  /** Take the state back off 'asked' once nothing is coming. Left latched it would
   *  make the next BACKGROUND update reload mid-use. Skipped when applyUpdate() has
   *  meanwhile staged a build — that is the newer news. */
  private disarm(previous: Mode): void {
    if (this.mode === 'asked') this.mode = previous;
  }
}
