{-
ui-harness/gate.dhall — this repository's commit gate.

Was `scripts/verify.sh`. Twelve Angular frontends ride on this package — on its
measurement functions and, since the config was modelled here, on their Playwright
config and static server too — and eight Android wrappers ride on `android/`. A red
run here is a real regression in every one of them, which is why the steps are
worth naming individually rather than as one script that either passed or did not.

**The consumer build no longer skips.** The last step built `life` against the
shell, and printed a yellow SKIPPED when life was not checked out beside this
repo — with the script's own comment saying "a green run that skipped the consumer
check is not the same green as one that did it". A table cannot print a warning
and carry on, and it should not: the fleet already settled this the other way for
every Android row that needs recall's dev shell — a missing prerequisite FAILS the
row, because a gate that skips is a gate that lies. So the row is unconditional. If
life is not beside this repo, this gate is red, and it is red for a true reason.

**The dev-lint pin survived the move, and got shorter.** The script resolved
dev-lint's committed HEAD by hand — four lines of directory-hunting plus
`rev-parse` — to build its current committed state rather than a dirty worktree,
so in-flight edits over there cannot break this repo's gate. A table's `argv` has
no shell to substitute a `$(…)` in, and the pin is not something to lose: it is
the defence against a neighbour's half-finished refactor failing this gate for a
reason no commit anywhere explains. `?ref=HEAD` says the same thing with no
substitution at all, and takes a relative path. Measured against a scratch repo
holding a committed and a dirty version of one flake: a plain path and a bare
`git+file://` both build the DIRTY worktree; `?rev=<sha>` and `?ref=HEAD` both
build committed HEAD.

Each row names the dev shell it needs, exactly as the script's `web`/`android`/
`lint` helpers did, so a row cannot silently borrow the wrong toolchain. `ktlint`
keeps its own shell rather than borrowing `.#android`'s copy: CI runs that step
and must not drag the unfree SDK in to do it.

Order is cheapest-first, so the Android half — a JVM, an SDK and a full APK —
comes last. That is presentation only now: the runner runs every row and names
every failure, so nothing hides behind a fast failure.

Keep this in step with `.github/workflows/ci.yml`, which runs every check that
does not need the Android SDK. CI silently running a subset of this file is how
`android/` went ungated in CI from the day it was added until 2026-08-02.

The generated `gate.json` is committed; `the table matches its Dhall` re-renders
and diffs it, so running the gate needs no `dhall`.

**The vocabulary moved into the schema.** `inDevShell`, the clippy target
directory, the Angular worker cap, and the `ng-build` / `dev-lint` /
`check-table` rows were spelled out here and in a dozen other tables
identically — the duplication the shared tools were built to remove, recreated
one level up. They are `G.` values now. Two consequences the rendered JSON
shows: every dev-shell row gains `--no-warn-dirty`, because a gate that prints
"Git tree is dirty" on every row of every run has trained everyone to ignore a
warning; and dev-lint is pinned to its committed HEAD rather than run out of its
worktree, which is what stops a neighbour's half-finished edit failing this gate
for a reason no commit anywhere explains.

-}

let G = ../dev-lint/gate/schema.dhall

let web = G.inShell ".#default"

let android = G.inShell ".#android"

let ktlintShell = G.inShell ".#ktlint"

