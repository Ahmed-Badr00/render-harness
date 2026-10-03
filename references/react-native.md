# React Native apps: render the real code with react-native-web

Proven on a large production RN app (React Native 0.8x, react-native-navigation, redux, EStyleSheet, 400+ screens):
446 states x 10 device profiles rendered with no simulator. Expect 30 to 90 minutes for the first boot of a big app
(most of it the boot loop in step 5), minutes for every later scenario.

## Contents
1. Look for an existing harness first
2. Build the workspace
3. Add the harness from the templates
4. Adapt providers and registry
5. The boot loop: crash, stub, retry
6. Fonts and images
7. Platform, RTL, dark mode, font scale, folds
8. What is real and what is emulated
9. Troubleshooting

## 1. Look for an existing harness first
Search the repo and its siblings before building one: `grep -rl "react-native-web" --include=webpack.config.js`, folders
named `*render-harness*`, `storybook` with `react-native-web`, or an Expo `web` target (`npx expo start --web` already
renders RN on web: then treat the app as a web app, see `web.md`, and use mode rn only for screens Expo web cannot reach).
If one exists, reuse it and only add `window.__HARNESS__` support (device size, insets, platform, lang) so shoot.mjs
profiles apply.

## 2. Build the workspace
Never work in the user's checkout: the harness needs extra dependencies and patched node_modules.
```bash
WORK=~/render-harness/<app>-<yyyymmdd>            # or a session scratchpad for throwaway work
bash <SKILL>/scripts/bootstrap.sh $WORK            # runner + scenarios/ shots/ sheets/ findings/
git -C <APP_REPO> archive <ref> | tar -x -C $WORK/app    # or list only the source folders + package files to keep it small
git -C <APP_REPO> rev-parse --short <ref> > $WORK/app/.commit
```
`<ref>` is the local HEAD unless the user names a branch. Do not `git fetch` in the user's checkout (it writes to their
`.git`); if they want the latest remote code, ask them to fetch, or clone into the work folder.
Also run `bash <SKILL>/scripts/bootstrap.sh $WORK --rn` once: it puts `yoga_check.mjs` with `yoga-layout` and
`fontkit` into `$WORK/runner/` for step 8 (never install them into the app workspace).

Install (yarn 1 example; use the repo's package manager and lockfile; with no yarn and no corepack, run
`npx --yes yarn@1 ...` for a `# yarn lockfile v1` lockfile):
1. Drop dependencies that cannot install outside CI (private git URLs, internal registries you cannot reach) from
   `package.json`, and stub them later (step 5).
2. Add dev deps: `react-dom` at EXACTLY the app's `react` version, `react-native-web`, `webpack@5`, `webpack-cli`,
   `webpack-dev-server`, `html-webpack-plugin`, `babel-loader`, `@svgr/webpack` (if the app imports `.svg`),
   `babel-plugin-module-resolver` (if babel uses it), `buffer`, `process`, `util`, `events`.
3. `yarn install --ignore-scripts --ignore-engines` (native build scripts are useless here), then `npx patch-package`
   if the app has `patches/`.
4. Density-only images: Metro resolves `require('./x.png')` to `x@3x.png`; webpack needs the plain file. Copy the densest
   variant to the base name for every `*@[123]x.(png|webp|jpg)` without a base file.
5. Never run `yarn add` or `yarn install` in the workspace again: it re-extracts packages and silently wipes patches.
   Need a new package? Build a new workspace.

## 3. Add the harness from the templates
```bash
cp -R <SKILL>/assets/rn-web $WORK/app/harness
cd $WORK/app && patch -p1 --forward < harness/patches/react-native-web+0.21.2.patch   # if react-native-web is 0.21.2
```
The patch makes react-native-web match native layout in three places: RTL left/right style swap like RN
`doLeftAndRightSwapInRTL` with textAlign flip, `flex: 0` sized by content like Yoga (CSS treats it as `0 1 0%`), and the RN
`direction` style. For another react-native-web version, re-apply the same three edits by hand (the patch file shows
the exact lines) and check them before trusting any RTL or flex finding.

Files you get (`$WORK/app/harness/`):
- `webpack.config.js`: aliases react-native to the shim, stubs native-only packages, transpiles RN packages shipped as
  source, reads the app's babel module-resolver aliases, serves `$WORK/scenarios` for manual browsing.
- `src/entry.js`: reads `window.__HARNESS__` (shoot.mjs injects device, platform, lang, dir, dark, fontScale, scenario),
  sizes `#root`, installs the Yoga text-wrap clamp, then boots.
- `src/app.js`: renders the scenario's `screen` or `stack` with live navigation (push, modal, overlay render on top;
  covered screens stay mounted). Passes RNN props (`componentId`) and react-navigation props (`navigation`, `route`,
  plus the contexts so `useNavigation()` works).
