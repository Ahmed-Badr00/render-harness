#!/bin/bash
# Create (or refresh) a render-harness work folder: runner scripts + playwright-core, and empty scenarios/shots/sheets.
# Usage: bootstrap.sh <WORK_DIR> [--rn]
#   --rn  also installs yoga-layout + fontkit into runner/ and copies yoga_check.mjs there (native layout checks for
#         React Native renders; never install them into the app workspace, a second install wipes its patches)
# Uses the system Google Chrome (no browser download). Never touches the app repo. Safe to re-run: scenarios and shots stay.
set -euo pipefail
WORK="${1:?usage: bootstrap.sh <WORK_DIR> [--rn]}"
RN="${2:-}"
mkdir -p "$WORK" && WORK="$(cd "$WORK" && pwd)"
SKILL="$(cd "$(dirname "$0")/.." && pwd)"
mkdir -p "$WORK/runner" "$WORK/scenarios" "$WORK/shots" "$WORK/sheets" "$WORK/findings"
cp "$SKILL/scripts/shoot.mjs" "$SKILL/scripts/mock_server.mjs" "$SKILL/scripts/use_scenario.mjs" "$SKILL/scripts/routes.mjs" "$SKILL/scripts/devices.json" "$WORK/runner/"
printf '{"skill": "%s", "files": ["shoot.mjs", "mock_server.mjs", "use_scenario.mjs", "routes.mjs", "devices.json"], "copied": "%s"}\n' "$SKILL" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$WORK/runner/.skill.json"
cd "$WORK/runner"
[ -f package.json ] || echo '{ "name": "render-harness-runner", "private": true, "type": "module" }' > package.json
if [ ! -d node_modules/playwright-core ]; then
  echo "installing playwright-core (no browser download)"
  npm i --silent --no-audit --no-fund playwright-core@1.55.0
fi
if [ "$RN" = "--rn" ]; then
  cp "$SKILL/assets/rn-web/bin/yoga_check.mjs" "$WORK/runner/"
  [ -d node_modules/yoga-layout ] && [ -d node_modules/fontkit ] || npm i --silent --no-audit --no-fund yoga-layout@3 fontkit@2
  echo "yoga check: FONT_DIR=<app font folder> node $WORK/runner/yoga_check.mjs spec.json"
fi
CHROME="${CHROME_PATH:-}"
for c in "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" /usr/bin/google-chrome /usr/bin/google-chrome-stable /usr/bin/chromium /usr/bin/chromium-browser; do
  [ -z "$CHROME" ] && [ -x "$c" ] && CHROME="$c"
done
[ -n "$CHROME" ] && echo "chrome: $CHROME" || echo "WARNING: no Chrome found; install Google Chrome or set CHROME_PATH"
node -e "import('playwright-core').then(()=>console.log('runner ok: $WORK/runner'))"
