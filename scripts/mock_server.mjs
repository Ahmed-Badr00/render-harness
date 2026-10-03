#!/usr/bin/env node
// mock_server.mjs: a tiny HTTP backend that answers from the current scenario's routes.
// Use it when the app fetches data on the SERVER (Next.js getServerSideProps, React Server Components, Remix loaders,
// Nuxt server routes): those requests never reach the browser, so shoot.mjs cannot intercept them.
// 1. Start: node mock_server.mjs --port=9999
// 2. Point the app's server-side API base URL env var at http://localhost:9999 and start the app's dev server.
// 3. Shoot with: node shoot.mjs <scenarios> --mock-server=http://localhost:9999  (shoot PUTs each scenario's routes first)
// Unmatched requests return 404 JSON and are printed as MISS. Load routes by hand: PUT /__harness/routes {"routes":[...]}.
import http from 'http';
import { matchRoute, responseOf, CORS_PREFLIGHT, loadScenarioFile } from './routes.mjs';

const opt = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => { const i = a.indexOf('='); return i < 0 ? [a.slice(2), true] : [a.slice(2, i), a.slice(i + 1)]; }));
const port = Number(opt.port || 9999);
let state = { scenario: null, routes: [] };
// The mock server stands in for every API host, so a route's "host" is ignored here.
const noHost = (r) => { const { host, ...rest } = r; return rest; };
if (opt.scenario) { const sc = loadScenarioFile(opt.scenario); state = { scenario: opt.scenario, routes: sc.routes.map(noHost) }; }

const readBody = (req) => new Promise((res) => { let b = ''; req.on('data', (c) => { b += c; }); req.on('end', () => res(b)); });

http.createServer(async (req, res) => {
  const url = `http://localhost:${port}${req.url}`;
  const origin = req.headers.origin || '*';
  if (req.url.startsWith('/__harness/routes')) {
    if (req.method === 'PUT' || req.method === 'POST') {
      const body = JSON.parse((await readBody(req)) || '{}');
      state = { scenario: body.scenario || null, routes: (body.routes || []).map((r, i) => noHost({ ...r, id: r.id || `r${i}`, method: (r.method || 'GET').toUpperCase(), left: r.times })) };
      console.log(`[scenario] ${state.scenario || '(manual)'}: ${state.routes.length} routes`);
      res.writeHead(204); res.end(); return;
    }
    res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(state, null, 1)); return;
  }
  if (req.method === 'OPTIONS') { const p = CORS_PREFLIGHT(origin); res.writeHead(p.status, p.headers); res.end(); return; }
  const r = matchRoute(state.routes, req.method, url);
  if (!r) {
    console.log(`[MISS] ${req.method} ${req.url}`);
    res.writeHead(404, { 'content-type': 'application/json', 'access-control-allow-origin': origin }); res.end('{"error":"render-harness mock server: no route"}'); return;
  }
  if (r.hold) { console.log(`[hold ${r.id}] ${req.method} ${req.url}`); return; } // never answered: loading states
  if (r.delayMs) await new Promise((ok) => setTimeout(ok, r.delayMs));
  if (r.networkError) { req.socket.destroy(); return; }
  const out = responseOf(r, origin);
  console.log(`[hit ${r.id}] ${req.method} ${req.url} -> ${out.status}`);
  res.writeHead(out.status, out.headers); res.end(out.body);
}).listen(port, () => console.log(`render-harness mock server on http://localhost:${port}`));
