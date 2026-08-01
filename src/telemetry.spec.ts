/**
 * The label rules and the flattener, tested once for the whole fleet.
 *
 * These were previously nine near-identical spec files, one per app. Both
 * functions are pure — `labelFor` reads a DOM node, `oneLine` is string work —
 * so neither needs Angular, and they are the bulk of what this module decides.
 * The service's dependency wiring is exercised at a real consumer instead, in
 * the environment that actually runs it; see life's `telemetry.spec.ts`.
 */

import { describe, expect, it } from 'vitest';

import { labelFor, oneLine } from './telemetry-label.js';

function el(html: string): Element {
  const host = document.createElement('div');
  host.innerHTML = html;
  return host.firstElementChild as Element;
}

describe('labelFor', () => {
  it("reads a button's visible text, whitespace collapsed", () => {
    expect(labelFor(el('<button>  Find at\n  Asda </button>'))).toBe('Find at Asda');
  });

  it('prefers an explicit aria-label over the text', () => {
    expect(labelFor(el('<button aria-label="Add Asda listing">Add</button>'))).toBe(
      'Add Asda listing',
    );
  });

  it('climbs to the enclosing control when the tap lands on an inner icon', () => {
    // Material buttons wrap an icon + label; a tap often hits the icon span.
    const b = el('<button><mat-icon>store</mat-icon><span>Find at Asda</span></button>');
    expect(labelFor(b.querySelector('mat-icon'))).toBe('Find at Asda');
  });

  it("strips a Material icon's ligature name, which renders as text", () => {
    // Without this the label reads "storeFind at Asda" — the ligature name is
    // painted as characters, so textContent picks it up.
    const b = el('<button><mat-icon>store</mat-icon>Find at Asda</button>');
    expect(labelFor(b)).toBe('Find at Asda');
  });

  it('ignores aria-hidden content, which is not part of what the control says', () => {
    const b = el('<button><span aria-hidden="true">•</span>Save</button>');
    expect(labelFor(b)).toBe('Save');
  });

  it('falls back to a title when there is no aria-label and no text', () => {
    expect(labelFor(el('<button title="Close"></button>'))).toBe('Close');
  });

  it('returns null for a tap on nothing interactive', () => {
    expect(labelFor(el('<p>just some copy</p>'))).toBeNull();
    expect(labelFor(null)).toBeNull();
  });

  it('returns null for a control with no name at all', () => {
    expect(labelFor(el('<button></button>'))).toBeNull();
  });

  it('recognises role-based controls, not just <button>', () => {
    expect(labelFor(el('<div role="button">Save</div>'))).toBe('Save');
    expect(labelFor(el('<a role="tab">Today</a>'))).toBe('Today');
  });

  it('flattens a deceptive label rather than passing it through', () => {
    // labelFor routes every branch through oneLine; this pins that it does,
    // since a label reaching the log unflattened is the whole hazard.
    const b = el('<button aria-label="Save&#x202e;&#x202d;Delete">x</button>');
    expect(labelFor(b)).toBe('Save Delete');
  });
});

describe('oneLine', () => {
  it('leaves an ordinary control label alone', () => {
    expect(oneLine('Compare with previous')).toBe('Compare with previous');
  });

  it('collapses the whitespace a rendered label picks up', () => {
    // Button text read out of the DOM arrives with the template's indentation
    // in it, so this is the ordinary case, not an attack.
    expect(oneLine('  Play \n  path  ')).toBe('Play path');
  });

  it('replaces a zero-width character that would read as nothing', () => {
    // U+200B is not whitespace and not a control character, so nothing else
    // here touches it — and a label made of them fills the cap while appearing
    // empty in the log. A space rather than nothing, so the removal stays
    // visible: a label that had one is not silently rewritten into a different
    // plausible label.
    expect(oneLine('a\u{200b}b')).toBe('a b');
  });

  it('replaces a bidi override, which can make a line display as something else', () => {
    // U+202E flips the rendering of everything after it: the log line still
    // says one thing and shows another, invisibly. Trojan Source, aimed at the
    // record rather than at source code.
    const flat = oneLine('Save\u{202e}\u{202d}Delete');
    expect(flat).not.toContain('\u{202e}');
    expect(flat).toBe('Save Delete');
  });

  it('caps by code point, so a glyph is never split in half', () => {
    expect([...oneLine('é'.repeat(500))].length).toBe(160);
  });

  it('caps astral characters whole', () => {
    // A naive slice() would cut a surrogate pair and emit a lone half.
    expect(oneLine('🙂'.repeat(300), 4)).toBe('🙂🙂🙂🙂');
  });
});
