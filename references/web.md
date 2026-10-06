# Web apps (Next.js, React with Vite or CRA, Vue, Nuxt, Angular, SvelteKit, Remix, Solid, Ember, Blazor WebAssembly)

Also for anything else that renders in a browser engine: Ionic, Capacitor and Cordova apps (their `www`/`dist` build or
dev server; use `--standalone`, since they run full screen inside the native shell), PWAs, Electron renderer windows
(serve the renderer bundle), and webviews embedded in native apps (open the webview's URL with `--standalone`).

The app runs on its own dev server; shoot.mjs drives Chrome at each device's mobile browser viewport and answers every
API call from the scenario. No harness code goes into the app.

## Contents
1. Run the app
2. Find what to mock
3. Client-side vs server-side data (the one thing that bites)
4. Auth, flags, language
5. Device behaviour on the web
6. Troubleshooting

## 1. Run the app
- Prefer a clean copy so the user's checkout and build caches stay untouched: `git archive <ref> | tar -x -C $WORK/app`,
  then install with the repo's package manager and lockfile (`npm ci`, `yarn --frozen-lockfile`, `pnpm i --frozen-lockfile`).
  If that manager is not installed and there is no corepack, run it through npx at the lockfile's version:
  `yarn.lock` starting with `# yarn lockfile v1` means `npx --yes yarn@1 install --frozen-lockfile`, one with
  `__metadata:` means yarn berry (`npx --yes yarn@4 install --immutable`), `pnpm-lock.yaml` means `npx --yes pnpm@<major> i --frozen-lockfile`.
  For monorepos (turbo, nx, workspaces) install at the root and start only the target app
  (`yarn turbo dev --filter=<app>`, `pnpm --filter <app> dev`, `npx nx serve <app>`).
- Running in the user's checkout is acceptable only for a quick look and only with their OK (dev servers write caches
  such as `.next/`).
- Read `README`, `package.json` scripts, `.env.example`, `next.config.*` / `vite.config.*` for the start command, the port,
  required env vars and the API base URL variable. Fill required env vars with harmless fake values; point every API
  base URL at a host the scenarios will match (any host works for browser calls; server-side calls need step 3).
- Start it in the background and wait for "ready" / "compiled" before shooting. Note the URL for `--base`.
  Prefer the framework CLI with an explicit port over plain HTTP (`node_modules/.bin/next dev -p 3456`,
  `npx vite --port 5173`) when the repo's dev script adds HTTPS, a custom host name or a proxy that needs a hosts entry
  or certificate. Stop the server by its PID when done.

## 2. Find what to mock
- Read the API client (axios instance, fetch wrapper, React Query / SWR hooks, Apollo or urql for GraphQL, tRPC) to list
  endpoints per screen, then shoot once with no routes: `api-miss=` lists every call the page made. Add routes until no
  miss you care about remains.
- Same-origin calls (`/api/...`, Next.js route handlers, a BFF) can be mocked like any other route; framework internals
  (`/_next/`, Vite HMR, RSC `?_rsc=` fetches) are never touched.
- GraphQL: one URL, many operations. Use `"method": "POST", "path": "/graphql"` with a `queryRegex` only if the operation
  name is in the URL; otherwise give each operation a separate scenario step or use `"times"` in call order. Read the
  operation names from the client code.
- Third-party scripts (analytics, chat widgets, ads) slow pages and add noise: `--block='google-analytics|hotjar|intercom'`.

## 3. Client-side vs server-side data (the one thing that bites)
Browser interception only sees requests made BY THE BROWSER. Data fetched on the server (Next.js `getServerSideProps`,
`getStaticProps`, app-router Server Components, route handlers that call the backend, Remix loaders, Nuxt `useAsyncData`
on the server, SvelteKit `+page.server.ts`) never reaches the browser.
- Detect it: the page renders data although `requests` in the log show no API call, or it shows an error page while the
  log is clean. Search the page code for `getServerSideProps`, `async function Page`, `"use server"`, `fetch(` in server
  files, `loader`.
