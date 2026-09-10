import { describe, expect, it } from 'vitest';
import { type PagePort, type ServiceWorkerPort, SwUpdates } from './sw-updates.js';

/** A service worker that never surprises the test: every event is fired by hand. */
class FakeSw implements ServiceWorkerPort {
  isEnabled = true;
  checks = 0;
  activations = 0;
  findsUpdate = false;
  checkThrows = false;
  activateThrows = false;
  private versionReady: () => void = () => {};
  private unrecoverable: () => void = () => {};

  onVersionReady(handler: () => void): void {
    this.versionReady = handler;
  }
  onUnrecoverable(handler: () => void): void {
    this.unrecoverable = handler;
  }
  async checkForUpdate(): Promise<boolean> {
    this.checks++;
    if (this.checkThrows) throw new Error('offline');
    return this.findsUpdate;
  }
  async activateUpdate(): Promise<boolean> {
    this.activations++;
    if (this.activateThrows) throw new Error('gone');
    return true;
  }
  fireVersionReady(): void {
    this.versionReady();
  }
  fireUnrecoverable(): void {
    this.unrecoverable();
  }
}

class FakePage implements PagePort {
  hidden = false;
  reloads = 0;
  clock = 1_000_000;
  private recovered = false;
  private visibility: () => void = () => {};

  onVisibilityChange(handler: () => void): void {
    this.visibility = handler;
  }
  recoveryAttempted(): boolean {
    return this.recovered;
  }
  markRecoveryAttempted(): void {
    this.recovered = true;
  }
  reload(): void {
    this.reloads++;
  }
  now(): number {
    return this.clock;
  }
  /** Move the tab, firing the handler the way a browser would. */
  setHidden(value: boolean): void {
    this.hidden = value;
    this.visibility();
  }
}

function started(): { sw: FakeSw; page: FakePage; updates: SwUpdates } {
  const sw = new FakeSw();
  const page = new FakePage();
  const updates = new SwUpdates(sw, page);
  updates.start();
  return { sw, page, updates };
}

/** Let the policy's un-awaited internal promises settle. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('SwUpdates', () => {
  it('does nothing at all without a service worker', () => {
    const sw = new FakeSw();
    sw.isEnabled = false;
    const page = new FakePage();
    new SwUpdates(sw, page).start();
    expect(sw.checks).toBe(0);
  });

  it('reloads immediately for an update that lands during startup', async () => {
    const { sw, page } = started();
    sw.fireVersionReady();
    await settle();
    expect(page.reloads).toBe(1);
  });

  it('holds a mid-session update until the tab is backgrounded', async () => {
    const { sw, page } = started();
    page.clock += 60_000; // well past the startup window
    sw.fireVersionReady();
    await settle();
    expect(page.reloads).toBe(0); // would have eaten a half-typed form

    page.setHidden(true);
    await settle();
    expect(page.reloads).toBe(1);
  });

  it('reloads at once when the update lands on a hidden tab', async () => {
    const { sw, page } = started();
    page.clock += 60_000;
    page.hidden = true;
    sw.fireVersionReady();
    await settle();
    expect(page.reloads).toBe(1);
  });

  it('⚠ re-checks when the tab becomes visible — the stale-tab fix', async () => {
    const { sw, page } = started();
    expect(sw.checks).toBe(1); // the one at start()

    page.setHidden(true);
    page.setHidden(false);
    await settle();

    // ngsw only re-checks on its own at a navigation, which a resumed long-lived
    // tab never performs. A dashboard left open for days IS that tab.
    expect(sw.checks).toBe(2);
  });

  it('spends exactly one automatic recovery per tab', () => {
    const { sw, page } = started();
    sw.fireUnrecoverable();
    sw.fireUnrecoverable();
    // A build broken badly enough to wedge again would otherwise loop forever.
    expect(page.reloads).toBe(1);
  });

  it('a manual check activates a build already staged', async () => {
    const { sw, page, updates } = started();
    page.clock += 60_000;
    sw.fireVersionReady();
    await settle();
    expect(page.reloads).toBe(0);

    // checkForUpdate() would report "nothing newer" here, and saying "you are on
    // the latest" while a staged update waits is the bug this branch prevents.
    await expect(updates.checkNow()).resolves.toBe('updating');
    expect(page.reloads).toBe(1);
  });

  it('a manual check on the newest build says so', async () => {
    const { updates } = started();
    await expect(updates.checkNow()).resolves.toBe('current');
  });

  it('a failed manual check reports failure and does not latch', async () => {
    const { sw, page, updates } = started();
    sw.checkThrows = true;
    await expect(updates.checkNow()).resolves.toBe('failed');

    // ⚠ The regression the single `Mode` field exists for: a failed check used to
    // leave 'asked' latched, so the next BACKGROUND update reloaded mid-use.
    sw.checkThrows = false;
    page.clock += 60_000;
    sw.fireVersionReady();
    await settle();
    expect(page.reloads).toBe(0);
  });

  it('a failed activation keeps the build staged rather than going quietly stale', async () => {
    const { sw, page, updates } = started();
    page.clock += 60_000;
    sw.activateThrows = true;
    sw.fireVersionReady();
    await settle();
    expect(page.reloads).toBe(0);

    // Still staged, so the next backgrounding retries it.
    sw.activateThrows = false;
    page.setHidden(true);
    await settle();
    expect(page.reloads).toBe(1);
    void updates;
  });

  it('reports unsupported when there is no service worker', async () => {
    const sw = new FakeSw();
    sw.isEnabled = false;
    const updates = new SwUpdates(sw, new FakePage());
    await expect(updates.checkNow()).resolves.toBe('unsupported');
  });
});
