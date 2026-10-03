// Shared route table logic for shoot.mjs (browser interception) and mock_server.mjs (server-side fetches).
// A route: { method, path | pathRegex | urlRegex, queryRegex?, host?, status?, data? | body? | file?, headers?, contentType?,
//            delayMs?, times?, networkError?, hold? }
// "file" may contain {lang} (data/{lang}/orders.json), filled from --lang, so one scenario serves every language.
// "hold": never answer (the request stays pending), for loading states and skeletons.
import fs from 'fs';
import path from 'path';

export function loadScenarioFile(file, opts = {}) {
  const sc = JSON.parse(fs.readFileSync(file, 'utf8'));
  const dir = path.dirname(file);
  // A route's "file" resolves next to the file that declares the route (the scenario or the included routes file).
  const routes = (sc.routes || []).map((r) => [r, dir]);
  for (const inc of sc.includeRoutes || []) {
    const incFile = resolveScenarioPath(inc, dir);
    routes.push(...(JSON.parse(fs.readFileSync(incFile, 'utf8')).routes || []).map((r) => [r, path.dirname(incFile), dir]));
  }
  sc.routes = routes.map(([r, d, fallback], i) => normalizeRoute(r, d, i, fallback, opts.lang || 'en'));
  return sc;
}

export function resolveScenarioPath(name, baseDir) {
  const cands = [name, `${name}.json`, path.join(baseDir, name), path.join(baseDir, `${name}.json`)];
  // includeRoutes may be written relative to the scenarios root (e.g. "orders/shared-routes")
  let up = baseDir;
  for (let i = 0; i < 4; i += 1) { up = path.dirname(up); cands.push(path.join(up, `${name}.json`)); }
  const hit = cands.find((c) => fs.existsSync(c) && fs.statSync(c).isFile());
  if (!hit) throw new Error(`scenario or include not found: ${name}`);
  return hit;
}

function normalizeRoute(r, dir, i, fallbackDir, lang = 'en') {
  const out = { ...r, id: r.id || `r${i}`, method: (r.method || 'GET').toUpperCase() };
  if (out.file) {
    const rel = out.file.replace(/\{lang\}/g, lang);
    let f = path.isAbsolute(rel) ? rel : path.join(dir, rel);
    if (!fs.existsSync(f) && fallbackDir) f = path.join(fallbackDir, rel);
    if (!fs.existsSync(f)) throw new Error(`route ${out.id}: file not found: ${rel}${rel !== out.file ? ` (from ${out.file} with --lang=${lang})` : ''}`);
    const txt = fs.readFileSync(f, 'utf8');
    if (/\.json$/i.test(f)) out.data = JSON.parse(txt); else out.body = txt;
    delete out.file;
  }
  if (out.times !== undefined) out.left = out.times;
  return out;
}

export function urlMatches(r, urlStr) {
  const u = new URL(urlStr);
  if (r.host && r.host !== u.host) return false;
  let ok = false;
  if (r.path) ok = r.path === u.pathname;
  else if (r.pathRegex) ok = new RegExp(r.pathRegex).test(u.pathname);
  else if (r.urlRegex) ok = new RegExp(r.urlRegex).test(urlStr);
  if (!ok) return false;
  return !r.queryRegex || new RegExp(r.queryRegex).test(u.search.replace(/^\?/, ''));
}

// First route that matches method + URL and still has answers left ("times"); consumes one answer.
export function matchRoute(routes, method, urlStr) {
  for (const r of routes) {
    if (r.left !== undefined && r.left <= 0) continue;
    if (r.method !== '*' && r.method !== method) continue;
    if (!urlMatches(r, urlStr)) continue;
    if (r.left !== undefined) r.left -= 1;
    return r;
  }
  return null;
}

export function responseOf(r, origin) {
  const body = r.data !== undefined ? JSON.stringify(r.data) : r.body !== undefined ? String(r.body) : '';
  const headers = {
    'content-type': r.contentType || (r.data !== undefined ? 'application/json' : 'text/plain'),
    'access-control-allow-origin': origin || '*',
    'access-control-allow-credentials': 'true',
    ...(r.headers || {}),
  };
  return { status: r.status || 200, headers, body };
}

export const CORS_PREFLIGHT = (origin) => ({
  status: 204,
  headers: {
    'access-control-allow-origin': origin || '*',
    'access-control-allow-credentials': 'true',
    'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    'access-control-allow-headers': '*',
    'access-control-max-age': '600',
  },
  body: '',
});
