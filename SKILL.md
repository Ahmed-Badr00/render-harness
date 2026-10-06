---
name: render-harness
description: Render any app's REAL frontend code, whatever the stack (web apps such as Next.js, React, Vue, Nuxt, Angular, Svelte, Ionic; React Native; Flutter; native iOS SwiftUI/UIKit; native Android Compose/Views), feed it real backend JSON, and screenshot every UI state on many device profiles at once (iPhone SE to 17 Pro Max and Air, Samsung Galaxy S24/S25 and A-series, Pixel, tablets, foldables like iPhone Duo and Galaxy Fold including fold/unfold and Split View, desktop and MacBook sizes, Arabic/RTL, dark mode), then turn the shots into contact sheets, verified findings and an HTML/CSV report. Use it whenever the user wants to see, test, audit or compare screens across phones or devices, check how a backend or copy change looks in the app, catch edge-case layouts (long text, small screens, RTL), prepare for a new device, or "render the app without a simulator", even if they never say "harness".
---

# Render harness

Real app code + real backend data + many device profiles, for any frontend. One scenario JSON describes a screen state
(which screen or URL, the API responses, clicks). A renderer draws it on every device profile while every API call is
answered from the scenario, and writes PNGs in one shared layout, so contact sheets, review and the report work the
same for every stack. Hundreds of states render in minutes, so audits cover every state instead of the few a tester can
click to. Proven on a 446-state, 10-device audit of a large React Native app and on web apps.

Renderers (pick by stack, step 3):
- Browser (`scripts/shoot.mjs`, headless Chrome): web apps, React Native through react-native-web, Flutter web builds,
  Ionic/Capacitor, PWAs, webviews. Fastest; clicks and multi-step flows; no simulator.
- Native snapshot tests: Flutter golden tests, iOS swift-snapshot-testing, Android Paparazzi/Roborazzi. Exact device
  sizes, insets and traits without a device; data from the same scenario files.
- Simulator or emulator: the real app pointed at `scripts/mock_server.mjs`; slowest; confirms OS behaviour.

Fits: UI audits, device-compatibility projects (new phone sizes, foldables), before/after checks of a change, backend or
copy changes seen in the real UI, RTL and edge data, galleries of states for design or PM.
Not for: native-only views (maps, camera, video), animations and performance, OS-level behaviour (touch blocked by
system UI, real keyboards, system sheets). Those need a simulator or device; renders tell you where to look.

## Workflow
1. **Scope.** Which flows or screens, which devices (`scripts/devices.json` profiles and sets), which languages, light
   or dark, and where the output goes. Default work folder: `~/render-harness/<app>-<yyyymmdd>/`.
   Check that the app supports each language before planning a `--lang` pass: an i18n library or translation files,
   `lang`/`dir` set from state rather than hard coded, translated strings. If it does not (common for internal tools),
   `--lang=ar` changes nothing; render the app's real Arabic (or other script) DATA in the existing UI instead and say so.
2. **Bootstrap** the work folder (runner with playwright-core, using the system Chrome):
   `bash <SKILL>/scripts/bootstrap.sh <WORK>` creates `runner/ scenarios/ shots/ sheets/ findings/`.
3. **Detect the stack** and read the ONE matching reference:
   | Signal in the repo | Reference | Renderer |
   |---|---|---|
   | `package.json` with next, vite, react-scripts, vue, nuxt, @angular/core, svelte, @remix-run, solid-js, ember; Blazor WASM; Ionic/Capacitor/Cordova | `references/web.md` | browser, mode web |
   | `package.json` with `react-native` or `expo` (native screens) | `references/react-native.md` | browser, mode rn (react-native-web harness from `assets/rn-web/`) |
   | `pubspec.yaml` with `flutter` | `references/flutter.md` | browser (web build) or golden tests |
   | `*.xcodeproj` / `Package.swift` with SwiftUI or UIKit, no cross-platform layer | `references/native-ios.md` | snapshot tests or simulator |
   | `build.gradle(.kts)` with Compose or Android Views; Kotlin Multiplatform with Compose | `references/native-android.md` | Paparazzi/Roborazzi or emulator |
   Other stacks: if it can render in a browser, use the browser renderer; otherwise use the stack's screenshot-test tool
   and follow the output contract below.