- Fix: run `node $WORK/runner/mock_server.mjs --port=9999`, start the app with its server-side API base URL env var
  pointing at `http://localhost:9999`, and shoot with `--mock-server=http://localhost:9999`. shoot.mjs loads each
  scenario's routes into the mock server before navigating (workers forced to 1 so scenarios do not mix). The same routes
  then answer both the server and the browser. The mock server ignores a route's `host` (every request arrives at its
  own address), so match on path and query there.
- If the server builds absolute URLs from a hard-coded host (no env var), the cleanest option is still an env override
  in the clean copy's `.env.local`; never edit app source.

## 4. Auth, flags, language
- Auth: never real credentials. Seed what the app checks with fake values via `storage` (cookies, localStorage,
  sessionStorage) and mock the session endpoint it calls (`/api/auth/session` for NextAuth, `/me`, `/userinfo`, token
  refresh). If middleware redirects to login on the server, the server-side check needs the mock server or a dev bypass
  env var the repo already supports.
- Feature flags and experiments: mock the flags endpoint, or seed the storage key the flag SDK reads.
- Language and RTL are app decisions on the web: set them the way the app does (URL prefix `/ar/`, a `lang` cookie,
  `Accept-Language`, a query param). `--lang` only sets the browser locale and Accept-Language header.
- Dates: `--now` freezes `Date` in the browser only; server-rendered dates use the server clock (set `TZ` and, if the app
  supports it, a fake-time env var).

## 5. Device behaviour on the web
- Default web mode uses the visible page inside the mobile browser (`devices.json` `web.w` x `web.h`; Safari or Chrome UI
  takes the rest) and draws no system UI, because the page never sits under the notch in a normal browser tab. On the
  iPhone Duo cover Safari puts its controls in the 84 pt side column, so pages get 382 x 580 there (measured on the
  Xcode 27.1 simulator); a page that assumes it fills the 466 pt screen is a real finding.
- `--standalone` renders at the full screen height with system UI drawn: use it for PWAs with
  `viewport-fit=cover`, in-app webviews and kiosk displays. `env(safe-area-inset-*)` stays 0 in headless Chrome, so a
  page that relies on it looks unpadded under the drawn status bar: that is the harness, not the app. Confirm such
  findings on a simulator.
- Mobile user agents and touch are on (`isMobile`, `hasTouch`): apps that branch on the user agent or `pointer: coarse`
  get the mobile path. Hover-only UI is a real finding on touch profiles.
- Foldables in the browser: the viewport changes size on fold and unfold; a `{"device": "..."}` step simulates it (the
  page gets a resize event, no reload). The device posture APIs (`navigator.devicePosture`, viewport segments) are not
  emulated. Chrome keeps the page zoom across that resize; shoot.mjs resets it to 1 (what a fresh load gets) and logs
  the carried value as `zoom-carried`. Whether a real browser keeps that zoom is NEEDS DEVICE.
- Desktop layouts on phones: the `overflow=+Npx` flag and each log's `layout` entry name the elements that stick out
  (`outermost` is usually the fixed width or `min-width` to fix). Under emulation the page renders at zoom 1 and is cut
  at the device edge, and `position: fixed` sheets anchor to the widened layout; a real phone may zoom out or let the
  user pan instead. The cause (fixed widths) is confirmed by the render; how the phone presents it is NEEDS DEVICE.
- Reachability: a page wider than the screen often hides controls behind `overflow: hidden` columns. The `reach` log
  names them; the step shots after such a click show a state users cannot get to (`harnessOnly`).

## 6. Troubleshooting
| Symptom | Cause and fix |
|---|---|
| page shows real-looking data but `requests` is empty | server-side fetch: section 3 |
| redirect to /login | auth checked on the server or a missing session route: section 4 |
| `api-miss` on `/_next/...` or HMR | never happens by design; if your framework uses another internal path, pass `--passthrough=<regex>` |
| CORS error in console | route matched but the app sends credentials to another host: check the route's `host` and that the request is matched (preflight is answered automatically) |
| blank page, hydration error | server HTML and client data differ: mock the same data on both sides (mock server) |
| fonts look different | web fonts blocked by `--block` or offline: let font hosts through |
