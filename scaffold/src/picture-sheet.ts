import {
  Component,
  computed,
  type ElementRef,
  Injectable,
  inject,
  type OnDestroy,
  signal,
  ViewEncapsulation,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MAT_BOTTOM_SHEET_DATA, MatBottomSheetRef } from '@angular/material/bottom-sheet';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import type { Observable } from 'rxjs';

import { Sheets } from './back';
import {
  FIT,
  fittedIn,
  moved,
  type Point,
  pinched,
  type Size,
  scaledAbout,
  toggled,
  type View,
} from './zoom';

/**
 * How far a finger may wander before the gesture stops being a tap: at zero
 * every tap is a one-pixel drag.
 */
const SLIP = 8;

/**
 * How much wheel it takes to double the magnification. `Math.exp` rather than a
 * step, so a trackpad's stream of small deltas is smooth.
 */
const WHEEL = 300;

/** A picture to look at. */
export interface Picture {
  /** What it is, at the top: an address or a file name. */
  readonly label: string;
  /**
   * Its bytes: an address an `<img>` can load, or a `Blob` that arrives later —
   * for bytes that need the app's own request, whose failure it can explain.
   */
  readonly source: string | Observable<Blob>;
  /** Why the `Blob` did not arrive, in the app's words; by default the error's own message. */
  readonly explain?: (err: unknown) => string | Promise<string>;
}

/**
 * A picture, full screen over the app, to look at closely: pinch, drag, the
 * wheel, and a tap to go in and back out. Back closes it and only it, through
 * [[Sheets]]'s history entry.
 *
 * `ViewEncapsulation.None`, with every rule scoped to this element or its panel:
 * the pane and the sheet container it fills are Material's, outside this
 * component, and an app would otherwise have to style them for it.
 */
@Component({
  selector: 'ui-picture-sheet',
  templateUrl: './picture-sheet.html',
  styleUrl: './picture-sheet.scss',
  encapsulation: ViewEncapsulation.None,
  imports: [MatButtonModule, MatIconModule, MatProgressBarModule],
})
export class PictureSheet implements OnDestroy {
  private readonly given = inject<Picture>(MAT_BOTTOM_SHEET_DATA);
  private sheet = inject(MatBottomSheetRef<PictureSheet>);

  protected readonly label = this.given.label;
  /** What the picture is drawn from: the address, or a blob URL once the bytes arrived. */
  protected readonly at = signal<string | undefined>(undefined);
  /** Why there is no picture, in words. */
  protected readonly trouble = signal('');
  /** A blob URL made here, to give back on close. */
  private made: string | undefined;

  private readonly frame = viewChild<ElementRef<HTMLElement>>('frame');
  private readonly picture = viewChild<ElementRef<HTMLImageElement>>('picture');

  /** Where the picture is, as a magnification and an offset. See `zoom.ts`. */
  private readonly view = signal<View>(FIT);
  /** What the template puts on the `img`. */
  protected readonly drawn = computed(() => {
    const view = this.view();
    return `translate(${view.x}px, ${view.y}px) scale(${view.scale})`;
  });
  /** Whether it is magnified at all — the label and the cursor both change. */
  protected readonly closeUp = computed(() => this.view().scale > 1);

  /**
   * The fingers currently on the picture, by the id the browser gives each. A
   * `Map`: a third finger mid-pinch, or a pointer whose `up` never arrives, are
   * ordinary, and two fields would leave a stale one behind.
   */
  private readonly fingers = new Map<number, Point>();
  /** Whether this gesture has moved far enough to be a drag rather than a tap. */
  private travelled = false;

  constructor() {
    const source = this.given.source;
    if (typeof source === 'string') {
      this.at.set(source);
      return;
    }
    source.pipe(takeUntilDestroyed()).subscribe({
      next: (bytes) => {
        this.made = URL.createObjectURL(bytes);
        this.at.set(this.made);
      },
      error: (err: unknown) => void this.explain(err),
    });
  }

  ngOnDestroy(): void {
    // A blob URL is a reference the document holds until it is revoked, and these
    // are megabytes.
    if (this.made) URL.revokeObjectURL(this.made);
  }

  /** An address that would not load: the `<img>` says nothing about why. */
  protected unloadable(): void {
    this.trouble.set('This picture could not be loaded.');
  }

  protected close(): void {
    this.sheet.dismiss();
  }

