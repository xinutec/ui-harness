/**
 * The label rules and the flattener — the part of the fleet's activity trace
 * that is pure.
 *
 * Kept apart from the Angular service deliberately. These functions need only a
 * DOM node and a string, so anything can use them and they can be unit-tested
 * without standing up a framework; the service beside them pulls in
 * `@angular/router`, which a bare test environment cannot even import. Layering
 * that follows the dependencies rather than the subject.
 */

/** One recorded action. Structurally identical to every app's own
 *  `TelemetryEvent`, whether hand-written or generated from Rust by ts-rs. */
export interface TelemetryEvent {
  /** `nav` for a route change, `tap` for a control. */
  kind: string;
  path: string;
  /** The control's visible text, verbatim; null for a navigation. */
  label: string | null;
  /** The client's clock, epoch milliseconds — a batch arrives all at once, so
   *  the server's receive time cannot order the events inside it. */
  at: number;
}

/** Longest label sent, in code points. */
const MAX_LABEL = 160;

/**
 * Characters that are invisible, or that reorder what is displayed.
 *
 * - **Zero-width characters** (U+200B, U+FEFF, the word joiners) are invisible,
 *   so a label made of them reads as empty while occupying the whole cap.
 * - **Bidi overrides** (U+202A–202E, U+2066–2069) reorder the *rendering* of the
 *   text around them, so a log line containing one can be made to display
 *   something other than what it says — the Trojan Source trick, pointed at the
 *   record rather than at source code.
 */
const DECEPTIVE = /[\u00ad\u200b-\u200f\u202a-\u202e\u2060-\u2064\u2066-\u2069\ufeff]/gu;

/**
 * Flatten a label to one harmless log field.
 *
 * This began as observe-only, because observe has no backend to sanitise for —
 * nginx serving a hostPath is the whole deployment and the endpoint is a
 * `log_format` writing `$request_body` verbatim. It applies everywhere now:
 * where a backend does its own flattening this is redundant and harmless, and
 * where one does not it is the only thing standing between a crafted label and
 * the log. Cheap, idempotent, and the asymmetry was never a deliberate choice.
 *
 * Note what it is and is not: JSON encoding already escapes every control
 * character, so no label can break the log line regardless. What JSON leaves
 * alone is the invisible and the bidi-reordering, which is what this removes.
 * On a client this is a *tidiness* guarantee, never a security one — a
 * hand-written POST can still write whatever it likes.
 *
 * Exported for its own test.
 */
export function oneLine(label: string, max = MAX_LABEL): string {
  return [...label.replace(DECEPTIVE, ' ').split(/\s+/u).join(' ').trim()].slice(0, max).join('');
}

/**
 * The verbatim label of the nearest interactive ancestor of `node`.
 *
 * Returns null when the tap did not land on or inside a control, which is what
 * keeps the trace to things a person meant to do. Reuses the accessible name
 * already on screen — aria-label, then trimmed text, then a title — so nothing
 * needs a bespoke tracking attribute and no control can be instrumented wrongly
 * by being forgotten.
 *
 * Exported for its own test.
 */
export function labelFor(node: EventTarget | null): string | null {
  if (!(node instanceof Element)) return null;
  const el = node.closest(
    'button, a, [role="button"], [role="tab"], [role="menuitem"], [role="switch"], input[type="submit"]',
  );
  if (!el) return null;
  const aria = el.getAttribute('aria-label')?.trim();
  if (aria) return oneLine(aria);

  // Read the visible label minus the decorative parts. A Material icon renders
  // its ligature *name* as text, so an icon+label button would otherwise log
  // "storeFind at Asda"; and aria-hidden content is by definition not part of
  // what the control says. Stripped on a clone, so the live DOM is untouched.
  const clone = el.cloneNode(true);
  let text = '';
  if (clone instanceof Element) {
    clone.querySelectorAll('mat-icon, [aria-hidden="true"]').forEach((n) => {
      n.remove();
    });
    text = (clone.textContent ?? '').replace(/\s+/g, ' ').trim();
  }
  if (text) return oneLine(text);
  const title = el.getAttribute('title')?.trim();
  return title ? oneLine(title) : null;
}
