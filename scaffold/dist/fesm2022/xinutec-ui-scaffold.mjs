import { Location, NgTemplateOutlet } from "@angular/common";
import * as i0 from "@angular/core";
import { ChangeDetectionStrategy, Component, DestroyRef, Directive, Injectable, TemplateRef, ViewEncapsulation, computed, effect, inject, input, signal, viewChild } from "@angular/core";
import { MAT_BOTTOM_SHEET_DATA, MatBottomSheet, MatBottomSheetRef } from "@angular/material/bottom-sheet";
import { MatDialog } from "@angular/material/dialog";
import { NavigationEnd, Router, RouterLink } from "@angular/router";
import { takeUntilDestroyed, toSignal } from "@angular/core/rxjs-interop";
import * as i1$1 from "@angular/material/button";
import { MatButtonModule } from "@angular/material/button";
import * as i2$1 from "@angular/material/icon";
import { MatIconModule } from "@angular/material/icon";
import * as i3 from "@angular/material/progress-bar";
import { MatProgressBarModule } from "@angular/material/progress-bar";
import { filter, map, scan } from "rxjs";
import * as i2 from "@angular/material/badge";
import { MatBadgeModule } from "@angular/material/badge";
import * as i5 from "@angular/material/menu";
import { MatMenuModule } from "@angular/material/menu";
import * as i1 from "@angular/material/toolbar";
import { MatToolbarModule } from "@angular/material/toolbar";
function wireBack(history, closed) {
	history.go(history.path(true), "", { overlay: true });
	closed.subscribe(() => {
		if (overlayOnTop(history)) history.back();
	});
}
function overlayOnTop(history) {
	const state = history.getState();
	return typeof state === "object" && state !== null && "overlay" in state;
}
var Sheets = class Sheets {
	sheet = inject(MatBottomSheet);
	location = inject(Location);
	router = inject(Router);
	open(component, config) {
		const ref = this.sheet.open(component, config);
		wireBack(this.location, ref.afterDismissed());
		return ref;
	}
	dismissTo(ref, commands, extras) {
		const replaceUrl = overlayOnTop(this.location) || extras?.replaceUrl;
		ref.dismiss();
		return this.router.navigate(commands, {
			...extras,
			replaceUrl
		});
	}
	static ɵfac = i0.ɵɵngDeclareFactory({
		minVersion: "12.0.0",
		version: "22.2.1",
		ngImport: i0,
		type: Sheets,
		deps: [],
		target: i0.ɵɵFactoryTarget.Injectable
	});
	static ɵprov = i0.ɵɵngDeclareInjectable({
		minVersion: "12.0.0",
		version: "22.2.1",
		ngImport: i0,
		type: Sheets,
		providedIn: "root"
	});
};
i0.ɵɵngDeclareClassMetadata({
	minVersion: "12.0.0",
	version: "22.2.1",
	ngImport: i0,
	type: Sheets,
	decorators: [{
		type: Injectable,
		args: [{ providedIn: "root" }]
	}]
});
var Dialogs = class Dialogs {
	dialog = inject(MatDialog);
	location = inject(Location);
	open(component, config) {
		const ref = this.dialog.open(component, config);
		wireBack(this.location, ref.afterClosed());
		return ref;
	}
	static ɵfac = i0.ɵɵngDeclareFactory({
		minVersion: "12.0.0",
		version: "22.2.1",
		ngImport: i0,
		type: Dialogs,
		deps: [],
		target: i0.ɵɵFactoryTarget.Injectable
	});
	static ɵprov = i0.ɵɵngDeclareInjectable({
		minVersion: "12.0.0",
		version: "22.2.1",
		ngImport: i0,
		type: Dialogs,
		providedIn: "root"
	});
};
i0.ɵɵngDeclareClassMetadata({
	minVersion: "12.0.0",
	version: "22.2.1",
	ngImport: i0,
	type: Dialogs,
	decorators: [{
		type: Injectable,
		args: [{ providedIn: "root" }]
	}]
});
const FIT = {
	scale: 1,
	x: 0,
	y: 0
};
const CLOSER = 2.5;
const clamp = (value, low, high) => {
	const held = Math.min(Math.max(value, low), high);
	return held === 0 ? 0 : held;
};
function fittedIn(picture, frame) {
	if (picture.width <= 0 || picture.height <= 0) return {
		width: 0,
		height: 0
	};
	const scale = Math.min(frame.width / picture.width, frame.height / picture.height, 1);
	return {
		width: picture.width * scale,
		height: picture.height * scale
	};
}
function bounded(view, frame, base) {
	const scale = clamp(view.scale, 1, 8);
	const slackX = Math.max(0, (base.width * scale - frame.width) / 2);
	const slackY = Math.max(0, (base.height * scale - frame.height) / 2);
	return {
		scale,
		x: clamp(view.x, -slackX, slackX),
		y: clamp(view.y, -slackY, slackY)
	};
}
function scaledAbout(view, at, by, frame, base) {
	const scale = clamp(view.scale * by, 1, 8);
	const factor = scale / view.scale;
	return bounded({
		scale,
		x: at.x - (at.x - view.x) * factor,
		y: at.y - (at.y - view.y) * factor
	}, frame, base);
}
function moved(view, by, frame, base) {
	return bounded({
		...view,
		x: view.x + by.x,
		y: view.y + by.y
	}, frame, base);
}
function toggled(view, at, frame, base) {
	if (view.scale > 1) return FIT;
	return scaledAbout(FIT, at, CLOSER, frame, base);
}
function pinched(was, now) {
	const apart = (pair) => Math.hypot(pair[0].x - pair[1].x, pair[0].y - pair[1].y);
	const middle = (pair) => ({
		x: (pair[0].x + pair[1].x) / 2,
		y: (pair[0].y + pair[1].y) / 2
	});
	const before = apart(was);
	return {
		at: middle(now),
		by: before > 0 ? apart(now) / before : 1
	};
}
const SLIP = 8;
const WHEEL = 300;
var PictureSheet = class PictureSheet {
	given = inject(MAT_BOTTOM_SHEET_DATA);
	sheet = inject(MatBottomSheetRef);
	label = this.given.label;
	at = signal(void 0, ...ngDevMode ? [{ debugName: "at" }] : /* istanbul ignore next */ []);
	trouble = signal("", ...ngDevMode ? [{ debugName: "trouble" }] : /* istanbul ignore next */ []);
	made;
	frame = viewChild("frame", ...ngDevMode ? [{ debugName: "frame" }] : /* istanbul ignore next */ []);
	picture = viewChild("picture", ...ngDevMode ? [{ debugName: "picture" }] : /* istanbul ignore next */ []);
	view = signal(FIT, ...ngDevMode ? [{ debugName: "view" }] : /* istanbul ignore next */ []);
	drawn = computed(() => {
		const view = this.view();
		return `translate(${view.x}px, ${view.y}px) scale(${view.scale})`;
	}, ...ngDevMode ? [{ debugName: "drawn" }] : /* istanbul ignore next */ []);
	closeUp = computed(() => this.view().scale > 1, ...ngDevMode ? [{ debugName: "closeUp" }] : /* istanbul ignore next */ []);
	fingers = /* @__PURE__ */ new Map();
	travelled = false;
	constructor() {
		const source = this.given.source;
		if (typeof source === "string") {
			this.at.set(source);
			return;
		}
		source.pipe(takeUntilDestroyed()).subscribe({
			next: (bytes) => {
				this.made = URL.createObjectURL(bytes);
				this.at.set(this.made);
			},
			error: (err) => void this.explain(err)
		});
	}
	ngOnDestroy() {
		if (this.made) URL.revokeObjectURL(this.made);
	}
	unloadable() {
		this.trouble.set("This picture could not be loaded.");
	}
	close() {
		this.sheet.dismiss();
	}
	measures() {
		const frame = this.frame()?.nativeElement;
		const picture = this.picture()?.nativeElement;
		if (!frame || !picture?.naturalWidth) return void 0;
		const box = frame.getBoundingClientRect();
		const size = {
			width: box.width,
			height: box.height
		};
		return {
			frame: size,
			base: fittedIn({
				width: picture.naturalWidth,
				height: picture.naturalHeight
			}, size)
		};
	}
	atPoint(page) {
		const box = this.frame()?.nativeElement.getBoundingClientRect();
		if (!box) return {
			x: 0,
			y: 0
		};
		return {
			x: page.x - (box.left + box.width / 2),
			y: page.y - (box.top + box.height / 2)
		};
	}
	measured() {
		this.view.set(FIT);
	}
	took(event) {
		this.frame()?.nativeElement.setPointerCapture(event.pointerId);
		this.fingers.set(event.pointerId, {
			x: event.clientX,
			y: event.clientY
		});
		this.travelled = false;
	}
	drew(event) {
		const was = this.fingers.get(event.pointerId);
		const measures = this.measures();
		if (!was || !measures) return;
		const now = {
			x: event.clientX,
			y: event.clientY
		};
		const before = [...this.fingers.values()];
		this.fingers.set(event.pointerId, now);
		const after = [...this.fingers.values()];
		if (Math.hypot(now.x - was.x, now.y - was.y) > SLIP) this.travelled = true;
		const [wasFirst, wasSecond] = before;
		const [first, second] = after;
		if (wasFirst && wasSecond && first && second) {
			const gesture = pinched([wasFirst, wasSecond], [first, second]);
			this.view.update((view) => scaledAbout(view, this.atPoint(gesture.at), gesture.by, measures.frame, measures.base));
			return;
		}
		this.view.update((view) => moved(view, {
			x: now.x - was.x,
			y: now.y - was.y
		}, measures.frame, measures.base));
	}
	letGo(event) {
		this.fingers.delete(event.pointerId);
	}
	rolled(event) {
		const measures = this.measures();
		if (!measures) return;
		event.preventDefault();
		this.view.update((view) => scaledAbout(view, this.atPoint({
			x: event.clientX,
			y: event.clientY
		}), Math.exp(-event.deltaY / WHEEL), measures.frame, measures.base));
	}
	tapped(event) {
		if (this.travelled) return;
		const measures = this.measures();
		if (!measures) return;
		const at = event.detail === 0 ? {
			x: 0,
			y: 0
		} : this.atPoint({
			x: event.clientX,
			y: event.clientY
		});
		this.view.update((view) => toggled(view, at, measures.frame, measures.base));
	}
	async explain(err) {
		const said = this.given.explain ? await this.given.explain(err) : err instanceof Error ? err.message : String(err);
		this.trouble.set(said || "This picture could not be loaded.");
	}
	static ɵfac = i0.ɵɵngDeclareFactory({
		minVersion: "12.0.0",
		version: "22.2.1",
		ngImport: i0,
		type: PictureSheet,
		deps: [],
		target: i0.ɵɵFactoryTarget.Component
	});
	static ɵcmp = i0.ɵɵngDeclareComponent({
		minVersion: "17.0.0",
		version: "22.2.1",
		type: PictureSheet,
		isStandalone: true,
		selector: "ui-picture-sheet",
		viewQueries: [{
			propertyName: "frame",
			first: true,
			predicate: ["frame"],
			descendants: true,
			isSignal: true
		}, {
			propertyName: "picture",
			first: true,
			predicate: ["picture"],
			descendants: true,
			isSignal: true
		}],
		ngImport: i0,
		template: "<!-- What it is, cut at the start: the end is what tells pictures apart. -->\n<header class=\"what\">\n  <!-- `<bdi>`, not bare text: the span is `direction: rtl` so the cut falls at the\n       start, and without an isolate the bidi algorithm moves a leading `/` to the\n       other end. -->\n  <span class=\"where\" [title]=\"label\"\n    ><bdi>{{ label }}</bdi></span\n  >\n  <button matIconButton type=\"button\" aria-label=\"close this picture\" (click)=\"close()\">\n    <mat-icon>close</mat-icon>\n  </button>\n</header>\n\n@if (trouble(); as why) {\n  <!-- The app's own sentence, not a broken-image glyph. -->\n  <p class=\"trouble\">\n    <mat-icon>broken_image</mat-icon>\n    {{ why }}\n  </p>\n} @else if (at(); as src) {\n  <!-- A button, so Enter is the same toggle as a tap; the gestures sit on top — see\n       `zoom.ts`. `touch-action: none` in the stylesheet is load-bearing, or the\n       browser keeps the pinch for itself. -->\n  <button\n    class=\"frame\"\n    #frame\n    type=\"button\"\n    [attr.aria-label]=\"closeUp() ? 'show the whole picture' : 'look closer at this picture'\"\n    (pointerdown)=\"took($event)\"\n    (pointermove)=\"drew($event)\"\n    (pointerup)=\"letGo($event)\"\n    (pointercancel)=\"letGo($event)\"\n    (wheel)=\"rolled($event)\"\n    (click)=\"tapped($event)\"\n  >\n    <img\n      #picture\n      [src]=\"src\"\n      [alt]=\"'a picture: ' + label\"\n      [style.transform]=\"drawn()\"\n      (load)=\"measured()\"\n      (error)=\"unloadable()\"\n    />\n  </button>\n} @else {\n  <!-- Bytes on their way, which can take seconds. -->\n  <mat-progress-bar mode=\"indeterminate\" />\n}\n",
		styles: ["ui-picture-sheet{display:flex;flex-direction:column;height:100%;min-height:0}ui-picture-sheet .what{flex:0 0 auto;display:flex;align-items:center;gap:.5rem}ui-picture-sheet .where{font:var(--mat-sys-body-small);color:var(--mat-sys-on-surface-variant);flex:1 1 auto;min-width:0;overflow:hidden;white-space:nowrap;direction:rtl;text-align:left;text-overflow:ellipsis}ui-picture-sheet .trouble{display:flex;align-items:center;gap:.5rem;color:var(--mat-sys-error);margin:1rem 0 0}ui-picture-sheet .frame{flex:1 1 auto;min-height:0;padding:0;border:0;background:none;display:flex;align-items:center;justify-content:center;overflow:hidden;touch-action:none;cursor:grab}ui-picture-sheet .frame:active{cursor:grabbing}ui-picture-sheet .frame img{max-width:100%;max-height:100%;object-fit:contain;transform-origin:center;-webkit-user-select:none;user-select:none;-webkit-user-drag:none}.cdk-overlay-pane.ui-picture-panel{height:100dvh;max-height:100dvh;width:100vw;max-width:100vw}.cdk-overlay-pane.ui-picture-panel .mat-bottom-sheet-container{height:100%;max-height:100%;width:100%;max-width:none;border-radius:0;padding:.5rem .75rem}\n"],
		dependencies: [
			{
				kind: "ngmodule",
				type: MatButtonModule
			},
			{
				kind: "component",
				type: i1$1.MatIconButton,
				selector: "button[mat-icon-button], a[mat-icon-button], button[matIconButton], a[matIconButton]",
				exportAs: ["matButton", "matAnchor"]
			},
			{
				kind: "ngmodule",
				type: MatIconModule
			},
			{
				kind: "component",
				type: i2$1.MatIcon,
				selector: "mat-icon",
				inputs: [
					"color",
					"inline",
					"svgIcon",
					"fontSet",
					"fontIcon"
				],
				exportAs: ["matIcon"]
			},
			{
				kind: "ngmodule",
				type: MatProgressBarModule
			},
			{
				kind: "component",
				type: i3.MatProgressBar,
				selector: "mat-progress-bar",
				inputs: [
					"color",
					"value",
					"bufferValue",
					"mode"
				],
				outputs: ["animationEnd"],
				exportAs: ["matProgressBar"]
			}
		],
		encapsulation: i0.ViewEncapsulation.None
	});
};
i0.ɵɵngDeclareClassMetadata({
	minVersion: "12.0.0",
	version: "22.2.1",
	ngImport: i0,
	type: PictureSheet,
	decorators: [{
		type: Component,
		args: [{
			selector: "ui-picture-sheet",
			encapsulation: ViewEncapsulation.None,
			imports: [
				MatButtonModule,
				MatIconModule,
				MatProgressBarModule
			],
			template: "<!-- What it is, cut at the start: the end is what tells pictures apart. -->\n<header class=\"what\">\n  <!-- `<bdi>`, not bare text: the span is `direction: rtl` so the cut falls at the\n       start, and without an isolate the bidi algorithm moves a leading `/` to the\n       other end. -->\n  <span class=\"where\" [title]=\"label\"\n    ><bdi>{{ label }}</bdi></span\n  >\n  <button matIconButton type=\"button\" aria-label=\"close this picture\" (click)=\"close()\">\n    <mat-icon>close</mat-icon>\n  </button>\n</header>\n\n@if (trouble(); as why) {\n  <!-- The app's own sentence, not a broken-image glyph. -->\n  <p class=\"trouble\">\n    <mat-icon>broken_image</mat-icon>\n    {{ why }}\n  </p>\n} @else if (at(); as src) {\n  <!-- A button, so Enter is the same toggle as a tap; the gestures sit on top — see\n       `zoom.ts`. `touch-action: none` in the stylesheet is load-bearing, or the\n       browser keeps the pinch for itself. -->\n  <button\n    class=\"frame\"\n    #frame\n    type=\"button\"\n    [attr.aria-label]=\"closeUp() ? 'show the whole picture' : 'look closer at this picture'\"\n    (pointerdown)=\"took($event)\"\n    (pointermove)=\"drew($event)\"\n    (pointerup)=\"letGo($event)\"\n    (pointercancel)=\"letGo($event)\"\n    (wheel)=\"rolled($event)\"\n    (click)=\"tapped($event)\"\n  >\n    <img\n      #picture\n      [src]=\"src\"\n      [alt]=\"'a picture: ' + label\"\n      [style.transform]=\"drawn()\"\n      (load)=\"measured()\"\n      (error)=\"unloadable()\"\n    />\n  </button>\n} @else {\n  <!-- Bytes on their way, which can take seconds. -->\n  <mat-progress-bar mode=\"indeterminate\" />\n}\n",
			styles: ["ui-picture-sheet{display:flex;flex-direction:column;height:100%;min-height:0}ui-picture-sheet .what{flex:0 0 auto;display:flex;align-items:center;gap:.5rem}ui-picture-sheet .where{font:var(--mat-sys-body-small);color:var(--mat-sys-on-surface-variant);flex:1 1 auto;min-width:0;overflow:hidden;white-space:nowrap;direction:rtl;text-align:left;text-overflow:ellipsis}ui-picture-sheet .trouble{display:flex;align-items:center;gap:.5rem;color:var(--mat-sys-error);margin:1rem 0 0}ui-picture-sheet .frame{flex:1 1 auto;min-height:0;padding:0;border:0;background:none;display:flex;align-items:center;justify-content:center;overflow:hidden;touch-action:none;cursor:grab}ui-picture-sheet .frame:active{cursor:grabbing}ui-picture-sheet .frame img{max-width:100%;max-height:100%;object-fit:contain;transform-origin:center;-webkit-user-select:none;user-select:none;-webkit-user-drag:none}.cdk-overlay-pane.ui-picture-panel{height:100dvh;max-height:100dvh;width:100vw;max-width:100vw}.cdk-overlay-pane.ui-picture-panel .mat-bottom-sheet-container{height:100%;max-height:100%;width:100%;max-width:none;border-radius:0;padding:.5rem .75rem}\n"]
		}]
	}],
	ctorParameters: () => [],
	propDecorators: {
		frame: [{
			type: i0.ViewChild,
			args: ["frame", { isSignal: true }]
		}],
		picture: [{
			type: i0.ViewChild,
			args: ["picture", { isSignal: true }]
		}]
	}
});
var Pictures = class Pictures {
	sheets = inject(Sheets);
	open(picture) {
		this.sheets.open(PictureSheet, {
			data: picture,
			panelClass: "ui-picture-panel"
		});
	}
	static ɵfac = i0.ɵɵngDeclareFactory({
		minVersion: "12.0.0",
		version: "22.2.1",
		ngImport: i0,
		type: Pictures,
		deps: [],
		target: i0.ɵɵFactoryTarget.Injectable
	});
	static ɵprov = i0.ɵɵngDeclareInjectable({
		minVersion: "12.0.0",
		version: "22.2.1",
		ngImport: i0,
		type: Pictures,
		providedIn: "root"
	});
};
i0.ɵɵngDeclareClassMetadata({
	minVersion: "12.0.0",
	version: "22.2.1",
	ngImport: i0,
	type: Pictures,
	decorators: [{
		type: Injectable,
		args: [{ providedIn: "root" }]
	}]
});
const UP = "up";
const TOP = "top";
function declaredUp(data) {
	const up = data["up"];
	if (up !== void 0 && data["top"] === true) throw new Error("a route declares both up and top");
	return up;
}
function resolveUp(declared, params, query) {
	const { path, keep = [], label = "back", opener = false } = typeof declared === "string" ? { path: declared } : declared;
	const filled = path.split("/").map((segment) => {
		if (!segment.startsWith(":")) return segment;
		const value = params[segment.slice(1)];
		if (value === void 0) throw new Error(`up ${path}: the route has no parameter ${segment}`);
		return encodeURIComponent(value);
	}).join("/");
	const carried = {};
	for (const name of keep) {
		const value = query[name];
		if (value !== void 0) carried[name] = value;
	}
	return {
		path: filled,
		query: carried,
		label,
		opener
	};
}
var Place = class Place {
	router = inject(Router);
	up = toSignal(this.router.events.pipe(filter((event) => event instanceof NavigationEnd), map(() => upOf(this.router.routerState.snapshot.root))), { initialValue: upOf(this.router.routerState.snapshot.root) });
	opened = toSignal(this.router.events.pipe(filter((event) => event instanceof NavigationEnd), scan((shown) => shown + 1, this.router.navigated ? 1 : 0), map((shown) => shown > 1)), { initialValue: false });
	title = signal(void 0, ...ngDevMode ? [{ debugName: "title" }] : /* istanbul ignore next */ []);
	actions = signal(void 0, ...ngDevMode ? [{ debugName: "actions" }] : /* istanbul ignore next */ []);
	static ɵfac = i0.ɵɵngDeclareFactory({
		minVersion: "12.0.0",
		version: "22.2.1",
		ngImport: i0,
		type: Place,
		deps: [],
		target: i0.ɵɵFactoryTarget.Injectable
	});
	static ɵprov = i0.ɵɵngDeclareInjectable({
		minVersion: "12.0.0",
		version: "22.2.1",
		ngImport: i0,
		type: Place,
		providedIn: "root"
	});
};
i0.ɵɵngDeclareClassMetadata({
	minVersion: "12.0.0",
	version: "22.2.1",
	ngImport: i0,
	type: Place,
	decorators: [{
		type: Injectable,
		args: [{ providedIn: "root" }]
	}]
});
function upOf(root) {
	let route = root;
	const params = { ...root.params };
	while (route.firstChild) {
		route = route.firstChild;
		Object.assign(params, route.params);
	}
	const declared = declaredUp(route.data);
	return declared === void 0 ? void 0 : resolveUp(declared, params, route.queryParams);
}
function scaffoldTitle(text) {
	const place = inject(Place);
	const mine = signal(void 0, ...ngDevMode ? [{ debugName: "mine" }] : /* istanbul ignore next */ []);
	effect(() => {
		const got = text();
		const title = typeof got === "string" ? { text: got } : got;
		mine.set(title);
		place.title.set(title);
	});
	inject(DestroyRef).onDestroy(() => {
		if (place.title() === mine()) place.title.set(void 0);
	});
}
var ScaffoldActions = class ScaffoldActions {
	place = inject(Place);
	template = inject(TemplateRef);
	ngOnInit() {
		this.place.actions.set(this.template);
	}
	ngOnDestroy() {
		if (this.place.actions() === this.template) this.place.actions.set(void 0);
	}
	static ɵfac = i0.ɵɵngDeclareFactory({
		minVersion: "12.0.0",
		version: "22.2.1",
		ngImport: i0,
		type: ScaffoldActions,
		deps: [],
		target: i0.ɵɵFactoryTarget.Directive
	});
	static ɵdir = i0.ɵɵngDeclareDirective({
		minVersion: "14.0.0",
		version: "22.2.1",
		type: ScaffoldActions,
		isStandalone: true,
		selector: "ng-template[scaffoldActions]",
		ngImport: i0
	});
};
i0.ɵɵngDeclareClassMetadata({
	minVersion: "12.0.0",
	version: "22.2.1",
	ngImport: i0,
	type: ScaffoldActions,
	decorators: [{
		type: Directive,
		args: [{ selector: "ng-template[scaffoldActions]" }]
	}]
});
var Scaffold = class Scaffold {
	place = inject(Place);
	location = inject(Location);
	title = input.required(...ngDevMode ? [{ debugName: "title" }] : /* istanbul ignore next */ []);
	menu = input(...ngDevMode ? [void 0, { debugName: "menu" }] : /* istanbul ignore next */ []);
	menuBadge = input(0, ...ngDevMode ? [{ debugName: "menuBadge" }] : /* istanbul ignore next */ []);
	menuLabel = input("Menu", ...ngDevMode ? [{ debugName: "menuLabel" }] : /* istanbul ignore next */ []);
	static ɵfac = i0.ɵɵngDeclareFactory({
		minVersion: "12.0.0",
		version: "22.2.1",
		ngImport: i0,
		type: Scaffold,
		deps: [],
		target: i0.ɵɵFactoryTarget.Component
	});
	static ɵcmp = i0.ɵɵngDeclareComponent({
		minVersion: "17.0.0",
		version: "22.2.1",
		type: Scaffold,
		isStandalone: true,
		selector: "ui-scaffold",
		inputs: {
			title: {
				classPropertyName: "title",
				publicName: "title",
				isSignal: true,
				isRequired: true,
				transformFunction: null
			},
			menu: {
				classPropertyName: "menu",
				publicName: "menu",
				isSignal: true,
				isRequired: false,
				transformFunction: null
			},
			menuBadge: {
				classPropertyName: "menuBadge",
				publicName: "menuBadge",
				isSignal: true,
				isRequired: false,
				transformFunction: null
			},
			menuLabel: {
				classPropertyName: "menuLabel",
				publicName: "menuLabel",
				isSignal: true,
				isRequired: false,
				transformFunction: null
			}
		},
		ngImport: i0,
		template: "<mat-toolbar>\n  @let up = place.up();\n  <!-- The root first: its leading slot is the navigation menu. -->\n  @if (!up) {\n    @if (menu(); as menu) {\n      <!-- A count of what needs attention behind the menu, hidden at 0; the label\n           says it in words, since a badge is only seen. -->\n      <button\n        matIconButton\n        [matMenuTriggerFor]=\"menu\"\n        [attr.aria-label]=\"menuLabel()\"\n        [matBadge]=\"menuBadge()\"\n        [matBadgeHidden]=\"!menuBadge()\"\n        matBadgeSize=\"small\"\n      >\n        <mat-icon>menu</mat-icon>\n      </button>\n    }\n    <!-- A top-level screen beside the root may name itself; the root is the app. -->\n    <h1 [class.provisional]=\"place.title()?.provisional\">{{ place.title()?.text ?? title() }}</h1>\n  } @else {\n    <!-- A button, not an `a`: the rule that centres a glyph in its circle is\n         `button[matIconButton]`, an element selector. -->\n    @if (up.opener && place.opened()) {\n      <button matIconButton (click)=\"location.back()\" [attr.aria-label]=\"up.label\">\n        <mat-icon>arrow_back</mat-icon>\n      </button>\n    } @else {\n      <button matIconButton [routerLink]=\"up.path\" [queryParams]=\"up.query\" [attr.aria-label]=\"up.label\">\n        <mat-icon>arrow_back</mat-icon>\n      </button>\n    }\n    <h1 [class.provisional]=\"place.title()?.provisional\">{{ place.title()?.text }}</h1>\n  }\n  <span class=\"spacer\"></span>\n  <ng-content />\n  @if (place.actions(); as actions) {\n    <ng-container [ngTemplateOutlet]=\"actions\" />\n  }\n</mat-toolbar>\n",
		styles: [":host{position:sticky;top:0;z-index:2;display:block}mat-toolbar{gap:.5rem}.spacer{flex:1}mat-toolbar>button:first-child{margin-left:-.75rem}h1{margin:0;font:inherit;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}h1.provisional{opacity:.8}\n"],
		dependencies: [
			{
				kind: "directive",
				type: NgTemplateOutlet,
				selector: "[ngTemplateOutlet]",
				inputs: [
					"ngTemplateOutletContext",
					"ngTemplateOutlet",
					"ngTemplateOutletInjector"
				]
			},
			{
				kind: "directive",
				type: RouterLink,
				selector: "[routerLink]",
				inputs: [
					"target",
					"queryParams",
					"fragment",
					"queryParamsHandling",
					"state",
					"info",
					"relativeTo",
					"preserveFragment",
					"skipLocationChange",
					"replaceUrl",
					"browserUrl",
					"routerLink"
				]
			},
			{
				kind: "ngmodule",
				type: MatToolbarModule
			},
			{
				kind: "component",
				type: i1.MatToolbar,
				selector: "mat-toolbar",
				inputs: ["color"],
				exportAs: ["matToolbar"]
			},
			{
				kind: "ngmodule",
				type: MatBadgeModule
			},
			{
				kind: "directive",
				type: i2.MatBadge,
				selector: "[matBadge]",
				inputs: [
					"matBadgeColor",
					"matBadgeOverlap",
					"matBadgeDisabled",
					"matBadgePosition",
					"matBadge",
					"matBadgeDescription",
					"matBadgeSize",
					"matBadgeHidden"
				]
			},
			{
				kind: "ngmodule",
				type: MatButtonModule
			},
			{
				kind: "component",
				type: i1$1.MatIconButton,
				selector: "button[mat-icon-button], a[mat-icon-button], button[matIconButton], a[matIconButton]",
				exportAs: ["matButton", "matAnchor"]
			},
			{
				kind: "ngmodule",
				type: MatIconModule
			},
			{
				kind: "component",
				type: i2$1.MatIcon,
				selector: "mat-icon",
				inputs: [
					"color",
					"inline",
					"svgIcon",
					"fontSet",
					"fontIcon"
				],
				exportAs: ["matIcon"]
			},
			{
				kind: "ngmodule",
				type: MatMenuModule
			},
			{
				kind: "directive",
				type: i5.MatMenuTrigger,
				selector: "[mat-menu-trigger-for], [matMenuTriggerFor]",
				inputs: [
					"mat-menu-trigger-for",
					"matMenuTriggerFor",
					"matMenuTriggerData",
					"matMenuTriggerRestoreFocus"
				],
				outputs: [
					"menuOpened",
					"onMenuOpen",
					"menuClosed",
					"onMenuClose"
				],
				exportAs: ["matMenuTrigger"]
			}
		],
		changeDetection: i0.ChangeDetectionStrategy.OnPush
	});
};
i0.ɵɵngDeclareClassMetadata({
	minVersion: "12.0.0",
	version: "22.2.1",
	ngImport: i0,
	type: Scaffold,
	decorators: [{
		type: Component,
		args: [{
			selector: "ui-scaffold",
			imports: [
				NgTemplateOutlet,
				RouterLink,
				MatToolbarModule,
				MatBadgeModule,
				MatButtonModule,
				MatIconModule,
				MatMenuModule
			],
			changeDetection: ChangeDetectionStrategy.OnPush,
			template: "<mat-toolbar>\n  @let up = place.up();\n  <!-- The root first: its leading slot is the navigation menu. -->\n  @if (!up) {\n    @if (menu(); as menu) {\n      <!-- A count of what needs attention behind the menu, hidden at 0; the label\n           says it in words, since a badge is only seen. -->\n      <button\n        matIconButton\n        [matMenuTriggerFor]=\"menu\"\n        [attr.aria-label]=\"menuLabel()\"\n        [matBadge]=\"menuBadge()\"\n        [matBadgeHidden]=\"!menuBadge()\"\n        matBadgeSize=\"small\"\n      >\n        <mat-icon>menu</mat-icon>\n      </button>\n    }\n    <!-- A top-level screen beside the root may name itself; the root is the app. -->\n    <h1 [class.provisional]=\"place.title()?.provisional\">{{ place.title()?.text ?? title() }}</h1>\n  } @else {\n    <!-- A button, not an `a`: the rule that centres a glyph in its circle is\n         `button[matIconButton]`, an element selector. -->\n    @if (up.opener && place.opened()) {\n      <button matIconButton (click)=\"location.back()\" [attr.aria-label]=\"up.label\">\n        <mat-icon>arrow_back</mat-icon>\n      </button>\n    } @else {\n      <button matIconButton [routerLink]=\"up.path\" [queryParams]=\"up.query\" [attr.aria-label]=\"up.label\">\n        <mat-icon>arrow_back</mat-icon>\n      </button>\n    }\n    <h1 [class.provisional]=\"place.title()?.provisional\">{{ place.title()?.text }}</h1>\n  }\n  <span class=\"spacer\"></span>\n  <ng-content />\n  @if (place.actions(); as actions) {\n    <ng-container [ngTemplateOutlet]=\"actions\" />\n  }\n</mat-toolbar>\n",
			styles: [":host{position:sticky;top:0;z-index:2;display:block}mat-toolbar{gap:.5rem}.spacer{flex:1}mat-toolbar>button:first-child{margin-left:-.75rem}h1{margin:0;font:inherit;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}h1.provisional{opacity:.8}\n"]
		}]
	}],
	propDecorators: {
		title: [{
			type: i0.Input,
			args: [{
				isSignal: true,
				alias: "title",
				required: true
			}]
		}],
		menu: [{
			type: i0.Input,
			args: [{
				isSignal: true,
				alias: "menu",
				required: false
			}]
		}],
		menuBadge: [{
			type: i0.Input,
			args: [{
				isSignal: true,
				alias: "menuBadge",
				required: false
			}]
		}],
		menuLabel: [{
			type: i0.Input,
			args: [{
				isSignal: true,
				alias: "menuLabel",
				required: false
			}]
		}]
	}
});
export { Dialogs, PictureSheet, Pictures, Place, Scaffold, ScaffoldActions, Sheets, TOP, UP, declaredUp, resolveUp, scaffoldTitle, wireBack };

//# sourceMappingURL=xinutec-ui-scaffold.mjs.map