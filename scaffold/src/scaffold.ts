import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule, type MatMenuPanel } from '@angular/material/menu';
import { MatToolbarModule } from '@angular/material/toolbar';
import { RouterLink } from '@angular/router';

import { Place } from './place';

/**
 * The top bar every app draws, one for the whole app, above the router.
 *
 * On a screen with no up — the root, or a top-level screen the menu reaches —
 * a leading `menu` when the app has one, then the screen's name, or the app's
 * when the screen gives none. On any screen whose route declares up: a leading `arrow_back` to its
 * parent, then the screen's name. Then what the element holds, for the whole
 * app (a keep-awake toggle), then the screen's own actions ([ScaffoldActions]).
 */
@Component({
  selector: 'ui-scaffold',
  imports: [NgTemplateOutlet, RouterLink, MatToolbarModule, MatButtonModule, MatIconModule, MatMenuModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './scaffold.html',
  styleUrl: './scaffold.scss',
})
export class Scaffold {
  protected readonly place = inject(Place);

  /** The app's name, on a screen with no up that does not name itself. */
  readonly title = input.required<string>();
  /** What the root screen's leading `menu` opens. No menu, no button. */
  readonly menu = input<MatMenuPanel>();
}