4. **Get real data**: `references/backend-data.md`. Map each API prefix to the service behind it and dump from every
   service whose repo is on this machine, even when the main backend is not; build the rest from the frontend's types
   and its own fixtures, marked hand-built. Never invent shapes.
5. **Write scenarios** (format below), one per state, in `<WORK>/scenarios/<flow>/`.
6. **Shoot**: browser renderer `cd <WORK> && node runner/shoot.mjs <flow> --base=<url> --devices=phones,foldables --out=shots`
   (a folder name expands to its scenarios; avoid `<flow>/*`, which zsh expands against the wrong folder), then
   `--lang=ar`, `--color-scheme=dark` as scoped. Fix `api-miss` and `errors` first (see Rules). Each result line also
   flags `overflow=+Npx` (page wider than the device), `unreachable=...` (a click hit a control users cannot reach) and
   `zoom-carried=` (page zoom carried across a fold step); these are findings to verify, not harness noise. Other
   renderers: follow their reference and the output contract below.
7. **Review**: contact sheets, then verify every finding: `references/review-and-report.md`. For several flows, run one
   agent per flow with `assets/agent-brief.md`.
8. **Report**: dedupe findings into root-cause issues in `findings/issues.json`, then
   `python <SKILL>/scripts/report.py findings/issues.json --out report` (HTML + CSV). Give the user the paths.

## Scenario format
Comments below explain fields; real scenario files are plain JSON (see `assets/scenario.*.example.json`).
```jsonc
{
  "url": "/orders",                                  // web mode: path under --base
  "screen": "OrderDetails", "props": {"orderId": "X1"}, // rn mode instead of url ("stack": [{name, props, kind}] for several)
  "routes": [
    { "method": "GET", "path": "/v1/orders", "host": "api.example.com", "queryRegex": "page=1", "file": "data/orders.json" },
    { "method": "GET", "pathRegex": "^/v1/orders/[^/]+$", "data": { "...": "real backend JSON" } },
    { "method": "POST", "path": "/v1/orders/X1/cancel", "status": 400, "data": { "error": "..." }, "times": 1 },
    { "method": "GET", "path": "/v1/recs", "networkError": true },
    { "method": "*", "urlRegex": "^https://cdn\\.example\\.com/config", "delayMs": 3000, "body": "text", "contentType": "text/plain" },
    { "method": "GET", "path": "/v1/profile", "file": "data/{lang}/profile.json" },   // {lang} = --lang (en, ar...)
    { "method": "GET", "path": "/v1/feed", "hold": true }                             // never answers: loading/skeleton states
  ],
  "includeRoutes": ["orders/shared-routes"],         // other files' routes appended (auth, config)
  "storage": { "localStorage": {}, "sessionStorage": {}, "cookies": [{ "name": "session", "value": "fake" }] },
  "redux": {}, "featureFlags": [], "asyncStorage": {}, // rn mode: read by your providers.js / shims
  "init": "window.__FLAG__ = 1",                     // JS run before the app's own scripts
  "readyWhen": { "text": "Your orders" },           // or {selector}, {fn}, {networkIdle: false}; default: network idle
  "settleMs": 900,
  "boxes": ["[data-testid=more]", "nav"],            // record these elements' boxes per shot (annotate.py draws from them)
  "steps": [
    { "click": "Cancel order", "wait": 800, "shot": "cancel-error" },
    { "clickSelector": "[data-testid=more]" }, { "tap": [200, 40] }, { "type": "hello", "selector": "textarea" }, { "press": "Enter" },
    { "scroll": { "by": 600 } }, { "waitFor": { "text": "Done" } }, { "eval": "window.scrollTo(0, 0)" },
    { "click": "Show more", "shot": "expanded", "keepScroll": true },   // shoot where the click scrolled to (no paging)
    { "device": "duo-open-l", "wait": 600, "shot": "after-unfold", "pages": false }   // fold/unfold: resize mid-flow (keepZoom to keep Chrome's carried zoom)
  ],
  "devices": ["phones"], "pages": true, "standalone": false
}
```
- Routes match by method (`*` = any) and `path` (exact) or `pathRegex` or `urlRegex`, optional `host` and `queryRegex`;
  first match wins; `times` answers N times then falls through to the next match (a refreshed response after an action).
  Responses: `data` (JSON), `body` + `contentType`, or `file` (relative to the file that declares the route, the
  scenario or the included routes file; `.json` parsed). CORS preflight is answered automatically.
