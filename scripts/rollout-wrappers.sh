#!/usr/bin/env bash
# Rebuild every app's Android wrapper against this checkout's shell and install it
# on one phone. The page inside a wrapper updates with each deploy; the shell around
# it (android/) only when its APK is rebuilt, so a shell change reaches the phone
# through this. fleetwatch's phone-shells collector reports any app left behind.
#
#   nix develop ~/Code/recall#android --command scripts/rollout-wrappers.sh <adb-serial>
#
# The serial is an argument, not written here: this repository is public, and the
# phone's address is on a private network. Installs push the APK and install it on the
# phone (`pm install`), which survives a flaky VPN link that a streamed
# `adb install` does not.
set -euo pipefail

serial="${1:?usage: rollout-wrappers.sh <adb-serial>, the ip:port adb reaches the phone at}"
code="$(cd "$(dirname "$0")/../.." && pwd)"

model="$(adb -s "$serial" shell getprop ro.product.model 2>/dev/null | tr -d '\r' || true)"
if [ -z "$model" ]; then
  echo "no device answers at $serial" >&2
  exit 1
fi
echo "installing to $model ($serial)"

failed=0
# dir gradle-task apk-path name
build_install() {
  if ! (cd "$1" && ./gradlew "$2" -q); then
    echo "$4: build failed" >&2
    failed=1
    return
  fi
  adb -s "$serial" push "$1/$3" /data/local/tmp/wrapper.apk >/dev/null
  echo "$4: $(adb -s "$serial" shell pm install -r /data/local/tmp/wrapper.apk | tr -d '\r')"
  adb -s "$serial" shell rm -f /data/local/tmp/wrapper.apk
}

for app in coach fleetwatch health home life memview messages tasks utterance; do
  build_install "$code/$app/android" :app:assembleDebug app/build/outputs/apk/debug/app-debug.apk "$app"
done
build_install "$code/recall/android" :web:assembleDebug web/build/outputs/apk/debug/web-debug.apk recall-web

# Last, because installing the console restarts it. Its address and server pin come
# from its gitignored console.env, as its own deploy.sh loads it; its build refuses
# to assemble without them.
set -a
# shellcheck disable=SC1091 # local and gitignored
. "$code/memview/console/android/console.env"
set +a
build_install "$code/memview/console/android" :app:assembleDebug app/build/outputs/apk/debug/app-debug.apk console
adb -s "$serial" shell am start -n org.xinutec.console/.MainActivity >/dev/null

exit "$failed"
