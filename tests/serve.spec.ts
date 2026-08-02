import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import type { Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { explain, startServer } from '../src/serve';

/**
 * The static server, against a real bundle-shaped directory.
 *
 * It is worth testing rather than eyeballing because it is now the ONLY one:
 * eleven copies collapsed into this, so a content type it gets wrong is wrong
 * for every frontend at once. Each case below is something one of those copies
 * was carrying a comment about.
 */

let dir: string;
let server: Server;
let origin: string;

test.beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'ui-harness-serve-'));
  // A secret one level ABOVE the bundle — the thing a traversal would reach.
  await writeFile(join(dir, 'outside.txt'), 'not yours');
  const root = join(dir, 'browser');
  await mkdir(join(root, 'media'), { recursive: true });
  await writeFile(join(root, 'index.html'), '<!doctype html><title>app</title>');
  await writeFile(join(root, 'main.js'), 'console.log(1)');
  await writeFile(join(root, 'ngsw.json'), '{"index":"/index.html"}');
  await writeFile(join(root, 'ngsw-worker.js'), '// sw');
  await writeFile(join(root, 'media', 'icons.woff2'), 'font');

  server = await startServer(
    { app: 'life', dist: root, api: { '/api/me': { userId: 'test' } } },
    0,
  );
  const bound = server.address();
  const port = typeof bound === 'object' && bound ? bound.port : 0;
  origin = `http://localhost:${port}`;
});

test.afterAll(async () => {
  await new Promise<void>((ok) => server.close(() => ok()));
});

test('serves the bundle with the types the service worker needs', async () => {
  // ngsw-worker.js / ngsw.json arriving as octet-stream is how a service worker
  // silently declines to register, and then every offline spec fails somewhere
  // far from the cause.
  for (const [path, type] of [
    ['/index.html', 'text/html; charset=utf-8'],
    ['/main.js', 'text/javascript; charset=utf-8'],
    ['/ngsw-worker.js', 'text/javascript; charset=utf-8'],
    ['/ngsw.json', 'application/json; charset=utf-8'],
    ['/media/icons.woff2', 'font/woff2'],
  ]) {
    const res = await fetch(`${origin}${path}`);
    expect(res.status, path).toBe(200);
    expect(res.headers.get('content-type'), path).toBe(type);
  }
});

test('an unknown path is the SPA, not a 404', async () => {
  // Angular routing means /settings is a real screen with no file behind it.
  const res = await fetch(`${origin}/settings/notifications`);
  expect(res.status).toBe(200);
  expect(await res.text()).toContain('<title>app</title>');
});

test('a query string does not become part of the filename', async () => {
  const res = await fetch(`${origin}/main.js?v=abc123`);
  expect(res.headers.get('content-type')).toBe('text/javascript; charset=utf-8');
  expect(await res.text()).toBe('console.log(1)');
});

test('nothing above the bundle is reachable', async () => {
  // Containment by boundary, not by stripping leading `../` — including the
  // encoded form, which survives a regex written against the literal one.
  for (const path of ['/../outside.txt', '/%2e%2e/outside.txt', '/a/../../outside.txt']) {
    const res = await fetch(`${origin}${path}`);
    expect(await res.text(), path).not.toContain('not yours');
  }
});

test('a listed API path answers its stub and the rest answer empty', async () => {
  // The specs page.route everything that matters; this only keeps an un-mocked
  // run inside the app shell instead of on an error screen.
  expect(await (await fetch(`${origin}/api/me`)).json()).toEqual({ userId: 'test' });
  expect(await (await fetch(`${origin}/api/anything`)).json()).toEqual([]);
});

test('a bundle that has not been built yet 404s rather than serving nothing', async () => {
  const missing = await startServer({ app: 'life', dist: join(dir, 'nope') }, 0);
  const bound = missing.address();
  const port = typeof bound === 'object' && bound ? bound.port : 0;
  const res = await fetch(`http://localhost:${port}/`);
  expect(res.status).toBe(404);
  await new Promise<void>((ok) => missing.close(() => ok()));
});

/**
 * `explain` — the sentence printed when the harness spec won't load. It exists
 * because `String(err)` renders every non-`Error` throw as "[object Object]",
 * which is the one moment a person needs to be told what actually went wrong.
 */

test('a failed import reports its message, not its stack of node internals', () => {
  const err = new Error("Cannot find module '/app/e2e/harness.mjs'");
  expect(explain(err)).toBe("Cannot find module '/app/e2e/harness.mjs'");
});

test('the cause carries the real reason and is kept', () => {
  const err = new Error('Failed to load spec', { cause: new Error('Unexpected token }') });
  expect(explain(err)).toBe('Failed to load spec (Unexpected token })');
});

test('a thrown object says what it is instead of [object Object]', () => {
  // `String(...)` on this same value is "[object Object]" — the whole reason the
  // helper exists. Not asserted here because biome's noBaseToString rejects
  // writing it, which is the rule agreeing with the premise.
  expect(explain({ code: 'ERR_MODULE_NOT_FOUND' })).toBe('{"code":"ERR_MODULE_NOT_FOUND"}');
});

test('a thrown string is already the sentence', () => {
  expect(explain('no spec here')).toBe('no spec here');
});

test('an unserialisable throw still prints something', () => {
  expect(explain(undefined)).toBe('an unprintable value was thrown');
  expect(explain(() => 1)).toBe('an unprintable value was thrown');
});