- `--devices` decides the devices, except for scenarios with a `device` step: those keep their own `devices` (a fold
  flow only makes sense from its start posture), so one command renders both.
- Step shots start from the top of the page (a click scrolls its target into view first); a step with `scroll` or
  `keepScroll` keeps the position.
- Clicks are checked for reachability first, after scrolling what a user can scroll: a target clipped by an
  `overflow: hidden` box, a fixed element off screen, a covered control, a tap that falls through to something that
  ignores it, or a dead tap zone is logged under `reach`, and later shots go in `harnessOnly`. The harness still clicks
  it so the rest of the flow renders (for a covered target it lifts the covering layers for that one click; a fixed
  element off screen cannot be clicked and the step fails). `--strict-reach` stops at the unreachable click instead.
  Review harness-only shots as "reachable only by the harness", and report the unreachable control itself.
- Unmatched API calls (fetch/XHR) get a 404 and are listed as `api-miss`; framework internals on the app's own origin
  (Next.js, Vite, webpack HMR) always pass. Use `--block=<regex>` for analytics and ads.
- Output: `shots/<device>/<flow>__<name>[__ar][__dark]-01.png` (first viewport), `-02.png`... (scrolled pages of the main
  scroller), `--<shot>-01.png` per step with `shot`, a `.log.json` (requests with matched route ids, misses, console
  errors, page errors, step errors, `layout` per shot with overflow, zoom and the elements that stick out, `reach`,
  `harnessOnly`, `boxes`, `zoomCarried`), and `shots/_runs/<time>.json` for the whole run. Fold steps write to
  `shots/<from>__to__<to>/`.

## Output contract (every renderer)
`shots/<device id>/<flow>__<scenario>[__<lang>][__dark][--<step>]-NN.png`, device ids from `scripts/devices.json`, `NN`
from 01 (first viewport, then scrolled pages). Native renderers get the device matrix as code from
`python <SKILL>/scripts/devices_export.py --devices <ids|sets> --format swift|kotlin|flutter|simctl` and the scenario's
resolved routes from `node runner/use_scenario.mjs <scenario> --print` (or load them into the mock server for a real app
on a simulator or emulator). Keep this layout and everything downstream works unchanged.

