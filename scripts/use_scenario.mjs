#!/usr/bin/env node
// use_scenario.mjs: load one scenario's routes (includeRoutes and "file" data resolved) into mock_server.mjs.
// For renderers that are not driven by shoot.mjs: a native app on a simulator or emulator, a Flutter or native
// snapshot test that calls the mock server over HTTP, or a manual look in a browser.
// Usage: node use_scenario.mjs <scenario.json | name> [--scenarios=DIR] [--mock-server=http://localhost:9999] [--lang=ar]
//        node use_scenario.mjs <scenario> --print      (print the resolved routes as JSON instead, for in-test stubs)
import fs from 'fs';
import path from 'path';
import { loadScenarioFile } from './routes.mjs';

const opt = {};
const pos = [];
for (const a of process.argv.slice(2)) {
  if (!a.startsWith('--')) { pos.push(a); continue; }
  const i = a.indexOf('=');
  if (i < 0) opt[a.slice(2)] = true; else opt[a.slice(2, i)] = a.slice(i + 1);
}
if (!pos.length) { console.error('usage: node use_scenario.mjs <scenario> [--scenarios=DIR] [--mock-server=URL] [--print]'); process.exit(1); }
const dir = path.resolve(opt.scenarios || 'scenarios');
const cand = [pos[0], `${pos[0]}.json`, path.join(dir, pos[0]), path.join(dir, `${pos[0]}.json`)].find((c) => fs.existsSync(c) && fs.statSync(c).isFile());
if (!cand) { console.error(`scenario not found: ${pos[0]}`); process.exit(1); }
const sc = loadScenarioFile(cand, { lang: opt.lang || 'en' });
if (opt.print) { console.log(JSON.stringify({ scenario: pos[0], routes: sc.routes }, null, 1)); process.exit(0); }
const ms = String(opt['mock-server'] || 'http://localhost:9999').replace(/\/$/, '');
const res = await fetch(`${ms}/__harness/routes`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ scenario: pos[0], routes: sc.routes }) });
if (!res.ok) { console.error(`mock server answered ${res.status}`); process.exit(1); }
console.log(`loaded ${sc.routes.length} routes for ${pos[0]} into ${ms}`);
