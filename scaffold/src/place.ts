import {
  DestroyRef,
  Directive,
  effect,
  Injectable,
  inject,
  type OnDestroy,
  type OnInit,
  type Signal,
  signal,
  TemplateRef,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { type ActivatedRouteSnapshot, NavigationEnd, Router } from '@angular/router';
import { filter, map, scan } from 'rxjs';

import { declaredUp, resolveUp, type Up } from './up';

/** A screen's name in the bar, and whether it is a stand-in for one not known yet. */
export interface Title {
  readonly text: string;
  readonly provisional?: boolean;
}

/**
 * The screen on view, as the bar above the router needs it: where up goes, what
 * the screen is called and what it offers. Up comes from the route (see `up.ts`);
 * the title and the actions from the page, through [scaffoldTitle] and
 * [ScaffoldActions].
 */
@Injectable({ providedIn: 'root' })
export class Place {
  private readonly router = inject(Router);

  /** Where the arrow goes, or nothing on a screen with no parent: the root. */
  readonly up: Signal<Up | undefined> = toSignal(
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      map(() => upOf(this.router.routerState.snapshot.root)),
    ),
    { initialValue: upOf(this.router.routerState.snapshot.root) },
  );

  /**
   * Whether an in-app screen is behind this one, so up may be back. False on
   * the first screen the app showed: back from it would leave the app.
   */
  readonly opened: Signal<boolean> = toSignal(
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      scan((shown) => shown + 1, this.router.navigated ? 1 : 0),
      map((shown) => shown > 1),
    ),
    { initialValue: false },
  );

  readonly title = signal<Title | undefined>(undefined);
  readonly actions = signal<TemplateRef<unknown> | undefined>(undefined);
  readonly leading = signal<TemplateRef<unknown> | undefined>(undefined);
}

/** The deepest route's declared up, filled from every parameter on the way down. */
function upOf(root: ActivatedRouteSnapshot): Up | undefined {
  let route = root;
  const params: Record<string, string> = { ...root.params };
  while (route.firstChild) {
    route = route.firstChild;
    Object.assign(params, route.params);
  }
  const declared = declaredUp(route.data);
  return declared === undefined ? undefined : resolveUp(declared, params, route.queryParams);
}

/**
 * Name the screen in the bar for as long as the calling page is on view. Call
 * from a page's constructor; `text` is read reactively, so a name that arrives
 * later replaces the stand-in.
 */
export function scaffoldTitle(text: () => string | Title | undefined): void {
  const place = inject(Place);
  const mine = signal<Title | undefined>(undefined);
  effect(() => {
    const got = text();
    const title = typeof got === 'string' ? { text: got } : got;
    mine.set(title);
    place.title.set(title);
  });
  // Only if it is still ours: the next page may already have named itself.
  inject(DestroyRef).onDestroy(() => {
    if (place.title() === mine()) place.title.set(undefined);
  });
}

/**
 * The screen's own actions, drawn at the end of the bar while the page that
 * declares them is on view:
 *
 *     <ng-template scaffoldActions>
 *       <button matIconButton [matMenuTriggerFor]="menu" aria-label="…"><mat-icon>more_vert</mat-icon></button>
 *     </ng-template>
 */
@Directive({ selector: 'ng-template[scaffoldActions]' })
export class ScaffoldActions implements OnInit, OnDestroy {
  private readonly place = inject(Place);
  private readonly template = inject(TemplateRef<unknown>);

  ngOnInit(): void {
    this.place.actions.set(this.template);
  }

  ngOnDestroy(): void {
    if (this.place.actions() === this.template) this.place.actions.set(undefined);
  }
}

/**
 * What stands before the screen's name, after up, while the page that declares
 * it is on view: a conversation's picture, say.
 *
 *     <ng-template scaffoldLeading><app-avatar … /></ng-template>
 */
@Directive({ selector: 'ng-template[scaffoldLeading]' })
export class ScaffoldLeading implements OnInit, OnDestroy {
  private readonly place = inject(Place);
  private readonly template = inject(TemplateRef<unknown>);

  ngOnInit(): void {
    this.place.leading.set(this.template);
  }

  ngOnDestroy(): void {
    if (this.place.leading() === this.template) this.place.leading.set(undefined);
  }
}
