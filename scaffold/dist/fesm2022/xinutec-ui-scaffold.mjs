import { Location, NgTemplateOutlet } from "@angular/common";
import * as i0 from "@angular/core";
import { ChangeDetectionStrategy, Component, DestroyRef, Directive, Injectable, TemplateRef, effect, inject, input, signal } from "@angular/core";
import { MatBottomSheet } from "@angular/material/bottom-sheet";
import { MatDialog } from "@angular/material/dialog";
import { toSignal } from "@angular/core/rxjs-interop";
import { NavigationEnd, Router, RouterLink } from "@angular/router";
import { filter, map } from "rxjs";
import * as i2 from "@angular/material/button";
import { MatButtonModule } from "@angular/material/button";
import * as i3 from "@angular/material/icon";
import { MatIconModule } from "@angular/material/icon";
import * as i4 from "@angular/material/menu";
import { MatMenuModule } from "@angular/material/menu";
import * as i1 from "@angular/material/toolbar";
import { MatToolbarModule } from "@angular/material/toolbar";
function wireBack(history, closed) {
	history.go(history.path(true), "", { overlay: true });
	closed.subscribe(() => {
		const state = history.getState();
		if (typeof state === "object" && state !== null && "overlay" in state) history.back();
	});
}
var Sheets = class Sheets {
	sheet = inject(MatBottomSheet);
	location = inject(Location);
	open(component, config) {
		const ref = this.sheet.open(component, config);
		wireBack(this.location, ref.afterDismissed());
		return ref;
	}
	static ɵfac = i0.ɵɵngDeclareFactory({
		minVersion: "12.0.0",
		version: "22.2.0",
		ngImport: i0,
		type: Sheets,
		deps: [],
		target: i0.ɵɵFactoryTarget.Injectable
	});
	static ɵprov = i0.ɵɵngDeclareInjectable({
		minVersion: "12.0.0",
		version: "22.2.0",
		ngImport: i0,
		type: Sheets,
		providedIn: "root"
	});
};
i0.ɵɵngDeclareClassMetadata({
	minVersion: "12.0.0",
	version: "22.2.0",
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
		version: "22.2.0",
		ngImport: i0,
		type: Dialogs,
		deps: [],
		target: i0.ɵɵFactoryTarget.Injectable
	});
	static ɵprov = i0.ɵɵngDeclareInjectable({
		minVersion: "12.0.0",
		version: "22.2.0",
		ngImport: i0,
		type: Dialogs,
		providedIn: "root"
	});
};
i0.ɵɵngDeclareClassMetadata({
	minVersion: "12.0.0",
	version: "22.2.0",
	ngImport: i0,
	type: Dialogs,
	decorators: [{
		type: Injectable,
		args: [{ providedIn: "root" }]
	}]
});
const UP = "up";
function resolveUp(declared, params, query) {
	const { path, keep = [], label = "back" } = typeof declared === "string" ? { path: declared } : declared;
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
		label
	};
}
var Place = class Place {
	router = inject(Router);
	up = toSignal(this.router.events.pipe(filter((event) => event instanceof NavigationEnd), map(() => upOf(this.router.routerState.snapshot.root))), { initialValue: upOf(this.router.routerState.snapshot.root) });
	title = signal(void 0, ...ngDevMode ? [{ debugName: "title" }] : /* istanbul ignore next */ []);
	actions = signal(void 0, ...ngDevMode ? [{ debugName: "actions" }] : /* istanbul ignore next */ []);
	static ɵfac = i0.ɵɵngDeclareFactory({
		minVersion: "12.0.0",
		version: "22.2.0",
		ngImport: i0,
		type: Place,
		deps: [],
		target: i0.ɵɵFactoryTarget.Injectable
	});
	static ɵprov = i0.ɵɵngDeclareInjectable({
		minVersion: "12.0.0",
		version: "22.2.0",
		ngImport: i0,
		type: Place,
		providedIn: "root"
	});
};
i0.ɵɵngDeclareClassMetadata({
	minVersion: "12.0.0",
	version: "22.2.0",
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
	const declared = route.data["up"];
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
		version: "22.2.0",
		ngImport: i0,
		type: ScaffoldActions,
		deps: [],
		target: i0.ɵɵFactoryTarget.Directive
	});
	static ɵdir = i0.ɵɵngDeclareDirective({
		minVersion: "14.0.0",
		version: "22.2.0",
		type: ScaffoldActions,
		isStandalone: true,
		selector: "ng-template[scaffoldActions]",
		ngImport: i0
	});
};
i0.ɵɵngDeclareClassMetadata({
	minVersion: "12.0.0",
	version: "22.2.0",
	ngImport: i0,
	type: ScaffoldActions,
	decorators: [{
		type: Directive,
		args: [{ selector: "ng-template[scaffoldActions]" }]
	}]
});
var Scaffold = class Scaffold {
	place = inject(Place);
	title = input.required(...ngDevMode ? [{ debugName: "title" }] : /* istanbul ignore next */ []);
	menu = input(...ngDevMode ? [void 0, { debugName: "menu" }] : /* istanbul ignore next */ []);
	static ɵfac = i0.ɵɵngDeclareFactory({
		minVersion: "12.0.0",
		version: "22.2.0",
		ngImport: i0,
		type: Scaffold,
		deps: [],
		target: i0.ɵɵFactoryTarget.Component
	});
	static ɵcmp = i0.ɵɵngDeclareComponent({
		minVersion: "17.0.0",
		version: "22.2.0",
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
			}
		},
		ngImport: i0,
		template: "<mat-toolbar>\n  @let up = place.up();\n  <!-- The root first: its leading slot is the navigation menu. -->\n  @if (!up) {\n    @if (menu(); as menu) {\n      <button matIconButton [matMenuTriggerFor]=\"menu\" aria-label=\"Menu\">\n        <mat-icon>menu</mat-icon>\n      </button>\n    }\n    <h1>{{ title() }}</h1>\n  } @else {\n    <!-- A button, not an `a`: the rule that centres a glyph in its circle is\n         `button[matIconButton]`, an element selector. -->\n    <button matIconButton [routerLink]=\"up.path\" [queryParams]=\"up.query\" [attr.aria-label]=\"up.label\">\n      <mat-icon>arrow_back</mat-icon>\n    </button>\n    <h1 [class.provisional]=\"place.title()?.provisional\">{{ place.title()?.text }}</h1>\n  }\n  <span class=\"spacer\"></span>\n  <ng-content />\n  @if (place.actions(); as actions) {\n    <ng-container [ngTemplateOutlet]=\"actions\" />\n  }\n</mat-toolbar>\n",
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
				type: MatButtonModule
			},
			{
				kind: "component",
				type: i2.MatIconButton,
				selector: "button[mat-icon-button], a[mat-icon-button], button[matIconButton], a[matIconButton]",
				exportAs: ["matButton", "matAnchor"]
			},
			{
				kind: "ngmodule",
				type: MatIconModule
			},
			{
				kind: "component",
				type: i3.MatIcon,
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
				type: i4.MatMenuTrigger,
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
	version: "22.2.0",
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
				MatButtonModule,
				MatIconModule,
				MatMenuModule
			],
			changeDetection: ChangeDetectionStrategy.OnPush,
			template: "<mat-toolbar>\n  @let up = place.up();\n  <!-- The root first: its leading slot is the navigation menu. -->\n  @if (!up) {\n    @if (menu(); as menu) {\n      <button matIconButton [matMenuTriggerFor]=\"menu\" aria-label=\"Menu\">\n        <mat-icon>menu</mat-icon>\n      </button>\n    }\n    <h1>{{ title() }}</h1>\n  } @else {\n    <!-- A button, not an `a`: the rule that centres a glyph in its circle is\n         `button[matIconButton]`, an element selector. -->\n    <button matIconButton [routerLink]=\"up.path\" [queryParams]=\"up.query\" [attr.aria-label]=\"up.label\">\n      <mat-icon>arrow_back</mat-icon>\n    </button>\n    <h1 [class.provisional]=\"place.title()?.provisional\">{{ place.title()?.text }}</h1>\n  }\n  <span class=\"spacer\"></span>\n  <ng-content />\n  @if (place.actions(); as actions) {\n    <ng-container [ngTemplateOutlet]=\"actions\" />\n  }\n</mat-toolbar>\n",
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
		}]
	}
});
export { Dialogs, Place, Scaffold, ScaffoldActions, Sheets, UP, resolveUp, scaffoldTitle, wireBack };

//# sourceMappingURL=xinutec-ui-scaffold.mjs.map