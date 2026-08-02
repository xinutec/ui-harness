#!/usr/bin/env bash
#
# The single source of truth for "is this change good?" for @xinutec/ui-harness.
#
# Run it the same way everywhere so local-green and CI-green can't diverge:
#   - by hand:   scripts/verify.sh
#   - pre-commit:  scripts/githooks/pre-commit calls it (see scripts/setup-hooks.sh)
#   - CI:        .github/workflows/ci.yml runs every step that does not need the
#                Android SDK — the node half plus ktlint. The SDK steps (the
#                shell's unit tests, the life consumer APK) stay local: nothing
#                in the fleet builds Android in CI. Keep the two in step; CI
#                silently running a subset of this file is how android/ went
#                ungated in CI from the day it was added until 2026-08-02.
#
# Twelve Angular frontends ride on this package — on its measurement functions
# and, since the config was modelled here, on their Playwright config and static
# server too — and eight Android wrappers ride on android/. A red run here is a
# real regression in every one of them. Steps run cheapest-first, so the Android
# half (a JVM, an SDK and a full APK) comes last.
set -euo pipefail

cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

step() { printf '\n\033[1m=== %s ===\033[0m\n' "$*"; }

# Each step names the dev shell it needs, so this script runs the same way whether
# or not you are already inside one. The halves have different toolchains (node vs
# JDK+SDK+ktlint) and a step that silently borrowed the wrong one is exactly the
# kind of local-green/CI-red gap this file exists to prevent.
web() { nix develop .#default --command "$@"; }
android() { nix develop .#android --command "$@"; }
# ktlint gets its own shell rather than borrowing .#android's copy: CI runs this
# step and must not drag the unfree SDK in to do it, and a gate that used a
# different ktlint locally than in CI is the divergence this file exists to stop.
lint() { nix develop .#ktlint --command "$@"; }

step "npm ci (clean install from the lockfile)"
# Deterministic install: fails if package.json and package-lock.json disagree.
web npm ci

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
web npm run build

step "vitest unit specs (the pure functions, in jsdom)"
# src/*.spec.ts — the label rules and the flattener behind the shared telemetry
# trace. They were nine near-identical spec files across the fleet before this;
# now they run once, here. jsdom rather than a browser because a DOM API is all
# they need, and they sit beside their source rather than in tests/, which is
# Playwright's directory.
web npm run test:unit

step "biome (lint only)"
# The formatter stays off: src/ is tab-indented and tests/ two-space, and picking
# one is a decision about style, not correctness. The linter is here because
# DL-TS-STRINGIFY-GUARD wants `noBaseToString` — nothing in this repo banned the
# default object stringification that renders `[object Object]` in a UI.
web npm run lint

step "tsc typecheck of the whole repo (noEmit)"
# The build above covers src/ only (rootDir), and under a config that emits. This
# is tsconfig.json, which governs src/ AND tests/ AND scripts/ — the last of which
# is real code that used to be shell, where bump-consumers shipped a silent
# substitution bug that rewrote a lockfile without its manifest. It is also the
# config dev-lint's node-checks builds its TS Program from: no root tsconfig.json
# meant all 36 typed rules skipped every file in this repo.
web npm run typecheck

step "playwright fixture specs (measurement fns @ phone geometry)"
# The specs in tests/ exercise the measurement functions against setContent DOM at
# the same Pixel-7 geometry the real checks run at — no app, no server. Chromium
# comes from playwright's own cache; install is idempotent (fast when present).
web npx playwright install chromium
web npm test

# ---- the Android half ----

step "ktlint (android/)"
# dev-lint's DL-KTLINT discovers apps by <module>/app/src/main/AndroidManifest.xml,
# which a library module has none of — so the shell would otherwise be the one
# Kotlin in the fleet with no formatting gate. Same .editorconfig as every app.
lint ktlint "android/main/src/**/*.kt" "android/*.kts"

step "shell unit tests (org.xinutec:shell)"
# Restore's predicate, host confinement, and the CSS-colour parse — the pieces of
# the shell that can be wrong without anything crashing.
android ./android/gradlew -p android --console=plain :main:test

step "life built against the shell (the demanding consumer)"
# The API was designed against life, so life is what proves it still fits. Building
# it exercises the composite substitution end to end, and puts a breaking change in
# the repo that caused it rather than in eight apps at once.
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
