import { fileURLToPath } from "node:url";
// TYPE-ONLY import, same rule as src/ui-harness.ts: this module must not pull a
// second @playwright/test into the process. `defineConfig` is an identity
// function for typing, so a plain object is returned and the app wraps it.
import type { PlaywrightTestConfig } from "@playwright/test";

/**
 * The harness's own half of each app's Playwright setup — the parts that were
 * previously copied file-by-file between frontends and drifted.
 *
 * The thing being modelled is a PORT ALLOCATION. Every harness in the fleet
 * sets `reuseExistingServer: true`, which is right for iteration (start the
 * server yourself and the suite attaches) but trusts the port, not the app: two
 * frontends on one number means the second suite silently runs its specs
 * against the FIRST app's DOM. That happened twice — recall/utterance on 4293,
 * health/memview on 4273 — and read as flakiness, because in isolation every
 * suite passes in three seconds.
 *
 * Both times the number had been picked by hand, from a copied file, with
 * nothing to consult. So the number is not something an app says any more. It
 * asks by name, and the answer is an index into `APPS` — which is why a
 * collision is not detected here but UNREPRESENTABLE: two entries cannot share
 * an index. What remains representable is a duplicate app NAME, and that is a
 * mistake you can see while making it.
 */
const APPS = [
	"life",
	"messages",
	"health",
	"home",
	"memview",
	"coach",
	"fleetwatch",
	"observe",
	"gamepads",
	"utterance",
	"recall",
	"thoth",
	// memview's console — a second app in that repo, and a separate entry
	// because it is a separate bundle on a separate port.
	"console",
	"tasks",
] as const;

export type AppName = (typeof APPS)[number];

/**
 * Deliberately disjoint from every port the fleet used before this table
 * existed (4271–4293, 4319), so that a half-converged fleet cannot produce the
 * very collision this replaces: during the sweep, a ported app and an unported
 * one must not be able to meet. Also clear of 4200 (`ng serve`) and 4280
 * (life's scene server).
 */
const BASE = 4301;

/** The port `app`'s harness serves and talks to. */
export function portFor(app: string): number {
	const i = (APPS as readonly string[]).indexOf(app);
	if (i < 0) {
		throw new Error(
			`ui-harness: unknown app "${app}". Add it to APPS in ` +
				`@xinutec/ui-harness/config — that list IS the port allocation, so an ` +
				`app it does not name has no port to serve on.`,
		);
	}
	return BASE + i;
}

/** Playwright's device descriptors, structurally — see `phoneConfig`. */
export interface DeviceDescriptor {
	viewport: { width: number; height: number };
	userAgent: string;
	deviceScaleFactor: number;
	isMobile: boolean;
	hasTouch: boolean;
	defaultBrowserType: "chromium" | "firefox" | "webkit";
}

/**
 * An app that serves its own bundle rather than using the harness's static
 * server — thoth, whose Swift binary is the thing under test.
 */
export interface OwnServer {
	/** Given the allocated port, the command that serves the built bundle. */
	command: (port: number) => string;
	/** Working directory for that command, relative to the frontend dir. */
	cwd?: string;
	/** Host to talk to. Defaults to `localhost`. */
	host?: string;
	/** Defaults to true, like the rest of the fleet. */
	reuseExistingServer?: boolean;
}

/**
 * Everything app-specific the phone-width harness needs.
 *
 * Lives in `frontend/e2e/harness.mjs`, imported by BOTH playwright.config.ts
 * and the static server, so the config and the server cannot disagree about
 * which bundle is being served or on which port. It is plain `.mjs` rather than
 * `.ts` because the server is a bare `node` process with no transpiler; the
 * JSDoc `@type` annotation gives it the same checking in an editor.
 */
