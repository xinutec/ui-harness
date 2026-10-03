import { Location, NgTemplateOutlet } from "@angular/common";
import * as i0 from "@angular/core";
import { ChangeDetectionStrategy, Component, DestroyRef, Directive, Injectable, TemplateRef, effect, inject, input, signal } from "@angular/core";
import { MatBottomSheet } from "@angular/material/bottom-sheet";
import { MatDialog } from "@angular/material/dialog";
import { NavigationEnd, Router, RouterLink } from "@angular/router";
import { toSignal } from "@angular/core/rxjs-interop";
import { filter, map, scan } from "rxjs";
import * as i2 from "@angular/material/badge";
import { MatBadgeModule } from "@angular/material/badge";
import * as i3 from "@angular/material/button";
import { MatButtonModule } from "@angular/material/button";
import * as i4 from "@angular/material/icon";
import { MatIconModule } from "@angular/material/icon";
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
				type: i3.MatIconButton,
				selector: "button[mat-icon-button], a[mat-icon-button], button[matIconButton], a[matIconButton]",
				exportAs: ["matButton", "matAnchor"]
			},
			{
				kind: "ngmodule",
				type: MatIconModule
			},
			{
				kind: "component",
				type: i4.MatIcon,
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
export { Dialogs, Place, Scaffold, ScaffoldActions, Sheets, TOP, UP, declaredUp, resolveUp, scaffoldTitle, wireBack };

//# sourceMappingURL=xinutec-ui-scaffold.mjs.map