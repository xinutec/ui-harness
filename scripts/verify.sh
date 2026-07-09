#!/usr/bin/env bash
#
# The single source of truth for "is this change good?" for @xinutec/ui-harness.
#
# Run it the same way everywhere so local-green and CI-green can't diverge:
#   - by hand:   nix develop -c scripts/verify.sh
#   - pre-commit:  scripts/githooks/pre-commit calls it (see scripts/setup-hooks.sh)
#   - CI:        .github/workflows/ci.yml runs the same steps
#
# Five Angular frontends ride on this package's measurement functions, so a red
# run here is a real regression in the shared harness. Steps run cheapest-first.
set -euo pipefail

cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

step() { printf '\n\033[1m=== %s ===\033[0m\n' "$*"; }

step "npm ci (clean install from the lockfile)"
# Deterministic install: fails if package.json and package-lock.json disagree.
npm ci

step "dev-lint (custom static-analysis rules, whole repo)"
# Pin ?rev= to dev-lint's COMMITTED HEAD so this gate builds its current state,
# never a dirty worktree — in-flight edits over there can't break this repo's gate.
dev_lint_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)/dev-lint"
[ -d "$dev_lint_dir" ] || dev_lint_dir="$HOME/Code/dev-lint"
[ -d "$dev_lint_dir" ] || dev_lint_dir="$HOME/code/dev-lint"
dev_lint_rev=$(git -C "$dev_lint_dir" rev-parse HEAD)
nix run "git+file://$dev_lint_dir?rev=$dev_lint_rev" -- . # dev-lint

step "tsc build (compiles + emits the published dist/ + .d.ts)"
# strict + declaration; the thing the apps import is what gets type-checked here.
npm run build

step "playwright fixture specs (measurement fns @ phone geometry)"
# The specs in tests/ exercise the measurement functions against setContent DOM at
# the same Pixel-7 geometry the real checks run at — no app, no server. Chromium
# comes from playwright's own cache; install is idempotent (fast when present).
npx playwright install chromium
npm test

printf '\n\033[1;32mALL GREEN\033[0m — verified\n'
