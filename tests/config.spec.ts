import { devices, expect, test } from '@playwright/test';
import { phoneConfig, portFor } from '../src/config';

/**
 * The allocation and the config it produces.
 *
 * These exist because the two things they assert were, for months, enforced by
 * fleet-wide lint rules reading eleven hand-written configs: no two apps on one
 * port, and the phone viewport in the PROJECT `use`. Moving them here is the
 * point of the package — one place to get right, checked where it is written.
 */

const spec = { app: 'life', dist: 'dist/life-web/browser' } as const;

test('every app gets its own port', () => {
  // Not "no duplicates were found" — the allocation is an index, so this is a
  // check that the list has no duplicate NAME, which is the only way two apps
  // could still land on one number.
  const names = ['life', 'messages', 'health', 'home', 'memview', 'coach',
    'fleetwatch', 'observe', 'gamepads', 'utterance', 'recall', 'thoth'];
  const ports = names.map(portFor);
  expect(new Set(ports).size).toBe(names.length);
  expect(new Set(names).size).toBe(names.length);
});

test('an app the table does not name has no port', () => {
  // The failure that matters is a NEW app quietly picking a number. It cannot:
  // there is nowhere to pick from, and the error says where to add it.
  expect(() => portFor('newapp')).toThrow(/unknown app "newapp"/);
});

test('the ports are clear of the ones the fleet used before the table', () => {
  // A half-converged fleet must not be able to produce the collision the table
  // replaces: during the sweep an unported app still binds its old number.
  const old = [4271, 4272, 4273, 4274, 4275, 4281, 4282, 4283, 4291, 4292, 4293, 4319];
  for (const app of ['life', 'thoth']) expect(old).not.toContain(portFor(app));
  expect(portFor('thoth') - portFor('life')).toBe(11);
});

test('the phone viewport lands in the project use, not the global one', () => {
  // A device spread carries its own viewport and project-level `use` overrides
  // global — putting it globally is how a "phone width" suite silently ran at
  // 1280×720. The one thing this config exists to get right.
  const cfg = phoneConfig(spec, devices);
  const project = cfg.projects?.[0];
  expect(project?.use?.viewport?.width).toBe(412);
  expect(project?.use?.isMobile).toBe(true);
  expect(project?.use?.deviceScaleFactor).toBe(1);
  expect(cfg.use?.viewport).toBeUndefined();
});

test('the suite and the server are told the same port', () => {
  const cfg = phoneConfig(spec, devices);
  const port = portFor('life');
  expect(cfg.use?.baseURL).toBe(`http://localhost:${port}`);
  expect(cfg.webServer).toMatchObject({ url: `http://localhost:${port}/` });
});

test('the generated server command carries no port to disagree about', () => {
  const cfg = phoneConfig(spec, devices);
  const command = (cfg.webServer as { command: string }).command;
  expect(command).not.toMatch(/\d{4}/);
  expect(command).toMatch(/serve\.js/);
});

test('a device table without the phone preset is refused, not silently desktop', () => {
  expect(() => phoneConfig(spec, {})).toThrow(/no 'Pixel 7' device preset/);
});

test('an app that serves itself still gets the allocated port', () => {
  // thoth's Swift binary is the thing under test, so it serves its own bundle —
  // but it does not get to choose where.
  const cfg = phoneConfig(
    { app: 'thoth', dist: 'dist/thoth-web/browser', server: { command: (p) => `serve ${p}`, cwd: '..', host: '127.0.0.1', reuseExistingServer: false } },
    devices,
  );
  const port = portFor('thoth');
  expect(cfg.webServer).toMatchObject({
    command: `serve ${port}`,
    cwd: '..',
    url: `http://127.0.0.1:${port}/`,
    reuseExistingServer: false,
  });
  expect(cfg.use?.baseURL).toBe(`http://127.0.0.1:${port}`);
});

test('goldens are opt-in and identical wherever they are on', () => {
  expect(phoneConfig(spec, devices).snapshotPathTemplate).toBeUndefined();
  const cfg = phoneConfig(spec, devices, { goldens: true });
  expect(cfg.snapshotPathTemplate).toBe('e2e/__screenshots__/{arg}{ext}');
  expect(cfg.expect?.toHaveScreenshot).toMatchObject({ maxDiffPixelRatio: 0.01 });
});
