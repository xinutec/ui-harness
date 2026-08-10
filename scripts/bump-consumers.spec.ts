import { describe, expect, it } from 'vitest';

import { rewriteAllowBuilds } from './bump-consumers.ts';

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
