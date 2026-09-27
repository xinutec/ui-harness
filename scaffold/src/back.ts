import type { ComponentType } from '@angular/cdk/portal';
import { Location } from '@angular/common';
import { Injectable, inject } from '@angular/core';
import { MatBottomSheet, type MatBottomSheetConfig, type MatBottomSheetRef } from '@angular/material/bottom-sheet';
import { MatDialog, type MatDialogConfig, type MatDialogRef } from '@angular/material/dialog';

import { wireBack } from './history';

/** `MatBottomSheet`, with every sheet it opens closed by the back gesture. */
@Injectable({ providedIn: 'root' })
export class Sheets {
  private readonly sheet = inject(MatBottomSheet);
  private readonly location = inject(Location);

  open<T, D = unknown, R = unknown>(component: ComponentType<T>, config?: MatBottomSheetConfig<D>): MatBottomSheetRef<T, R> {
    const ref = this.sheet.open<T, D, R>(component, config);
    wireBack(this.location, ref.afterDismissed());
    return ref;
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
