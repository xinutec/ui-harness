import { readFile, stat } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { extname, join, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { HarnessSpec } from "./config.js";
import { portFor } from "./config.js";

/**
 * The fleet's static server for a production Angular bundle, under the
 * Playwright phone-width harness.
 *
 * There used to be eleven of these, one per frontend, each copied from a
 * sibling and each carrying its own copy of the port. Three of the eleven were
 * serving on the port of the app they had been copied FROM, because Playwright
 * always passes the port explicitly and so nothing ever exercised the fallback
 * — until someone ran the server by hand to look at a build, at which point it
 * squatted on a sibling's port and that sibling's next suite attached to it.
 *
 * Serving the BUILT bundle rather than `ng serve` is deliberate twice over: the
 * service worker only ships in `ng build`, and spawning the Angular CLI dev
 * server trips the macOS kqueue.c:279 abort.
 */

const TYPES: Record<string, string> = {
	".html": "text/html; charset=utf-8",
	// ngsw-worker.js and ngsw.json must arrive as JS/JSON or the service worker
	// silently declines to register, and every offline spec fails somewhere far
	// from the cause.
	".js": "text/javascript; charset=utf-8",
	".mjs": "text/javascript; charset=utf-8",
	".json": "application/json; charset=utf-8",
	".css": "text/css; charset=utf-8",
	".webmanifest": "application/manifest+json; charset=utf-8",
	".ico": "image/x-icon",
	".png": "image/png",
	".svg": "image/svg+xml",
	".woff2": "font/woff2",
	".woff": "font/woff",
};

/** Where this app's built bundle is, honouring its scratch-build env var. */
function rootOf(spec: HarnessSpec, cwd: string): string {
	const override = spec.distEnv ? process.env[spec.distEnv] : undefined;
	return resolve(cwd, override && override.length > 0 ? override : spec.dist);
}

/**
 * The file to answer with, or the SPA fallback.
 *
 * Contained by construction: the resolved path must sit under the bundle, so a
 * traversal in the URL cannot reach a source tree that happens to be one level
 * up. The old per-app servers stripped leading `../` with a regex, which is a
 * filter rather than a boundary.
 */
async function fileFor(root: string, urlPath: string): Promise<string> {
	const index = join(root, "index.html");
	let decoded: string;
	try {
		decoded = decodeURIComponent(urlPath.split("?")[0] ?? "/");
	} catch {
		return index; // a malformed escape is not a path
	}
	const candidate = resolve(root, `.${decoded.startsWith("/") ? "" : "/"}${decoded}`);
	if (candidate !== root && !candidate.startsWith(root + sep)) return index;
	try {
		if ((await stat(candidate)).isFile()) return candidate;
	} catch {
		/* fall through to the SPA fallback */
	}
	return index;
}

/**
 * Serve `spec` on `port`. Ports come from the allocation in ./config.ts; this
 * takes one explicitly so the package's own tests can bind an ephemeral port
 * (0) without claiming a real app's number.
 */
export function startServer(spec: HarnessSpec, port: number): Promise<Server> {
	const root = rootOf(spec, process.cwd());
	const types = { ...TYPES, ...(spec.types ?? {}) };
	const api = spec.api ?? {};

	const server = createServer(async (req, res) => {
		const url = req.url ?? "/";
		const path = url.split("?")[0] ?? "/";
		if (path.startsWith("/api/")) {
			res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
			res.end(JSON.stringify(path in api ? api[path] : []));
			return;
		}
		const file = await fileFor(root, url);
		try {
			const body = await readFile(file);
			res.writeHead(200, {
				"content-type": types[extname(file)] ?? "application/octet-stream",
			});
			res.end(body);
		} catch {
			res.writeHead(404).end("not found");
		}
	});

	return new Promise((ok, fail) => {
		server.once("error", fail);
		server.listen(port, () => {
			const bound = server.address();
			const at = typeof bound === "object" && bound ? bound.port : port;
			console.log(`serving ${root} on http://localhost:${at}`);
			ok(server);
		});
	});
}

/** Serve `spec` on the port its app was allocated. */
export function serve(spec: HarnessSpec): Promise<Server> {
	return startServer(spec, portFor(spec.app));
}

/**
 * Run directly (`node .../dist/serve.js`, which is what the generated
 * `webServer.command` does) — read the app's spec from `e2e/harness.mjs` in the
 * working directory and serve it. No arguments: the app name is in the spec and
 * the port follows from it, so there is no number to pass and none to get wrong.
 */
/**
 * The one sentence to print for a caught `unknown`. A failed dynamic import
 * usually throws an `Error` whose `message` is the whole story ("Cannot find
 * module …", or the spec's own syntax error), and whose stack is all node
 * internals — so `message` is what's worth showing. `String(err)` is not the
 * shortcut it looks like: anything thrown that isn't an `Error` renders as
 * "[object Object]", which is exactly the case where you most need to be told
 * what happened.
 */
export function explain(err: unknown): string {
	if (err instanceof Error) {
		const cause = err.cause instanceof Error ? ` (${err.cause.message})` : "";
		return err.message + cause;
	}
	if (typeof err === "string") return err;
	return JSON.stringify(err) ?? "an unprintable value was thrown";
}

async function main(): Promise<void> {
	const specPath = join(process.cwd(), "e2e", "harness.mjs");
	let mod: { default?: HarnessSpec };
	try {
		mod = (await import(pathToFileURL(specPath).href)) as { default?: HarnessSpec };
	} catch (err) {
		console.error(
			`ui-harness: could not load ${specPath}\n` +
				"Run this from the frontend directory; the app's harness spec lives there.\n" +
				explain(err),
		);
		process.exit(2);
	}
	if (!mod.default) {
		console.error(`ui-harness: ${specPath} has no default export (the HarnessSpec)`);
		process.exit(2);
	}
	await serve(mod.default);
}

const invoked = process.argv[1];
if (invoked && resolve(invoked) === fileURLToPath(import.meta.url)) {
	await main();
}
