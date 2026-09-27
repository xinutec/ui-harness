import type { Location } from '@angular/common';
import type { Observable } from 'rxjs';

/** The part of `Location` wiring an overlay into history uses. */
export type History = Pick<Location, 'go' | 'back' | 'path' | 'getState' | 'subscribe'>;

/** Overlays open now, by the id their history entry carries. */
const open = new Set<string>();
/** Histories already watched for entries whose overlay has gone. */
const watched = new WeakSet<History>();
let opened = 0;

/**
 * Let the back gesture close an overlay, and close only the overlay.
 *
 * An overlay takes no part in history, so back goes to the page underneath and
 * Material's `closeOnNavigation` dismisses the overlay on the way past — on the
 * root screen, out of the app. So the overlay gets a history entry of its own
 * for back to spend itself on; nothing here closes anything. The entry has to be
 * taken away again when the overlay closes some other way, or the next back
 * press is spent on nothing.
 */
export function wireBack(history: History, closed: Observable<unknown>): void {
  skipGoneOverlays(history);
  // Unique across reloads, which keep old entries but not `open`.
  opened += 1;
  const id = `${Date.now()}-${opened}`;
  open.add(id);
  // The same URL, so nothing routes: a step in history, not a place. `path(true)`
  // keeps the query and hash.
  history.go(history.path(true), '', { overlay: id });
  // Completes on its own after one emission, so there is nothing to unwind.
  closed.subscribe(() => {
    open.delete(id);
    // Only if the step is still on top: when back is what closed the overlay it
    // has already been popped, and a second `back()` would leave the page.
    if (overlayOf(history.getState()) === id) history.back();
  });
}

/**
 * An overlay's entry that outlived it — the overlay closed after something was
 * pushed on top of its entry (a sheet that navigates as it closes), or the page
 * was reloaded — is a step back that shows nothing. Back onto one goes back once
 * more.
 */
function skipGoneOverlays(history: History): void {
  if (watched.has(history)) return;
  watched.add(history);
  history.subscribe((event) => {
    const id = overlayOf(event.state);
    if (id !== undefined && !open.has(id)) history.back();
  });
}

function overlayOf(state: unknown): string | undefined {
  if (typeof state !== 'object' || state === null || !('overlay' in state)) return undefined;
  return typeof state.overlay === 'string' ? state.overlay : undefined;
}
