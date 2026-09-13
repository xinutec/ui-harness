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
#
# ⚠ The commit message is READ FROM THE HARNESS COMMIT, not written here. It used
# to be a heredoc typed in for one bump, and it stayed — so this script sat in the
# tree for weeks ready to tell thirteen repos they were taking a wake-lock fix, no
# matter what the bump actually was. A message that has to be remembered is a
# message that goes stale; `git log` already knows what changed.
# ⚠ Every test below is `if`-guarded rather than written `[ … ] && arr+=(…)`.
# That form returns the test's status, so a false one aborts the whole run under
# `set -e` — silently skipping the repos after it.
set -euo pipefail

SHA="${1:?usage: land-bump.sh <40-char sha>}"
CODE="$(cd "$(dirname "$0")/../.." && pwd)"
HARNESS="$(cd "$(dirname "$0")/.." && pwd)"
PINS=(frontend/package.json frontend/pnpm-lock.yaml frontend/pnpm-workspace.yaml)

# Fail here rather than after the first repo is already committed: a sha that does
# not resolve means the pins point at nothing, and half a landed bump is worse
# than none.
if ! WHAT="$(git -C "$HARNESS" log -1 --format=%B "$SHA" 2>/dev/null)"; then
  echo "land-bump: $SHA is not a commit in $HARNESS" >&2
  exit 1
fi

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
frontend: take ui-harness ${SHA:0:12}

$WHAT
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
