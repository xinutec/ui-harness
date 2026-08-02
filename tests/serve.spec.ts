import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import type { Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { startServer } from '../src/serve';

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
