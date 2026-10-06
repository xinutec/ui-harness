import { ComponentType } from "@angular/cdk/portal";
import { MatBottomSheetConfig, MatBottomSheetRef } from "@angular/material/bottom-sheet";
import { MatDialogConfig, MatDialogRef } from "@angular/material/dialog";
import { NavigationExtras } from "@angular/router";
import * as i0 from "@angular/core";
import { OnDestroy, OnInit, Signal, TemplateRef } from "@angular/core";
import { Location } from "@angular/common";
import { Observable } from "rxjs";
import { MatMenuPanel } from "@angular/material/menu";
/** `MatBottomSheet`, with every sheet it opens closed by the back gesture. */
export declare class Sheets {
  private readonly sheet;
  private readonly location;
  private readonly router;
  open<T, D = unknown, R = unknown>(component: ComponentType<T>, config?: MatBottomSheetConfig<D>): MatBottomSheetRef<T, R>;
  /**
   * Close `ref` and go to `commands`, in its history entry's place: pushed on top,
   * the new screen would strand the sheet's entry under it, and back from that
   * screen would stop on nothing (#1801). For a sheet that navigates as it closes.
   */
  dismissTo<R>(ref: MatBottomSheetRef<unknown, R>, commands: readonly unknown[], extras?: NavigationExtras): Promise<boolean>;
  static ɵfac: i0.ɵɵFactoryDeclaration<Sheets, never>;
  static ɵprov: i0.ɵɵInjectableDeclaration<any>;
}
/** `MatDialog`, with every dialog it opens closed by the back gesture. */
export declare class Dialogs {
  private readonly dialog;
  private readonly location;
  open<T, D = unknown, R = unknown>(component: ComponentType<T>, config?: MatDialogConfig<D>): MatDialogRef<T, R>;
  static ɵfac: i0.ɵɵFactoryDeclaration<Dialogs, never>;
  static ɵprov: i0.ɵɵInjectableDeclaration<any>;
}
/** The part of `Location` wiring an overlay into history uses. */
type History = Pick<Location, 'go' | 'back' | 'path' | 'getState'>;
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
export declare function wireBack(history: History, closed: Observable<unknown>): void;
/** Whether the entry on top of history is an overlay's. */
declare function overlayOnTop(history: Pick<History, 'getState'>): boolean;
/** A picture to look at. */
interface Picture {
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
export declare class PictureSheet implements OnDestroy {
  private readonly given;
  private sheet;
  protected readonly label: string;
  /** What the picture is drawn from: the address, or a blob URL once the bytes arrived. */
  protected readonly at: import("@angular/core").WritableSignal<string | undefined>;
  /** Why there is no picture, in words. */
  protected readonly trouble: import("@angular/core").WritableSignal<string>;
  /** A blob URL made here, to give back on close. */
  private made;
  private readonly frame;
  private readonly picture;
  /** Where the picture is, as a magnification and an offset. See `zoom.ts`. */
  private readonly view;
  /** What the template puts on the `img`. */
  protected readonly drawn: import("@angular/core").Signal<string>;
  /** Whether it is magnified at all — the label and the cursor both change. */
  protected readonly closeUp: import("@angular/core").Signal<boolean>;
  /**
   * The fingers currently on the picture, by the id the browser gives each. A
   * `Map`: a third finger mid-pinch, or a pointer whose `up` never arrives, are
   * ordinary, and two fields would leave a stale one behind.
   */
  private readonly fingers;
  /** Whether this gesture has moved far enough to be a drag rather than a tap. */
  private travelled;
  constructor();
  ngOnDestroy(): void;
  /** An address that would not load: the `<img>` says nothing about why. */
  protected unloadable(): void;
  protected close(): void;
  /**
   * The frame's size and what the picture is drawn at inside it — read from the
   * elements every time: the phone rotates, the chrome comes and goes, and the
   * picture's own size is not known until it has loaded.
   */
  private measures;
  /**
   * A page point, as the transform measures: from the middle of the frame, which
   * is where `transform-origin` puts it.
   */
  private atPoint;
  /** A picture that has arrived is fitted, whatever the last one was doing. */
  protected measured(): void;
  protected took(event: PointerEvent): void;
  /**
   * A finger moved: pinch if there is another one down, pan if not. The two
   * positions of the pair come from the map either side of this update — only one
   * finger moves per event. A separate copy of the pair loses the first increment
   * of every pinch.
   */
  protected drew(event: PointerEvent): void;
  protected letGo(event: PointerEvent): void;
  /**
   * The wheel, for the same picture at a desk. `preventDefault`, or the page
   * scrolls behind it.
   */
  protected rolled(event: WheelEvent): void;
  /**
   * A tap, or Enter on the focused picture: in about that point, or back out. Not
   * after a drag — a pan ends with a `click`, and the gesture would undo itself.
   */
  protected tapped(event: MouseEvent): void;
  private explain;
  static ɵfac: i0.ɵɵFactoryDeclaration<PictureSheet, never>;
  static ɵcmp: i0.ɵɵComponentDeclaration<PictureSheet, "ui-picture-sheet", never, {}, {}, never, never, true, never>;
}
/** Opens a [[Picture]] full screen; back closes it. */
export declare class Pictures {
  private readonly sheets;
  open(picture: Picture): void;
  static ɵfac: i0.ɵɵFactoryDeclaration<Pictures, never>;
  static ɵprov: i0.ɵɵInjectableDeclaration<any>;
}
/**
 * Where up goes from a screen, declared on its route and read by the bar.
 *
 * Up is the parent screen, not history: a screen opened from a link or a
 * notification still has a parent, and back from it must not leave the app.
 * Declared on the route rather than set by the page, so that whether a screen
 * has one is visible in the route table without running anything.
 *
 *     { path: 's/:id/w/:run', component: WorkflowView, data: { up: '/s/:id' } }
 *
 * A screen with several parents — a detail reached from many lists — declares
 * `opener: true`: up returns to the screen that opened it, as back does, and
 * `path` is where it goes when nothing in the app did (Android's "Up vs Back").
 */
/** A route's `data.up`: a path, whose `:name` segments are filled from the route's parameters. */
type UpDeclaration = string | {
  readonly path: string;
  /** Query parameters carried over from the screen's own URL to its parent's. */
  readonly keep?: readonly string[];
  /** What the arrow says to a screen reader. Defaults to `back`. */
  readonly label?: string;
  /** Return to the screen that opened this one; `path` only when none in the app did. */
  readonly opener?: boolean;
};
/** Up, resolved against the screen on view: a router link. */
interface Up {
  readonly path: string;
  readonly query: Readonly<Record<string, string>>;
  readonly label: string;
  /** Up is back while an in-app screen opened this one. */
  readonly opener: boolean;
}
/** The key a route's `data` declares up under. */
export declare const UP = "up";
/**
 * The key a route's `data` sets to `true` for a peer top-level screen: one of
 * several equal main screens, which keeps the menu and has no up: a destination
 * the menu lists. Every route but the root declares one or the other (dev-lint
 * #1793); a utility screen the menu opens is drilled in, and declares up.
 */
export declare const TOP = "top";
/**
 * A route's up, from its `data`: none for the root or a `top` screen. Throws on
 * a route that declares both, which says two contradictory things about its bar.
 */
export declare function declaredUp(data: Readonly<Record<string, unknown>>): UpDeclaration | undefined;
/**
 * Fill `declared` from the parameters and query of the screen on view.
 *
 * Throws on a `:name` the route does not supply: that is a route table naming
 * a parent it cannot reach, and a bar pointing somewhere wrong is worse than a
 * build that fails.
 */
export declare function resolveUp(declared: UpDeclaration, params: Readonly<Record<string, string>>, query: Readonly<Record<string, string>>): Up;
/** A screen's name in the bar, and whether it is a stand-in for one not known yet. */
interface Title {
  readonly text: string;
  readonly provisional?: boolean;
}
/**
 * The screen on view, as the bar above the router needs it: where up goes, what
 * the screen is called and what it offers. Up comes from the route (see `up.ts`);
 * the title and the actions from the page, through [scaffoldTitle] and
 * [ScaffoldActions].
 */
export declare class Place {
  private readonly router;
  /** Where the arrow goes, or nothing on a screen with no parent: the root. */
  readonly up: Signal<Up | undefined>;
  /**
   * Whether an in-app screen is behind this one, so up may be back. False on
   * the first screen the app showed: back from it would leave the app.
   */
  readonly opened: Signal<boolean>;
  readonly title: import("@angular/core").WritableSignal<Title | undefined>;
  readonly actions: import("@angular/core").WritableSignal<TemplateRef<unknown> | undefined>;
  static ɵfac: i0.ɵɵFactoryDeclaration<Place, never>;
  static ɵprov: i0.ɵɵInjectableDeclaration<any>;
}
/**
 * Name the screen in the bar for as long as the calling page is on view. Call
 * from a page's constructor; `text` is read reactively, so a name that arrives
 * later replaces the stand-in.
 */
export declare function scaffoldTitle(text: () => string | Title | undefined): void;
/**
 * The screen's own actions, drawn at the end of the bar while the page that
 * declares them is on view:
 *
 *     <ng-template scaffoldActions>
 *       <button matIconButton [matMenuTriggerFor]="menu" aria-label="…"><mat-icon>more_vert</mat-icon></button>
 *     </ng-template>
 */
export declare class ScaffoldActions implements OnInit, OnDestroy {
  private readonly place;
  private readonly template;
  ngOnInit(): void;
  ngOnDestroy(): void;
  static ɵfac: i0.ɵɵFactoryDeclaration<ScaffoldActions, never>;
  static ɵdir: i0.ɵɵDirectiveDeclaration<ScaffoldActions, "ng-template[scaffoldActions]", never, {}, {}, never, never, true, never>;
}
/**
 * The top bar every app draws, one for the whole app, above the router.
 *
 * On a screen with no up — the root, or a top-level screen the menu reaches —
 * a leading `menu` when the app has one, then the screen's name, or the app's
 * when the screen gives none. On any screen whose route declares up: a leading `arrow_back` to its
 * parent, then the screen's name. Then what the element holds, for the whole
 * app (a keep-awake toggle), then the screen's own actions ([ScaffoldActions]).
 */
export declare class Scaffold {
  protected readonly place: Place;
  protected readonly location: Location;
  /** The app's name, on a screen with no up that does not name itself. */
  readonly title: import("@angular/core").InputSignal<string>;
  /** What the root screen's leading `menu` opens. No menu, no button. */
  readonly menu: import("@angular/core").InputSignal<MatMenuPanel<any> | undefined>;
  /** How many things behind the menu need attention, as a badge on its button. 0 shows none. */
  readonly menuBadge: import("@angular/core").InputSignal<number>;
  /** The menu button's accessible name; one with a badge should say what it counts. */
  readonly menuLabel: import("@angular/core").InputSignal<string>;
  static ɵfac: i0.ɵɵFactoryDeclaration<Scaffold, never>;
  static ɵcmp: i0.ɵɵComponentDeclaration<Scaffold, "ui-scaffold", never, {
    "title": {
      "alias": "title";
      "required": true;
      "isSignal": true;
    };
    "menu": {
      "alias": "menu";
      "required": false;
      "isSignal": true;
    };
    "menuBadge": {
      "alias": "menuBadge";
      "required": false;
      "isSignal": true;
    };
    "menuLabel": {
      "alias": "menuLabel";
      "required": false;
      "isSignal": true;
    };
  }, {}, never, ["*"], true, never>;
}
export type { History, Picture, Title, Up, UpDeclaration };