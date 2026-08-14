import { describe, expect, it } from 'vitest';

import { allowBoth, foreignChanges, rewriteAllowBuilds } from './bump-consumers.ts';

/**
 * The half of a bump that used to be left behind.
 *
 * `pnpm-workspace.yaml` grants the harness permission to run its `prepare`, and
 * pnpm keys that grant by the FULL resolved spec — commit and all. A bump that
 * moved only the manifest left the grant naming a commit nobody installs, and
 * the next cold-store install failed with ERR_PNPM_GIT_DEP_PREPARE_NOT_ALLOWED.
 * A local install does not fail, which is why this wants a test rather than a
 * careful reader: the machine-wide store already holds the harness built by a
 * sibling repo, so nothing needs running and the mistake passes.
 */

const OLD = '581d277a5e74657b0ed5d353bfc6c900300a27e9';
const NEW = '8d8340ff672392ac472c1fb16e0d8fdfecbd710d';
const URL_ = 'https://codeload.github.com/xinutec/ui-harness/tar.gz/';

const file = (entries: string): string =>
  `# a comment about builds\nallowBuilds:\n  esbuild: true\n${entries}\noverrides:\n  esbuild: ^0.28.1\n`;

describe('rewriteAllowBuilds', () => {
  it('moves the key onto the new commit', () => {
    const out = rewriteAllowBuilds(file(`  "@xinutec/ui-harness@${URL_}${OLD}": true`), NEW);
    expect(out).toBe(file(`  "@xinutec/ui-harness@${URL_}${NEW}": true`));
  });

  it('keeps the quote style the file was written in', () => {
    // The fleet writes this line by hand and both styles are in use; rewriting
    // one into the other is a diff that says nothing.
    const out = rewriteAllowBuilds(file(`  '@xinutec/ui-harness@${URL_}${OLD}': true`), NEW);
    expect(out).toBe(file(`  '@xinutec/ui-harness@${URL_}${NEW}': true`));
  });

  it('collapses the residue of an earlier half-done bump', () => {
    // What memview and health were actually carrying: the old key plus the
    // placeholder pnpm writes when it meets a spec nobody approved. Only one
    // commit is pinned, so only one key can be current.
    const out = rewriteAllowBuilds(
      file(
        `  '@xinutec/ui-harness@${URL_}${OLD}': true\n` +
          `  '@xinutec/ui-harness@${URL_}36b57a265ef372a096d1413e90f2c0bd5cb31bd5': set this to true or false`,
      ),
      NEW,
    );
    expect(out).toBe(file(`  '@xinutec/ui-harness@${URL_}${NEW}': true`));
  });

  it('turns a placeholder into a real permission', () => {
    // `set this to true or false` is not `true`, so the install still refuses.
    const out = rewriteAllowBuilds(
      file(`  "@xinutec/ui-harness@${URL_}${OLD}": set this to true or false`),
      NEW,
    );
    expect(out).toBe(file(`  "@xinutec/ui-harness@${URL_}${NEW}": true`));
  });

  it('reports a file with no key rather than silently adding none', () => {
    // The caller fails on null. Inventing the entry would guess at indentation
    // and position in a file the consumer owns; saying so names the repo.
    expect(rewriteAllowBuilds(file('  lmdb: true'), NEW)).toBeNull();
  });

  it('leaves every other line alone, including the neighbouring allowBuilds', () => {
    const text = file(`  msgpackr-extract: true\n  "@xinutec/ui-harness@${URL_}${OLD}": true`);
    const out = rewriteAllowBuilds(text, NEW);
    expect(out).toContain('  msgpackr-extract: true');
    expect(out).toContain('# a comment about builds');
    expect(out).not.toContain(OLD);
  });
});

/**
 * The permission the install itself needs, which is not the one it ends with.
 *
 * ⚠ **The install resolves the commit on its way OUT before it writes the one
 * coming in.** Moving the grant first and then installing is what broke the
 * 13-repo bump on 2026-08-14: pnpm met a build script nobody had approved and
 * exited 1 with ERR_PNPM_IGNORED_BUILDS — naming the OLD commit, which reads
 * like the rewrite never happened. It also appended a `set this to true or
 * false` line for that commit on the way down, so the run edited the file it
 * failed on and the next attempt died on a duplicate mapping key instead.
 *
 * So both stand while pnpm works, and `rewriteAllowBuilds` collapses them once
 * the lockfile names only the survivor.
 */
describe('allowBoth', () => {
  it('grants the new commit without withdrawing the old', () => {
    const out = allowBoth(file(`  "@xinutec/ui-harness@${URL_}${OLD}": true`), NEW);
    expect(out).toBe(
      file(`  "@xinutec/ui-harness@${URL_}${OLD}": true\n  "@xinutec/ui-harness@${URL_}${NEW}": true`),
    );
  });

  it('adds nothing when the file already grants that commit', () => {
    // Re-running a bump that got partway must not write a duplicate mapping key,
    // which pnpm refuses to parse at all — a worse failure than the one being
    // fixed, and the one a second attempt actually hit.
    const text = file(`  "@xinutec/ui-harness@${URL_}${NEW}": true`);
    expect(allowBoth(text, NEW)).toBe(text);
  });

  it('keeps the quote style, like the rewrite it precedes', () => {
    const out = allowBoth(file(`  '@xinutec/ui-harness@${URL_}${OLD}': true`), NEW);
    expect(out).toContain(`  '@xinutec/ui-harness@${URL_}${NEW}': true`);
  });

  it('reports a file with no key rather than inventing one', () => {
    expect(allowBoth(file('  lmdb: true'), NEW)).toBeNull();
  });
});

/**
 * What a cleanup after a failed run is allowed to touch.
 *
 * The guard this feeds refuses to start when a consumer holds work that
 * reverting the pin files would destroy — which is not the same as refusing a
 * dirty tree. A bump leaves its own three files changed, so a flat dirtiness
 * check refuses every re-run, including the second half of a run that failed in
 * the middle.
 */
describe('foreignChanges', () => {
  it('sees nothing to lose in a tree holding only a bump', () => {
    const porcelain = ' M frontend/package.json\n M frontend/pnpm-lock.yaml\n M frontend/pnpm-workspace.yaml';
    expect(foreignChanges(porcelain)).toEqual([]);
  });

  it('names work a revert would destroy', () => {
    // Not hypothetical: another session committed Heartbeat work in `recall`
    // while a failed bump was being diagnosed next door.
    const porcelain = ' M frontend/package.json\n M android/app/src/main/kotlin/Heartbeat.kt';
    expect(foreignChanges(porcelain)).toEqual(['android/app/src/main/kotlin/Heartbeat.kt']);
  });

  it('reads staged and untracked alike, since a revert is no kinder to either', () => {
    expect(foreignChanges('M  src/a.ts\n?? notes.md')).toEqual(['src/a.ts', 'notes.md']);
  });

  it('is quiet on a clean tree', () => {
    expect(foreignChanges('')).toEqual([]);
  });

  it('reads the output as the caller actually hands it over, trimmed', () => {
    // ⚠ The regression this exists for. `git()` trims what it returns, which
    // eats the leading space of the FIRST porcelain line and no other, so a
    // fixed-width read shifts that one path by a character. Every repo then
    // looks like it holds foreign work called `rontend/package.json`, and the
    // guard refuses the whole fleet. The fixture above is the untrimmed shape
    // and passed throughout.
    const porcelain = ' M frontend/package.json\n M frontend/pnpm-lock.yaml'.trim();
    expect(foreignChanges(porcelain)).toEqual([]);
  });
});
