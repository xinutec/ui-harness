#!/usr/bin/env node
/**
 * Raise every consumer's pin of `@xinutec/ui-harness` to one commit — in the
 * manifest, in `pnpm-workspace.yaml`'s build permission, and in the lockfile.
 *
 *   node scripts/bump-consumers.ts              # dry run against HEAD
 *   node scripts/bump-consumers.ts --apply
 *   node scripts/bump-consumers.ts --apply <sha>
 *
 * WHY THE PIN EXISTS. Consumers pin the harness to a 40-char commit rather than
 * tracking `main`, so a build is reproducible and a harness push never changes
 * twelve repos' gate results with nothing in any diff to explain it
 * (dev-lint's DL-JS-GIT-DEP-UNPINNED enforces it). The price of that guarantee is
 * a twelve-repo bump, and a chore nobody automates is a chore nobody does — pins
 * would rot, which is worse than the drift they prevent. So the bump is one
 * command.
 *
 * WHY TYPESCRIPT AND NOT BASH. The first version of this was a bash script with a
 * substitution embedded in it, and it shipped a bug immediately: the package name
 * begins with `@`, the shell interpolated it into a perl expression, perl read
 * `@xinutec` as an empty array, the pattern matched nothing — and the script then
 * updated the lockfile anyway, producing exactly the manifest/lockfile mismatch it
 * was written to prevent. Nothing could have caught that: shell has no gate in
 * this fleet, and a heredoc in another language has no gate anywhere. This file is
 * type-checked by the root `tsconfig.json` in verify (which covers `scripts/`),
 * in the language the repo is already written in, and its rewrites have a spec.
 *
 * It deliberately stops at editing. It does not commit, and it does not run each
 * consumer's gate: bumping is the easy half, and deciding that twelve apps still
 * pass against the new harness is the half that wants a human reading the results.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PKG = '@xinutec/ui-harness';
const REPO = resolve(dirname(new URL(import.meta.url).pathname), '..');
const CODE = dirname(REPO);

/** The spec as it appears in a manifest, with or without a pin. */
const SPEC = new RegExp(`"${PKG.replace('/', '\\/')}": "github:xinutec\\/ui-harness(#[0-9a-f]*)?"`);

/** How pnpm spells the same dependency once it has resolved it. */
const TARBALL = 'https://codeload.github.com/xinutec/ui-harness/tar.gz/';

/**
 * One `allowBuilds` entry, quotes and indentation as written.
 *
 * pnpm keys a git dependency by its FULL resolved spec, so the entry that lets
 * the harness run its `prepare` carries the commit — and the fleet writes it by
 * hand in two quote styles, which is why the quote is captured rather than
 * assumed.
 */
const ALLOW_LINE = new RegExp(
  `^(\\s*)(['"])${PKG}@${TARBALL.replace(/[./]/g, '\\$&')}[0-9a-f]+\\2\\s*:.*$`,
);

function git(args: string[], cwd: string = REPO): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

function fail(message: string): never {
  console.error(message);
  process.exit(2);
}

/** Consumers are the sibling repos under ~/Code with a frontend manifest naming us. */
function consumers(): { repo: string; manifest: string; dir: string }[] {
  const found: { repo: string; manifest: string; dir: string }[] = [];
  for (const repo of readdirSync(CODE).sort()) {
    const dir = join(CODE, repo, 'frontend');
    const manifest = join(dir, 'package.json');
    if (!existsSync(manifest)) continue;
    if (!readFileSync(manifest, 'utf8').includes(`"${PKG}"`)) continue;
    found.push({ repo, manifest, dir });
  }
  return found;
}

/** The commit a manifest currently pins, or null when it names no ref at all. */
function pinnedCommit(manifest: string): string | null {
  const m = SPEC.exec(readFileSync(manifest, 'utf8'));
  const ref = m?.[1];
  return ref ? ref.slice(1) : null;
}

/**
 * Move the `allowBuilds` key onto `sha`, or null when the file carries none.
 *
 * A single surviving entry, spelled `true`. Duplicates are dropped rather than
 * left: pnpm writes `set this to true or false` beside the old key when it meets
 * a spec nobody approved, and two repos were carrying such a line from a bump
 * that moved the manifest and left this file behind. Only one commit is pinned,
 * so only one key can be current — the rest are the residue of the bug.
 */
export function rewriteAllowBuilds(text: string, sha: string): string | null {
  const out: string[] = [];
  let moved = false;
  for (const line of text.split('\n')) {
    const m = ALLOW_LINE.exec(line);
    if (m === null) {
      out.push(line);
      continue;
    }
    if (moved) continue;
    moved = true;
    out.push(`${m[1]}${m[2]}${PKG}@${TARBALL}${sha}${m[2]}: true`);
  }
  return moved ? out.join('\n') : null;
}

