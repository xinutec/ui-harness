#!/usr/bin/env bash
#
# The single source of truth for "is this change good?" for @xinutec/ui-harness.
#
# Run it the same way everywhere so local-green and CI-green can't diverge:
#   - by hand:   nix develop -c scripts/verify.sh
#   - pre-commit:  scripts/githooks/pre-commit calls it (see scripts/setup-hooks.sh)
#   - CI:        .github/workflows/ci.yml runs the node steps only — no Android SDK
#                on the runner, and nothing in the fleet builds Android in CI
#
# Twelve Angular frontends ride on this package — on its measurement functions
# and, since the config was modelled here, on their Playwright config and static
# server too — and seven Android wrappers ride on android/. A red run here is a
# real regression in every one of them. Steps run cheapest-first, so the Android
# half (a JVM, an SDK and a full APK) comes last.
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

step "tsc typecheck of scripts/ (noEmit)"
# scripts/ is real code and gets the same treatment as src/. It is not covered by
# the build above (rootDir is src/), and it used to be shell — where this fleet has
# no gate at all, and where bump-consumers shipped a silent substitution bug that
# rewrote a lockfile without its manifest.
npm run typecheck:scripts

step "playwright fixture specs (measurement fns @ phone geometry)"
# The specs in tests/ exercise the measurement functions against setContent DOM at
# the same Pixel-7 geometry the real checks run at — no app, no server. Chromium
# comes from playwright's own cache; install is idempotent (fast when present).
npx playwright install chromium
npm test

# ---- the Android half ----
#
# Its toolchain (JDK, SDK, ktlint) is a different dev shell, so each step enters
# it. Nested `nix develop` is fine; the outer one only carries node.
android() { nix develop .#android --command "$@"; }

step "ktlint (android/)"
# dev-lint's DL-KTLINT discovers apps by <module>/app/src/main/AndroidManifest.xml,
# which a library module has none of — so the shell would otherwise be the one
# Kotlin in the fleet with no formatting gate. Same .editorconfig as every app.
android ktlint "android/main/src/**/*.kt" "android/*.kts"

step "shell unit tests (org.xinutec:shell)"
# Restore's predicate and the CSS-colour parse — the two pieces of the shell that
# can be wrong without anything crashing.
android ./android/gradlew -p android --console=plain :main:test

step "life built against the shell (the demanding consumer)"
# The API was designed against life, so life is what proves it still fits. Building
# it exercises the composite substitution end to end, and puts a breaking change in
# the repo that caused it rather than in seven apps at once.
life_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)/life"
[ -d "$life_dir" ] || life_dir="$HOME/Code/life"
if [ -d "$life_dir/android" ]; then
  android "$life_dir/android/gradlew" -p "$life_dir/android" --console=plain :app:assembleDebug
else
  # Loud, not silent: a green run that skipped the consumer check is not the same
  # green as one that did it.
  printf '\033[1;33mSKIPPED\033[0m — life is not checked out beside this repo; the consumer build did not run\n'
fi

printf '\n\033[1;32mALL GREEN\033[0m — verified\n'