in  { name = "ui-harness"
    , checks =
      [ {-  Deterministic install: fails if package.json and pnpm-lock.yaml
            disagree. `--frozen-lockfile` is what `npm ci` was here — it refuses
            rather than resolving, which is the whole point of the row.
        -}
        G.Check::{
        , name = "pnpm install (frozen, from the lockfile)"
        , argv = web [ "pnpm", "install", "--frozen-lockfile" ]
        , env = G.nonInteractive
        , timeout_s = 900
        }
      , {-  Pinned to dev-lint's committed HEAD — see the header. Not
            `../dev-lint`, which would build whatever that worktree says right
            now.
        -}
        G.Check::{
        , name = "dev-lint (shared rules, whole repo)"
        , argv = [ "nix", "run", "git+file:../dev-lint?ref=HEAD", "--", "." ]
        , timeout_s = 900
        }
      , {-  strict + declaration; the thing the apps import is what gets
            type-checked here.
        -}
        G.Check::{
        , name = "tsc build (emits the published dist/ + .d.ts)"
        , argv = web [ "pnpm", "run", "build" ]
        , env = G.nonInteractive
        , timeout_s = 900
        }
      , {-  src/*.spec.ts — the label rules and the flattener behind the shared
            telemetry trace. Nine near-identical spec files across the fleet
            before this; they run once, here.
        -}
        G.Check::{
        , name = "vitest unit specs"
        , argv = web [ "pnpm", "run", "test:unit" ]
        , env = G.nonInteractive
        , timeout_s = 900
        }
      , {-  Lint only — the formatter stays off, because src/ is tab-indented and
            tests/ two-space and picking one is a decision about style rather
            than correctness. The linter is here because DL-TS-STRINGIFY-GUARD
            wants `noBaseToString`: nothing in this repo banned the default
            object stringification that renders `[object Object]` in a UI.
        -}
        G.Check::{
        , name = "biome (lint)"
        , argv = web [ "pnpm", "run", "lint" ]
        , env = G.nonInteractive
        , timeout_s = 900
        }
      , {-  The build above covers src/ only, under a config that emits. This is
            tsconfig.json, which governs src/ AND tests/ AND scripts/ — the last
            of which is real code that used to be shell, where bump-consumers
            shipped a silent substitution bug that rewrote a lockfile without its
            manifest. It is also the config dev-lint's node-checks builds its TS
            Program from: no root tsconfig.json meant all 36 typed rules skipped
            every file in this repo.
        -}
        G.Check::{
        , name = "tsc typecheck (whole repo, noEmit)"
        , argv = web [ "pnpm", "run", "typecheck" ]
        , env = G.nonInteractive
        , timeout_s = 900
        }
      , {-  Chromium comes from playwright's own cache; the install is idempotent
            and fast when present.
        -}
        G.Check::{
        , name = "playwright chromium is installed"
        , argv = web [ "pnpm", "exec", "playwright", "install", "chromium" ]
        , env = G.nonInteractive
        , timeout_s = 900
        }
      , {-  The specs in tests/ exercise the measurement functions against
            setContent DOM at the same Pixel-7 geometry the real checks run at —
            no app, no server.
        -}
        G.Check::{
        , name = "playwright fixture specs (measurement fns @ phone geometry)"
        , argv = web [ "pnpm", "test" ]
        , env = G.nonInteractive
        , timeout_s = 1800
        }
      , {-  dev-lint's DL-KTLINT discovers apps by
            `<module>/app/src/main/AndroidManifest.xml`, which a library module
            has none of — so without this the shell would be the one Kotlin in the
            fleet with no formatting gate. Same .editorconfig as every app.

            Its own dev shell, not `.#android`'s copy: CI runs this step and must
            not drag the unfree SDK in to do it, and a gate that used a different
            ktlint locally than in CI is the divergence this repository exists to
            stop. ktlint does its own pattern matching, so the globs are its to
            interpret and need no shell.
        -}
        G.Check::{
        , name = "ktlint (android/)"
        , argv =
            ktlintShell
              [ "ktlint", "android/main/src/**/*.kt", "android/*.kts" ]
        , timeout_s = 900
        }
      , {-  Restore's predicate, host confinement, and the CSS-colour parse — the
            pieces of the shell that can be wrong without anything crashing.
        -}
        G.Check::{
        , name = "shell unit tests (org.xinutec:shell)"
        , argv =
            android
              [ "./android/gradlew"
              , "-p"
              , "android"
              , "--console=plain"
              , ":main:test"
              ]
        , timeout_s = 1800
        }
      , {-  The API was designed against life, so life is what proves it still
            fits. Building it exercises the composite substitution end to end, and
            puts a breaking change in the repository that caused it rather than in
            eight apps at once.

            Unconditional — see the header. The script skipped this with a warning
            when life was not checked out beside this repo; a row that can quietly
            not run is the failure this whole conversion is about.
        -}
        G.Check::{
        , name = "life built against the shell (the demanding consumer)"
        , argv =
            android
              [ "../life/android/gradlew"
              , "-p"
              , "../life/android"
              , "--console=plain"
              , ":app:assembleDebug"
              ]
        , timeout_s = 1800
        }
      , G.checkTable "../dev-lint"
      ]
    }