/**
 * Grant `sha` without withdrawing what is already granted, for the install.
 *
 * ⚠ **The install resolves the commit on its way OUT before it writes the one
 * coming in**, so withdrawing the old permission first is not tidiness — it is
 * the bug. pnpm meets a build script nobody approved and exits 1 with
 * ERR_PNPM_IGNORED_BUILDS naming the OLD commit, which reads like the rewrite
 * never happened at all. It also appends a `set this to true or false` line for
 * that commit on the way down, so the failed run has edited the file it failed
 * on, and a second attempt dies on a duplicate mapping key instead.
 *
 * Both stand for the length of the install. [`rewriteAllowBuilds`] collapses
 * them afterwards, once the lockfile names only the survivor.
 */
export function allowBoth(text: string, sha: string): string | null {
  const out: string[] = [];
  let seen = false;
  for (const line of text.split('\n')) {
    out.push(line);
    const m = ALLOW_LINE.exec(line);
    if (m === null || seen) continue;
    seen = true;
    if (!line.includes(sha)) out.push(`${m[1]}${m[2]}${PKG}@${TARBALL}${sha}${m[2]}: true`);
  }
  return seen ? out.join('\n') : null;
}

/**
 * Rewrite the spec, move the build permission with it, and bring the lockfile.
 *
 * All three, always. A manifest and lockfile that disagree are not untidy: pnpm
 * refuses `--frozen-lockfile` outright. And `pnpm-workspace.yaml` holds the
 * permission that lets the harness run its `prepare`, keyed by the resolved spec
 * — commit and all. Rewriting the manifest alone leaves that key naming a commit
 * nobody installs any more, and the next cold-store install fails with
 * ERR_PNPM_GIT_DEP_PREPARE_NOT_ALLOWED.
 *
 * That failure is why this belongs in the script rather than in a checklist: a
 * local install passes, because the machine-wide store already holds the harness
 * built by a sibling repo and nothing needs running. It surfaces in CI and in
 * Docker, on a clean store, away from whoever did the bump.
 */
function bump(entry: { manifest: string; dir: string }, sha: string): void {
  const text = readFileSync(entry.manifest, 'utf8');
  const updated = text.replace(SPEC, `"${PKG}": "github:xinutec/ui-harness#${sha}"`);
  if (updated === text) fail(`${entry.manifest}: found no ${PKG} spec to rewrite`);
  writeFileSync(entry.manifest, updated);

  // Every consumer is pnpm (measured 2026-08-09, all thirteen), so a missing
  // workspace file or key is a broken consumer, not an npm one to skip quietly.
  const workspace = join(entry.dir, 'pnpm-workspace.yaml');
  if (!existsSync(workspace)) fail(`${workspace}: missing — pnpm consumers need one`);
  const during = allowBoth(readFileSync(workspace, 'utf8'), sha);
  if (during === null) fail(`${workspace}: found no ${PKG} allowBuilds key to move`);
  writeFileSync(workspace, during);

  // `inherit`, not `ignore`. This threw for one repo in thirteen and the error
  // carried `stdout: null, stderr: null` under ten lines of node internals, so
  // pnpm's actual complaint — the one naming which commit it would not build —
  // never reached the screen and the fault above took a manual re-run to see.
  execFileSync('pnpm', ['install', '--lockfile-only'], { cwd: entry.dir, stdio: 'inherit' });

  // Now, and not before: the lockfile names only `sha`, so every other key is
  // dead — the one just left behind, and any placeholder an earlier failed run
  // wrote.
  const moved = rewriteAllowBuilds(readFileSync(workspace, 'utf8'), sha);
  if (moved === null) fail(`${workspace}: found no ${PKG} allowBuilds key to move`);
  writeFileSync(workspace, moved);
}

/** The three files a bump writes, and the only three a cleanup may revert. */
const PIN_FILES = ['frontend/package.json', 'frontend/pnpm-lock.yaml', 'frontend/pnpm-workspace.yaml'];

/**
 * Work in a consumer's tree that a cleanup would destroy.
 *
 * ⚠ **Not "is the tree dirty".** A bump leaves its own three files changed, so
 * flat dirtiness refuses every re-run — including the second half of a run that
 * failed in the middle, which is exactly when this is wanted. What matters is
 * whether reverting those three would take anything else with it.
 *
 * Porcelain paths are matched whole, so a rename line (`R old -> new`) reads as
 * foreign and refuses. That is the safe way round: a bump never renames.
 *
 * ⚠ **The status field is read as a token, not as two columns.** Porcelain pads
 * it to two characters, so a fixed `slice(3)` is right — until the caller trims
 * the output, which eats the leading space of the FIRST line only and shifts it
 * by one. That shipped: every path came back as `rontend/package.json` and the
 * guard refused all twelve repos, naming a file that does not exist.
 */