## Devices
`scripts/devices.json` holds profiles (CSS points, scale, platform, safe-area insets, system UI, crease, dead-tap zones,
`approx` for what was not measured, `source`) for iPhones from SE to 17 Pro Max and Air, Galaxy S24/S25 and their
Plus/Ultra, A-series, Pixel 7/9, Galaxy Fold, iPhone Duo (every posture and Split View), iPad mini, and desktop
(Windows 1366 to 2560 wide, MacBooks). Model names that share a screen are `aliases` (`iphone-16` renders as
`iphone-15`, `galaxy-s25-ultra` as `galaxy-s24-ultra`). Sets: `phones` (default matrix: SE, 15, 17 Pro Max, S24, S24
Ultra, Pixel 9), `ios`, `android`, `samsung`, `foldables`, `duo`, `tablets`, `desktop`, `mac`, `mobile`, `all`. Pass ids
or sets: `--devices=phones,duo,desktop-1920`. Desktop profiles browse as desktop Chrome with a mouse (no touch, desktop
user agent); use them for web apps. Web mode uses each device's visible browser page (`web.w` x `web.h`; on the iPhone Duo cover Safari keeps its controls
in the 84 pt side column, so the page is 382 x 580 on a 466 x 678 screen) and draws no system UI; rn mode and
`--standalone` use the full screen with the status bar, home indicator (iPhones only: the Duo has none), Duo capsule or
cluster drawn on top.
`--guides` draws safe areas, the crease and dead-tap zones for review. Add a device by measuring it on a simulator or
emulator (screen size in points, insets, where system UI sits); never guess numbers.

Other options: `--now=<ISO>` freezes the browser clock (relative dates match the data), `--tz`, `--locale`, `--dir`,
`--font-scale` (rn), `--no-pages`, `--max-pages`, `--scale` (smaller PNGs), `--workers` (default 2; keep total Chrome
workers at 3 to 4 per machine), `--mock-server=<url>` (server-side fetches, see `references/web.md`), `--strict-reach`,
`--dump [--eval=<expr>]` (print what each render shows, its errors and requests: the fastest way to debug a blank or
wrong screen), `--headed`.

## Rules that save hours
- A blank screen, a spinner forever or `api-miss` is almost always a missing route or prop, not an app bug: open the
  `.log.json` before anything else.
- Never edit the app's code or the user's checkout. Work in a clean export; harness changes live in the harness.
  Screenshots must reflect the code exactly as committed (record the commit).
- Before calling something a bug, climb the verification ladder (`references/review-and-report.md`): log, code
  (file:line), engine (Yoga for React Native layout), device (native-only behaviour).
- Dedupe by root cause: one issue per fix with all affected screens listed, not one issue per screenshot.
- Real data or traceable edits only; test and fixture data only, never real customer data; never real credentials (the
  user signs in themselves when recording).
- One `shoot.mjs` at a time per agent; never kill node or Chrome by pattern on a shared machine.
- If shoot.mjs prints "the skill changed since bootstrap", re-run `bootstrap.sh <WORK>` (scenarios and shots are kept).
- Unreleased screens stay private: ask before uploading or publishing anything.

## Files
- `scripts/bootstrap.sh`: work folder + runner (`--rn` adds the Yoga layout checker). `scripts/shoot.mjs`: the browser renderer. `scripts/routes.mjs`: route
  matching shared with `scripts/mock_server.mjs` (an HTTP backend that answers from the current scenario: server-side
  fetches, native apps on simulators or emulators). `scripts/use_scenario.mjs`: load a scenario into the mock server or
  print its resolved routes for in-test stubs. `scripts/devices.json`: profiles; `scripts/devices_export.py`: the same
  profiles as Swift, Kotlin, Flutter or simulator settings.
- `scripts/contact_sheet.py`: one sheet per state with a column per device (`--sequence`: one row per start device in
  capture order, for fold and multi-step flows). `scripts/annotate.py`: red boxes and labels for evidence, from numbers
  or from `boxes` selectors recorded in the logs. `scripts/report.py`: issues.json to report.html + issues.csv. Python scripts: run with
  `uv run --quiet --with pillow python ...` (report.py needs only the standard library).
- `assets/rn-web/`: react-native-web harness templates (webpack config, boot, navigation, shims, react-native-web patch,
  Yoga checker). `assets/scenario.web.example.json`, `assets/scenario.rn.example.json`, `assets/issues.example.json`,
  `assets/agent-brief.md`.
- `references/web.md`, `references/react-native.md`, `references/flutter.md`, `references/native-ios.md`,
  `references/native-android.md`, `references/backend-data.md`, `references/review-and-report.md`.