export interface HarnessSpec {
	app: AppName;
	/** The built bundle to serve, relative to the frontend directory. */
	dist: string;
	/** Env var that, when set, names a different bundle (recall's scratch build). */
	distEnv?: string;
	/**
	 * Answers for `/api/` paths the specs leave unrouted. The specs `page.route`
	 * everything that matters; this only keeps an un-mocked run from falling out
	 * of the app shell. A path that is not listed answers `[]`.
	 */
	api?: Record<string, unknown>;
	/** Content types beyond the default set, by extension (`".woff"`). */
	types?: Record<string, string>;
	/** Set when the app serves its own bundle. */
	server?: OwnServer;
}

export interface HarnessOptions {
	/** Restrict the run to some of `e2e/` (apps that keep behavioural specs). */
	testMatch?: PlaywrightTestConfig["testMatch"];
	/** Per-test budget. Defaults to 90s — a cold SW registration is slow. */
	timeout?: number;
	/**
	 * Committed screenshot baselines. One per name, with no
	 * `{projectName}/{platform}` suffix: these only ever run on one machine (a
	 * dev's Mac — CI runs unit tests only, never Playwright).
	 */
	goldens?: boolean;
}

/** The static server that serves `spec.dist`, as an absolute path. */
const SERVE = fileURLToPath(new URL("./serve.js", import.meta.url));

/**
 * The fleet's phone-width Playwright config for one app.
 *
 * `devices` is passed IN rather than imported here, for two reasons. It keeps
 * this module free of a runtime `@playwright/test` (see the import note above),
 * and it means the app hands over its device table without getting to choose
 * from it — an app cannot spread `devices['Desktop Chrome']` into a "phone
 * width" suite, which is exactly how life's harness silently ran at 1280×720
 * for months. For the same reason `HarnessOptions` has no `use` or `projects`:
 * overriding those is the failure, so it is a type error rather than a
 * convention.
 */
export function phoneConfig(
	spec: HarnessSpec,
	devices: Record<string, DeviceDescriptor>,
	options: HarnessOptions = {},
): PlaywrightTestConfig {
	const port = portFor(spec.app);
	const host = spec.server?.host ?? "localhost";
	const origin = `http://${host}:${port}`;

	const phone = devices["Pixel 7"];
	if (!phone) {
		throw new Error(
			"ui-harness: this Playwright has no 'Pixel 7' device preset — pass the " +
				"real `devices` export from the app's own @playwright/test.",
		);
	}

	return {
		testDir: "./e2e",
		reporter: [["list"]],
		timeout: options.timeout ?? 90_000,
		...(options.testMatch === undefined ? {} : { testMatch: options.testMatch }),
		...(options.goldens
			? {
					snapshotPathTemplate: "e2e/__screenshots__/{arg}{ext}",
					expect: {
						toHaveScreenshot: {
							// A hair of tolerance for sub-pixel antialiasing seams; a real
							// visual change moves far more than 1% of the pixels.
							maxDiffPixelRatio: 0.01,
							animations: "disabled" as const,
							caret: "hide" as const,
						},
					},
				}
			: {}),
		use: {
			baseURL: origin,
			screenshot: "only-on-failure",
		},
		// Pixel 9 ≈ the Pixel 7 preset: 412 CSS px wide, mobile UA, touch. The
		// viewport MUST live in the PROJECT `use`, not the global one — a device
		// spread carries its own viewport and project-level `use` overrides
		// global. deviceScaleFactor is forced to 1 so CSS-pixel geometry (what the
		// layout checks measure) is DPR-invariant and goldens stay small.
		projects: [{ name: "chromium", use: { ...phone, deviceScaleFactor: 1 } }],
		webServer: {
			command: spec.server
				? spec.server.command(port)
				: `node ${JSON.stringify(SERVE)}`,
			...(spec.server?.cwd === undefined ? {} : { cwd: spec.server.cwd }),
			url: `${origin}/`,
			// Attach to a server you started yourself if one is up — handy on
			// macOS, where spawning extra node processes can trip a libuv/kqueue
			// crash. Safe now that no two apps can share a port.
			reuseExistingServer: spec.server?.reuseExistingServer ?? true,
			timeout: 60_000,
		},
	};
}