export function foreignChanges(porcelain: string): string[] {
  return porcelain
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .map((line) => line.replace(/^\S+\s+/, ''))
    .filter((path) => !PIN_FILES.includes(path));
}

/**
 * Collapse a correctly-pinned repo's leftover permissions to the one that counts.
 *
 * Returns what to say about it, so a repo needing nothing stays a quiet line.
 */
function tidy(entry: { repo: string; dir: string }, sha: string, apply: boolean): string {
  const workspace = join(entry.dir, 'pnpm-workspace.yaml');
  if (!existsSync(workspace)) return '';
  const text = readFileSync(workspace, 'utf8');
  const moved = rewriteAllowBuilds(text, sha);
  if (moved === null || moved === text) return '';
  if (apply) writeFileSync(workspace, moved);
  return apply ? ' (dropped stale build permissions)' : ' (has stale build permissions)';
}

function main(): void {
  const argv = process.argv.slice(2);
  const apply = argv[0] === '--apply';
  const sha = (apply ? argv[1] : argv[0]) ?? git(['rev-parse', 'HEAD']);

  if (!/^[0-9a-f]{40}$/.test(sha)) fail(`not a full 40-char commit: ${sha}`);
  // A pin nobody else can fetch is worse than no pin: every consumer's install
  // breaks, and it breaks in twelve repos rather than in this one.
  try {
    git(['merge-base', '--is-ancestor', sha, 'origin/main']);
  } catch {
    fail(`refusing: ${sha} is not on origin/main — push the harness first`);
  }

  // ⚠ **Nothing is edited until every repo this run will TOUCH is clean.** It is
  // not a transaction and cannot be made one — it edits many working trees and
  // pnpm can fail in the middle of any of them, which it did, leaving two repos
  // changed with nothing said. Refusing up front is what makes the cleanup after
  // a failure safe: `git checkout` on the three pin files is only the right
  // answer if there was nothing else in that tree to lose.
  //
  // It is not hypothetical, in either direction. Another session committed
  // unrelated work in one of these repos while a failed run was being diagnosed,
  // which a blanket revert would have destroyed — and a first version of this
  // guard read EVERY consumer, so unrelated work in a repo already at `sha`
  // refused a bump that would never have gone near it. Scope the question to the
  // repos actually being written to.
  const willTouch = consumers().filter(
    (entry) => pinnedCommit(entry.manifest) !== sha || tidy(entry, sha, false) !== '',
  );
  if (apply) {
    const risky = willTouch
      .map((entry) => ({
        repo: entry.repo,
        foreign: foreignChanges(git(['status', '--porcelain'], entry.dir)),
      }))
      .filter((entry) => entry.foreign.length > 0);
    if (risky.length > 0) {
      fail(
        `refusing: uncommitted work outside the pin files in ${risky
          .map((entry) => `${entry.repo} (${entry.foreign.join(', ')})`)
          .join('; ')}\n` +
          'A bump that fails partway is cleaned up by reverting the pin files, ' +
          'which would take that work with it. Commit or stash it first.',
      );
    }
  }

  let changed = 0;
  for (const entry of consumers()) {
    const current = pinnedCommit(entry.manifest);
    if (current === sha) {
      // ⚠ **Already pinned is where residue survives**, and skipping outright is
      // how it accumulated: a repo at the right commit still carries the
      // placeholders pnpm wrote beside older ones, each an unapproved build
      // script waiting to fail an install. memview was pinned correctly and
      // still had one from a commit two bumps back. Collapsing is a text rewrite
      // — no resolution, no lockfile, nothing to install — so it costs nothing
      // to do here.
      const tidied = tidy(entry, sha, apply);
      console.log(`${entry.repo.padEnd(12)} already at ${sha.slice(0, 12)}${tidied}`);
      continue;
    }
    changed += 1;
    console.log(
      `${entry.repo.padEnd(12)} ${current?.slice(0, 12) ?? '(unpinned)'} -> ${sha.slice(0, 12)}`,
    );
    if (apply) bump(entry, sha);
  }

  console.log();
  if (changed === 0) console.log(`every consumer is already at ${sha.slice(0, 12)}`);
  else if (apply) console.log(`${changed} repo(s) updated. Run each one's verify, then commit.`);
  else console.log(`${changed} repo(s) would change. Re-run with --apply to do it.`);
}

// Only when run as the command. The rewrite is a pure function with a spec
// beside it, and importing that spec must not bump thirteen repos.
if (process.argv[1] === fileURLToPath(import.meta.url)) main();
