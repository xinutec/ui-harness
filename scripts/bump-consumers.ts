#!/usr/bin/env node
/**
 * Raise every consumer's pin of `@xinutec/ui-harness` to one commit.
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
 * type-checked by `tsconfig.scripts.json` in verify, in the language the repo is
 * already written in.
 *
 * It deliberately stops at editing. It does not commit, and it does not run each
 * consumer's gate: bumping is the easy half, and deciding that twelve apps still
 * pass against the new harness is the half that wants a human reading the results.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const PKG = '@xinutec/ui-harness';
const REPO = resolve(dirname(new URL(import.meta.url).pathname), '..');
const CODE = dirname(REPO);

/** The spec as it appears in a manifest, with or without a pin. */
const SPEC = new RegExp(`"${PKG.replace('/', '\\/')}": "github:xinutec\\/ui-harness(#[0-9a-f]*)?"`);

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
 * Rewrite the spec and bring the lockfile with it.
 *
 * Both, always. A manifest and lockfile that disagree are not untidy: pnpm refuses
 * `--frozen-lockfile` outright, while npm installs anyway and leaves the OLD spec
 * recorded — so the pin quietly is not what the lockfile says.
 */
function bump(entry: { manifest: string; dir: string }, sha: string): void {
  const text = readFileSync(entry.manifest, 'utf8');
  const updated = text.replace(SPEC, `"${PKG}": "github:xinutec/ui-harness#${sha}"`);
  if (updated === text) fail(`${entry.manifest}: found no ${PKG} spec to rewrite`);
  writeFileSync(entry.manifest, updated);

  const run = (cmd: string, args: string[]): void => {
    execFileSync(cmd, args, { cwd: entry.dir, stdio: 'ignore' });
  };
  if (existsSync(join(entry.dir, 'pnpm-lock.yaml'))) {
    run('pnpm', ['install', '--lockfile-only']);
  } else if (existsSync(join(entry.dir, 'package-lock.json'))) {
    run('npm', ['install', '--package-lock-only']);
  }
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

  let changed = 0;
  for (const entry of consumers()) {
    const current = pinnedCommit(entry.manifest);
    if (current === sha) {
      console.log(`${entry.repo.padEnd(12)} already at ${sha.slice(0, 12)}`);
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

main();
