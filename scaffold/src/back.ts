import type { ComponentType } from '@angular/cdk/portal';
import { Location } from '@angular/common';
import { Injectable, inject } from '@angular/core';
import { MatBottomSheet, type MatBottomSheetConfig, type MatBottomSheetRef } from '@angular/material/bottom-sheet';
import { MatDialog, type MatDialogConfig, type MatDialogRef } from '@angular/material/dialog';
import { type NavigationExtras, Router } from '@angular/router';

import { overlayOnTop, wireBack } from './history';

/** `MatBottomSheet`, with every sheet it opens closed by the back gesture. */
@Injectable({ providedIn: 'root' })
export class Sheets {
  private readonly sheet = inject(MatBottomSheet);
  private readonly location = inject(Location);
  private readonly router = inject(Router);

  open<T, D = unknown, R = unknown>(component: ComponentType<T>, config?: MatBottomSheetConfig<D>): MatBottomSheetRef<T, R> {
    const ref = this.sheet.open<T, D, R>(component, config);
    wireBack(this.location, ref.afterDismissed());
    return ref;
  }

  /**
   * Close `ref` and go to `commands`, in its history entry's place: pushed on top,
   * the new screen would strand the sheet's entry under it, and back from that
   * screen would stop on nothing (#1801). For a sheet that navigates as it closes.
   */
  dismissTo<R>(
    ref: MatBottomSheetRef<unknown, R>,
    commands: readonly unknown[],
    extras?: NavigationExtras,
  ): Promise<boolean> {
    const replaceUrl = overlayOnTop(this.location) || extras?.replaceUrl;
    ref.dismiss();
    return this.router.navigate(commands, { ...extras, replaceUrl });
  }
}

/** `MatDialog`, with every dialog it opens closed by the back gesture. */
@Injectable({ providedIn: 'root' })
export class Dialogs {
  private readonly dialog = inject(MatDialog);
  private readonly location = inject(Location);

  open<T, D = unknown, R = unknown>(component: ComponentType<T>, config?: MatDialogConfig<D>): MatDialogRef<T, R> {
    const ref = this.dialog.open<T, D, R>(component, config);
    wireBack(this.location, ref.afterClosed());
    return ref;
  }
}