- `src/registry.js`, `src/providers.js`: the only files you adapt (step 4).
- `shims/`: react-native (platform, PixelRatio, Appearance, I18nManager from the profile, `adjustsFontSizeToFit`
  emulation, codegen passthroughs), safe-area (profile insets, live on fold steps), navigation, async-storage (seeded
  from `scenario.asyncStorage`), default-preference (seeded from `scenario.defaultPreference`), Sentry (HOCs pass
  through), device-info, localize, gesture handler, fast-image, linear-gradient, maps, video, webview, lottie, blur
  (visible placeholders for native views), and `react-native-libweb.js` (reanimated and worklets see `Platform.OS ===
  'web'` so they run their web implementation).
- `patches/optional/react-native-reanimated-class-ref-web.patch`: for reanimated 4 when animated styles on a class
  component stay frozen at their first value (two titles overlapping at half opacity is the typical look). Apply with
  `patch -p1 --forward` after checking the file path matches the installed version.
- `bin/restart_server.sh`, `bin/yoga_check.mjs` (native layout ground truth, step 8).

Start it: `$WORK/app/harness/bin/restart_server.sh` (first compile 1 to 3 minutes; log in `harness/devserver.<port>.log`).
It stops only the server it started; if another process holds the port it refuses and names a free one
(`HARNESS_PORT=<n>`).

Debugging a blank or wrong screen: `node $WORK/runner/shoot.mjs <scenario> --base=<harness url> --devices=iphone-15
--dump [--eval='<expr>']` prints the visible text, app errors, requests and an expression's value for each render.

## 4. Adapt providers and registry
Read the app's entry (`index.js`, `App.tsx`, `registerScreens`, navigation setup) and copy its provider tree into
`providers.js`: store with the real reducers (preload `scenario.redux` over the initial state), theme and stylesheet
builders, i18n set to `h.lang`, feature flags from `scenario.featureFlags`, query clients, portal hosts. Use the app's
own modules; replace only what needs a native runtime. Preload partial redux slices with the template's `deepMerge`
(a slice passed straight to `createStore` replaces the whole slice). Look for static singletons too: an app that reads
`App.store`, a global theme manager or a config object outside React needs those set in `beforeBoot`, or the screen
silently falls back to defaults. If the app wraps screens in its own HOC (navigation wrapper, error boundary, analytics),
register screens through that same wrapper so they get the props they get on the device.

In `registry.js` map screen names to lazy requires of the real components, using the names the app navigates with, so
in-app pushes land on real screens. Keep them lazy: screens often read themes, i18n or `Dimensions` at module load, which
must happen after the harness has set the device size and the providers' boot.

Props: give each scenario exactly what the caller passes (read the screen's props type and the code that navigates to
it). A missing prop is the most common cause of a crash that looks like an app bug.

## 5. The boot loop: crash, stub, retry
Shoot a smoke scenario; on `BOOT FAILED` or a blank screen open the `.log.json` (`pageErrors`, `appErrors`):
- `X is not a function` / `Cannot read properties of undefined` inside a native package: add it to `STUBBED` in
  webpack.config.js (Proxy stub where every property is a no-op), or write a small shim when the app uses its return
  value (copy one from `shims/`).
- `Module not found: ... react-native/Libraries/...`: already stubbed by the replacement plugin; if a package needs a real
  value from there, shim that package instead.
- `Module not found` for an image or font: density copies (step 2.4) or the font folder (step 6).
- Syntax error inside `node_modules/<pkg>`: the package ships untranspiled RN source: add it to `TRANSPILE`.
- `Element type is invalid ... got: undefined`: a factory or HOC from a stubbed package returned undefined (the Proxy
  stub returns undefined when called). Give that package a shim whose factories return components (see `sentry.js`,
  `codegen-native.js`, `native-component-registry.js`).
- Blank screen with no errors at all: a Provider from a stubbed package renders nothing. Check the stubs used around
  the screen (the template guards `@react-navigation/native`; do the same for others), then use `--dump`.
- `Cannot read properties of undefined (reading 'loadUnpackersWithCode')` or similar inside reanimated or worklets:
  native code picked over web code; keep `.native` out of `resolve.extensions` and the `react-native-libweb.js` rule.
- `Maximum update depth exceeded`: a shim passing new callback or source objects on every render into a component whose
  effect depends on them (fixed in `fast-image.js`; copy its pattern into other shims).
- Webpack heap out of memory: someone added a dynamic `import(\`...${x}\`)` or a `require.context` over the app; never.
- Infinite spinner: a request the screen waits for is unmatched (see `misses`) or a native promise never resolves (shim
  it to resolve).
Each fix is a harness change, not an app change. Keep a list of stubs in the findings header: anything stubbed is not
tested.

## 6. Fonts and images
Generate `harness/fonts.css` from the app's font files so text measures like the device. Apps name fonts two ways,
so emit both kinds of face:
- by file or PostScript name (`fontFamily: 'Figtree-SemiBold'`): one face per file, `font-family` = the file base name;
- by family plus weight (`fontFamily: 'Figtree', fontWeight: '600'`, iOS font matching): one face per file with
  `font-family` = the family and `font-weight`/`font-style` from the file name (Thin 100, ExtraLight 200, Light 300,
  Regular 400, Medium 500, SemiBold 600, Bold 700, ExtraBold 800, Black 900; Italic sets `font-style: italic`).
