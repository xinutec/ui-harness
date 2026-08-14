#!/usr/bin/env bash
# Commit and push one harness bump across every consumer that carries one.
#
#   ./scripts/land-bump.sh <sha>
#
# `bump-consumers.ts` deliberately stops at editing, because deciding that
# thirteen apps still pass against a new harness is the half that wants a human.
# This is that half made runnable: each repo's pre-commit hook IS its gate (`nix
# run ../dev-lint#gate`), so committing is verifying — a repo whose gate fails
# does not get a commit, and this says which and keeps going.
#
# It never bypasses a gate and never uses `git add -A`: only the three files a
# bump writes are staged, by name.
# ⚠ Every test below is `if`-guarded rather than written `[ … ] && arr+=(…)`.
# That form returns the test's status, so a false one aborts the whole run under
# `set -e` — silently skipping the repos after it.
set -euo pipefail

SHA="${1:?usage: land-bump.sh <40-char sha>}"
CODE="$(cd "$(dirname "$0")/../.." && pwd)"
PINS=(frontend/package.json frontend/pnpm-lock.yaml frontend/pnpm-workspace.yaml)

passed=(); failed=(); skipped=()

for repo in "$CODE"/*/; do
  name="$(basename "$repo")"
  [ -f "$repo/frontend/package.json" ] || continue
  grep -q '"@xinutec/ui-harness"' "$repo/frontend/package.json" || continue

  staged=()
  for pin in "${PINS[@]}"; do
    if [ -n "$(git -C "$repo" status --porcelain -- "$pin")" ]; then
      staged+=("$pin")
    fi
  done
  if [ ${#staged[@]} -eq 0 ]; then
    skipped+=("$name")
    continue
  fi

  echo "=== $name: ${staged[*]} ==="
  git -C "$repo" add "${staged[@]}"
  if git -C "$repo" commit -q -F - <<EOF
frontend: take the harness fix for a wake lock nobody was holding

ui-harness $SHA. The awake button could be lit, the choice remembered,
and no KEEP_SCREEN_ON held anywhere on the device — the screen timed out
under a button that said it would not.

Android freezes a backgrounded process and takes the lock back with no
JS left to run, so the app thaws holding a sentinel that still reports
itself live. Returning to the front now drops that handle rather than
asking it, with one request in flight so the retry cannot leak a lock
nobody holds a handle to.
EOF
  then
    if git -C "$repo" push -q 2>&1; then
      passed+=("$name")
    else
      failed+=("$name (committed, push failed)")
    fi
  else
    failed+=("$name (gate)")
    git -C "$repo" reset -q
  fi
done

echo
echo "landed:  ${passed[*]:-none}"
echo "failed:  ${failed[*]:-none}"
echo "nothing: ${skipped[*]:-none}"
[ ${#failed[@]} -eq 0 ]
