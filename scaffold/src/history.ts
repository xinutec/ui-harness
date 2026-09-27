import type { Location } from '@angular/common';
import type { Observable } from 'rxjs';

/** The part of `Location` wiring an overlay into history uses. */
export type History = Pick<Location, 'go' | 'back' | 'path' | 'getState'>;

/**
 * Let the back gesture close an overlay, and close only the overlay.
 *
 * An overlay takes no part in history, so back goes to the page underneath and
 * Material's `closeOnNavigation` dismisses the overlay on the way past — on the
 * root screen, out of the app. So the overlay gets a history entry of its own
 * for back to spend itself on; nothing here closes anything. The entry has to be
 * taken away again when the overlay closes some other way, or the next back
 * press is spent on nothing.
 *
 * ⚠ An overlay that closes and navigates at once must not push the new screen
 * on top of its entry: the entry is only taken away after the exit animation,
 * when it is no longer on top, and is left under the new screen. So such a
 * navigation replaces the entry instead — see `Sheets.dismissTo`. Stepping past
 * a stranded entry on back was tried, and fights the router's own handling of
 * the same popstate (#1801).
 */
export function wireBack(history: History, closed: Observable<unknown>): void {
  // The same URL, so nothing routes: a step in history, not a place. `path(true)`
  // keeps the query and hash.
  history.go(history.path(true), '', { overlay: true });
  // Completes on its own after one emission, so there is nothing to unwind.
  closed.subscribe(() => {
    // Only if the step is still there: when back is what closed the overlay it has
    // already been popped, and a second `back()` would leave the page.
    if (overlayOnTop(history)) history.back();
  });
}

/** Whether the entry on top of history is an overlay's. */
export function overlayOnTop(history: Pick<History, 'getState'>): boolean {
  const state: unknown = history.getState();
  return typeof state === 'object' && state !== null && 'overlay' in state;
}