```bash
cd $WORK/app && for f in $(ls ios/Fonts/*.{ttf,otf} assets/fonts/*.{ttf,otf} android/app/src/main/assets/fonts/*.{ttf,otf} 2>/dev/null); do
  n=$(basename "${f%.*}"); fam=${n%%-*}; st=${n#*-}; [ "$st" = "$n" ] && st=Regular
  w=400; case "$st" in *ExtraLight*|*UltraLight*) w=200;; *Thin*) w=100;; *Light*) w=300;; *SemiBold*|*DemiBold*) w=600;; *ExtraBold*|*UltraBold*) w=800;; *Bold*) w=700;; *Medium*) w=500;; *Black*|*Heavy*) w=900;; esac
  i=normal; case "$st" in *Italic*) i=italic;; esac
  echo "@font-face{font-family:'$n';src:url('/app-fonts/$(basename "$f")')}"
  echo "@font-face{font-family:'$fam';font-weight:$w;font-style:$i;src:url('/app-fonts/$(basename "$f")')}"
done > harness/fonts.css
```
Then add the font folder to `devServer.static` with `publicPath: '/app-fonts'`. Product images load from their real CDN
URLs in the data; placeholder or internal URLs that 404 can trigger image retry loops: swap them for a real public image.

## 7. Platform, RTL, dark mode, font scale, folds
- Platform comes from the profile (`--devices=pixel-7` is Android: `Platform.OS === 'android'`). Webpack prefers `.ios.*`
  files; for screens with `.android.*` variants run a second server with `HARNESS_PLATFORM_EXT=android HARNESS_PORT=8788`.
- `--lang=ar` sets `I18nManager.isRTL`, the RTL style swap and `h.lang` for i18n; Arabic also needs Arabic backend data
  (dump with the Arabic locale header).
- `--color-scheme=dark` drives `useColorScheme` and `Appearance`; `--font-scale=1.3` drives `PixelRatio.getFontScale`
  (only for code that reads it; RN text scaling itself is not emulated).
- Folding: a `{"device": "duo-open-l"}` step resizes the window mid-scenario, like unfolding. Code that reads
  `Dimensions` or insets at module load keeps the old values, exactly as on the device: that is a real finding.

## 8. What is real and what is emulated
- Real: all app JS (components, hooks, selectors, store, i18n strings, themes, fonts), layout through react-native-web,
  backend data when dumped.
- Emulated: Platform, device size and insets, system UI (drawn by shoot.mjs), RTL swap, navigation (in-page stack), Yoga
  text wrapping (entry.js clamp: children of rows, and children of columns that are not stretched, are measured at most
  the parent width like Yoga), `adjustsFontSizeToFit` (font stepped down to `minimumFontScale`).
- Not reproduced: native views (maps, video, camera, webview, lottie render as labelled placeholders), animations
  (shots catch the current frame), shadows and blur (approximate), Android font padding and elevation, gestures that
  need native touch handling, OS sheets and alerts (`Alert.alert` is a no-op unless you shim it to render).
- Known CSS vs RN differences the template already covers: `flexShrink` defaults to 0 in RN but 1 in CSS, which
  collapses `react-native-svg` icons in tight rows (`#root svg{flex-shrink:0}` in the HTML template); a column with
  `alignItems: 'center'` lets single-line text overflow in CSS while Yoga truncates it (clamp). When a render looks like
  overflow or truncation, still confirm with Yoga.
- Layout claims (wrap, overflow, truncation, clipping) can differ between CSS and Yoga. Confirm with the ground truth:
  `FONT_DIR=<app font folder> node harness/bin/yoga_check.mjs spec.json` (spec format in the file header) using the
  exact style values from the code. If it disagrees with the render, trust Yoga and mark the render a harness artifact.

## 9. Troubleshooting
| Symptom | Cause and fix |
|---|---|
| `api-miss=GET /...` | add a route (or ignore if irrelevant to the screen) |
| grey "Navigated to X" | X is not in registry.js: add it |
| `BOOT FAILED` in the PNG | read the stack: missing provider, missing prop, native module (step 5) |
| buttons render as bare text, wrong colors | theme or stylesheet builder not run before the screen module loaded (lazy registry, providers order) |
| everything LTR in Arabic | react-native-web patch missing or `I18nManager` imported from somewhere other than react-native |
| `EADDRINUSE` or "port is used by PID" | another process holds 8787: `HARNESS_PORT=<the free port it names>` |
| title and subtitle overlap at half opacity | reanimated animated style frozen on a class component: optional patch (step 3) |
| a loading or skeleton state cannot be shot | use a `"hold": true` route (shoot.mjs skips the network-idle wait); a long `delayMs` hits the app's own request timeout and renders the error path instead |
| Arabic needs other data | `"file": "data/{lang}/x.json"` serves `data/ar/x.json` with `--lang=ar`; no duplicate scenarios |
| render differs after a reinstall | patches wiped by yarn: new workspace |