  /**
   * The frame's size and what the picture is drawn at inside it — read from the
   * elements every time: the phone rotates, the chrome comes and goes, and the
   * picture's own size is not known until it has loaded.
   */
  private measures(): { frame: Size; base: Size } | undefined {
    const frame = this.frame()?.nativeElement;
    const picture = this.picture()?.nativeElement;
    if (!frame || !picture?.naturalWidth) return undefined;
    const box = frame.getBoundingClientRect();
    const size = { width: box.width, height: box.height };
    return {
      frame: size,
      base: fittedIn({ width: picture.naturalWidth, height: picture.naturalHeight }, size),
    };
  }

  /**
   * A page point, as the transform measures: from the middle of the frame, which
   * is where `transform-origin` puts it.
   */
  private atPoint(page: Point): Point {
    const box = this.frame()?.nativeElement.getBoundingClientRect();
    if (!box) return { x: 0, y: 0 };
    return { x: page.x - (box.left + box.width / 2), y: page.y - (box.top + box.height / 2) };
  }

  /** A picture that has arrived is fitted, whatever the last one was doing. */
  protected measured(): void {
    this.view.set(FIT);
  }

  protected took(event: PointerEvent): void {
    // Captured, so the gesture survives leaving the element: a drag reaching the
    // edge otherwise stops getting `move` events with the finger still down.
    this.frame()?.nativeElement.setPointerCapture(event.pointerId);
    this.fingers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    this.travelled = false;
  }

  /**
   * A finger moved: pinch if there is another one down, pan if not. The two
   * positions of the pair come from the map either side of this update — only one
   * finger moves per event. A separate copy of the pair loses the first increment
   * of every pinch.
   */
  protected drew(event: PointerEvent): void {
    const was = this.fingers.get(event.pointerId);
    const measures = this.measures();
    if (!was || !measures) return;
    const now = { x: event.clientX, y: event.clientY };
    const before = [...this.fingers.values()];
    this.fingers.set(event.pointerId, now);
    const after = [...this.fingers.values()];
    if (Math.hypot(now.x - was.x, now.y - was.y) > SLIP) this.travelled = true;

    // The first two, so a third finger joining changes nothing — a Map keeps
    // insertion order, including when a key is written again, so `before` and
    // `after` are the same length and a pair on one is a pair on the other.
    const [wasFirst, wasSecond] = before;
    const [first, second] = after;
    if (wasFirst && wasSecond && first && second) {
      const gesture = pinched([wasFirst, wasSecond], [first, second]);
      this.view.update((view) =>
        scaledAbout(view, this.atPoint(gesture.at), gesture.by, measures.frame, measures.base),
      );
      return;
    }

    this.view.update((view) =>
      moved(view, { x: now.x - was.x, y: now.y - was.y }, measures.frame, measures.base),
    );
  }

  protected letGo(event: PointerEvent): void {
    this.fingers.delete(event.pointerId);
  }

  /**
   * The wheel, for the same picture at a desk. `preventDefault`, or the page
   * scrolls behind it.
   */
  protected rolled(event: WheelEvent): void {
    const measures = this.measures();
    if (!measures) return;
    event.preventDefault();
    this.view.update((view) =>
      scaledAbout(
        view,
        this.atPoint({ x: event.clientX, y: event.clientY }),
        Math.exp(-event.deltaY / WHEEL),
        measures.frame,
        measures.base,
      ),
    );
  }

  /**
   * A tap, or Enter on the focused picture: in about that point, or back out. Not
   * after a drag — a pan ends with a `click`, and the gesture would undo itself.
   */
  protected tapped(event: MouseEvent): void {
    if (this.travelled) return;
    const measures = this.measures();
    if (!measures) return;
    // A keyboard `click` reports the element's corner; the centre is what "look
    // closer" means with no place to look at.
    const at =
      event.detail === 0 ? { x: 0, y: 0 } : this.atPoint({ x: event.clientX, y: event.clientY });
    this.view.update((view) => toggled(view, at, measures.frame, measures.base));
  }

  private async explain(err: unknown): Promise<void> {
    const said = this.given.explain
      ? await this.given.explain(err)
      : err instanceof Error
        ? err.message
        : String(err);
    this.trouble.set(said || 'This picture could not be loaded.');
  }
}

/** Opens a [[Picture]] full screen; back closes it. */
@Injectable({ providedIn: 'root' })
export class Pictures {
  private readonly sheets = inject(Sheets);

  open(picture: Picture): void {
    this.sheets.open(PictureSheet, { data: picture, panelClass: 'ui-picture-panel' });
  }
}
