#!/usr/bin/env node
// shoot.mjs: render scenarios on device profiles in headless Chrome with a mocked backend, save PNGs + logs.
// Works for any web-rendered frontend: a web app's dev server (mode web) or a react-native-web harness page (mode rn).
//
// Usage: node shoot.mjs <scenario | dir | dir/*> [...] [options]
//   --base=http://localhost:3000   app (web) or harness (rn) URL
//   --scenarios=DIR                scenario root (default ./scenarios); names are paths under it without .json
//   --devices=iphone-15,pixel-7    profile ids or set names from devices.json (phones, foldables, duo, all...)
//   --lang=ar  --locale=ar-AE  --dir=rtl   language hints (rn harness reads them; web apps decide RTL themselves)
//   --color-scheme=dark            prefers-color-scheme (RN harness reads it too)
//   --now=2026-10-01T10:00:00+04:00 --tz=Asia/Dubai   freeze the clock so relative dates match the data
//   --out=DIR  --no-pages  --max-pages=8  --scale=N  --workers=2
//   --no-chrome (do not draw status bar / home indicator)  --guides (draw safe areas, crease, dead-tap zones)
//   --mode=web|rn  --root=#root     rn is auto when the scenario has "screen" or "stack"
//   --standalone                   web app shown full screen (PWA with viewport-fit=cover, in-app webview): full height + system chrome.
//                                  Default web mode uses the browser's visible height (devices.json web.h) and draws no system UI.
//   --mock-server=http://localhost:9999   also load routes into mock_server.mjs (for server-side fetches; forces workers=1)
//   --block=REGEX  --passthrough=REGEX  --unmatched=404|passthrough   request policy for API calls
//   --strict-reach                 fail a click step when a user could not reach the target (default: log it and click anyway)
//   --dump                         print each render's visible text, app errors and requests (debug a blank or wrong screen)
//   --eval=EXPR                    with --dump: also print the result of a JS expression in the page
//   --chrome-path=PATH (or CHROME_PATH)  --headed
// Pass a scenario folder name (orders) rather than orders/*: zsh expands the glob against the wrong folder.
import { chromium } from 'playwright-core';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import { loadScenarioFile, matchRoute, urlMatches, responseOf, CORS_PREFLIGHT } from './routes.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const opt = {};
const pos = [];
for (const a of process.argv.slice(2)) {
  if (!a.startsWith('--')) { pos.push(a); continue; }
  const i = a.indexOf('=');
  if (i < 0) opt[a.slice(2)] = true; else opt[a.slice(2, i)] = a.slice(i + 1);
}
if (!pos.length) { console.error(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\nimport')[0]); process.exit(1); }

const DEV = JSON.parse(fs.readFileSync(path.join(HERE, 'devices.json'), 'utf8'));
// bootstrap.sh records which skill the runner was copied from; warn when the skill has changed since.
try {
  const meta = JSON.parse(fs.readFileSync(path.join(HERE, '.skill.json'), 'utf8'));
  const md5 = (f) => (fs.existsSync(f) ? crypto.createHash('md5').update(fs.readFileSync(f)).digest('hex') : '');
  const stale = meta.files.filter((f) => md5(path.join(meta.skill, 'scripts', f)) && md5(path.join(meta.skill, 'scripts', f)) !== md5(path.join(HERE, f)));
  if (stale.length) console.warn(`NOTE: the skill changed since bootstrap (${stale.join(', ')}); re-run bootstrap.sh on this work folder to update the runner.`);
} catch (e) { /* not bootstrapped by bootstrap.sh */ }
const expandDevices = (s) => String(s).split(',').filter(Boolean).flatMap((d) => DEV.sets[d] || [d]);
const scenDir = path.resolve(opt.scenarios || 'scenarios');
const outDir = path.resolve(opt.out || 'shots');
const base = String(opt.base || 'http://localhost:3000').replace(/\/$/, '');
const baseOrigin = new URL(base).origin;
const lang = opt.lang || 'en';
const dir = opt.dir || (['ar', 'he', 'fa', 'ur'].includes(lang) ? 'rtl' : 'ltr');
const locale = opt.locale || (lang === 'en' ? 'en-US' : lang);
const dark = opt['color-scheme'] === 'dark';
const mockServer = opt['mock-server'] ? String(opt['mock-server']).replace(/\/$/, '') : null;
const workers = mockServer ? 1 : Math.max(1, Number(opt.workers || 2));
const maxPages = opt['no-pages'] ? 1 : Number(opt['max-pages'] || 8);
// Framework internals on the app's own origin are never mocked (Next.js, Vite, webpack dev server, RN harness assets).
const FRAMEWORK = /\/_next\/|__nextjs|[?&]_rsc=|\/@vite\/|\/@fs\/|\/@react-refresh|\/node_modules\/\.vite|__webpack_hmr|sockjs-node|hot-update\.|\/__harness\//;

function findChrome() {
  return ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((p) => fs.existsSync(p));
}
const chromePath = opt['chrome-path'] || process.env.CHROME_PATH || findChrome();
if (!chromePath) { console.error('No Chrome found. Install Google Chrome or pass --chrome-path / CHROME_PATH.'); process.exit(1); }

function expand(arg) {
  const abs = path.isAbsolute(arg) ? arg : path.join(scenDir, arg);
  const target = arg.endsWith('/*') ? abs.slice(0, -2) : abs;
  const isDir = (p) => fs.existsSync(p) && fs.statSync(p).isDirectory();
  if (isDir(target)) {
    return fs.readdirSync(target).filter((f) => f.endsWith('.json') && !f.startsWith('_') && !/shared/i.test(f)).sort().map((f) => path.join(target, f));
  }
  for (const c of [abs, `${abs}.json`, arg, `${arg}.json`]) if (fs.existsSync(c) && fs.statSync(c).isFile()) return [path.resolve(c)];
  throw new Error(`scenario not found: ${arg} (scenario root ${scenDir})`);
}
const nameOf = (f) => { const rel = path.relative(scenDir, f); return (rel.startsWith('..') ? path.basename(f) : rel).replace(/\.json$/, ''); };

// ---------- device chrome drawn over the page (system UI is physical: it does not mirror in RTL) ----------
const viewH = (d, full) => (full ? d.h : d.web?.h ?? d.h);
function chromeSpec(id, full) {
  const d = DEV.devices[id];
  return { id, w: d.w, h: viewH(d, full), chrome: opt['no-chrome'] || !full ? [] : d.chrome || [], insets: full ? { top: 0, bottom: 0, left: 0, right: 0, ...(d.insets || {}) } : { top: 0, bottom: 0, left: 0, right: 0 },
    crease: d.crease ? (d.crease.axis === 'y' && !full ? { ...d.crease, at: d.crease.at - (d.h - viewH(d, full)) } : d.crease) : null, taps: full ? d.taps || [] : [], guides: !!opt.guides, dark };
}
function drawChrome(s) {
  document.getElementById('__rh_chrome')?.remove();
  const ink = s.dark ? '#fff' : '#000';
  const root = document.createElement('div');
  root.id = '__rh_chrome';
  root.setAttribute('aria-hidden', 'true');
  root.style.cssText = `position:fixed;left:0;top:0;width:${s.w}px;height:${s.h}px;pointer-events:none;z-index:2147483647;font-family:-apple-system,'SF Pro Text',Roboto,Helvetica,sans-serif;color:${ink}`;
  const add = (css, html = '') => { const e = document.createElement('div'); e.style.cssText = `position:absolute;${css}`; e.innerHTML = html; root.appendChild(e); return e; };
  const wifi = (sz, c) => `<svg width="${sz}" height="${sz}" viewBox="0 0 40 40"><path d="M8 30a16 16 0 1 1 24 0" fill="none" stroke="${c}" stroke-width="3.4" stroke-linecap="round"/><path d="M14 18.5a9 9 0 0 1 12 0M16.7 21.6a5 5 0 0 1 6.6 0" fill="none" stroke="${c}" stroke-width="2.6" stroke-linecap="round"/><circle cx="20" cy="25" r="1.9" fill="${c}"/></svg>`;
  const icons = (c) => `<svg width="66" height="12" viewBox="0 0 66 12"><g fill="${c}"><rect x="0" y="8" width="3" height="4" rx="1"/><rect x="5" y="5.5" width="3" height="6.5" rx="1"/><rect x="10" y="3" width="3" height="9" rx="1"/><rect x="15" y="0.5" width="3" height="11.5" rx="1"/><path d="M30 3.5a9 9 0 0 1 12 0l-1.4 1.5a7 7 0 0 0-9.2 0zM32.8 6.5a5 5 0 0 1 6.4 0L36 10z"/><rect x="47" y="1" width="16" height="10" rx="2.5" fill="none" stroke="${c}" stroke-opacity=".5"/><rect x="49" y="3" width="12" height="6" rx="1.2"/><rect x="64" y="4" width="1.5" height="4" rx=".7" fill-opacity=".5"/></g></svg>`;
  const time = (css, size = 15) => add(`${css};font-weight:600;font-size:${size}px;letter-spacing:-0.2px`, '9:41');
  for (const k of s.chrome) {
    if (k === 'ios-island') { add(`left:${s.w / 2 - 63}px;top:11px;width:126px;height:37px;border-radius:19px;background:#000`); time(`left:${Math.round(s.w * 0.12)}px;top:16px`, 16); add(`right:${Math.round(s.w * 0.07)}px;top:19px`, icons(ink)); }
    if (k === 'ios-notch') { add(`left:${s.w / 2 - 105}px;top:0;width:210px;height:30px;border-radius:0 0 20px 20px;background:#000`); time('left:34px;top:14px'); add('right:20px;top:17px', icons(ink)); }
    if (k === 'ios-status-classic' || k === 'ipad-status') { time(`left:${k === 'ipad-status' ? 20 : s.w / 2 - 15}px;top:3px`, 12); add('right:6px;top:4px', icons(ink)); }
    if (k === 'ios-home') add(`left:${s.w / 2 - 67}px;bottom:8px;width:134px;height:5px;border-radius:3px;background:${ink}`);
    if (k === 'android-status') { time('left:16px;top:4px', 13); add('right:12px;top:6px', icons(ink)); }
    if (k === 'android-nav') add(`left:${s.w / 2 - 54}px;bottom:14px;width:108px;height:4px;border-radius:2px;background:${ink};opacity:.8`);
    if (k === 'duo-cover-capsule') {
      const c = add('left:391px;top:15px;width:54px;height:137px;border-radius:27px;background:rgba(246,246,248,0.92);display:flex;flex-direction:column;align-items:center');
      c.innerHTML = `<div style="margin-top:14px;width:30px;height:30px;border-radius:15px;background:#000"></div><div style="margin-top:12px;font-weight:700;font-size:15px;color:#000">9:41</div><div style="margin-top:4px">${wifi(38, '#000')}</div>`;
    }
    if (k === 'duo-cluster-l') { time('left:887px;top:38px', 16); add('left:883px;top:57px', wifi(40, ink)); }
    if (k === 'duo-cluster-p') { time(`left:${s.w - 116}px;top:39px`, 16); add(`left:${s.w - 68}px;top:28px`, wifi(40, ink)); }
    if (k === 'duo-cluster-split') { time(`left:${s.w - 64}px;top:38px`, 16); add(`left:${s.w - 68}px;top:57px`, wifi(40, ink)); }
  }
  if (s.guides) {
    const g = 'background:rgba(255,0,60,0.16)';
    const { top, bottom, left, right } = s.insets;
    if (top) add(`left:0;top:0;width:${s.w}px;height:${top}px;${g}`);
    if (bottom) add(`left:0;bottom:0;width:${s.w}px;height:${bottom}px;${g}`);
    if (left) add(`left:0;top:0;width:${left}px;height:${s.h}px;${g}`);
    if (right) add(`right:0;top:0;width:${right}px;height:${s.h}px;${g}`);
    if (s.crease) add(s.crease.axis === 'x' ? `left:${s.crease.at}px;top:0;width:0;height:${s.h}px;border-left:2px dashed #e6006e` : `left:0;top:${s.crease.at}px;width:${s.w}px;height:0;border-top:2px dashed #e6006e`);
    for (const t of s.taps) add(`left:${t.x}px;top:${t.y}px;width:${t.w}px;height:${t.h}px;border:2px solid #ff8a00;border-radius:8px`);
  }
  document.documentElement.appendChild(root);
}

// ---------- screenshots ----------
// Layout facts a screenshot hides: how far the page is wider than the device (the main failure of desktop web on
// phones), which elements stick out, and the page zoom (Chrome keeps zoom across a fold or unfold resize).
// Under mobile emulation Chrome widens the layout viewport to the content, so innerWidth itself grows past the device.
const layoutOf = (page, W) => page.evaluate((W) => {
  const name = (e) => e.tagName.toLowerCase() + (e.id ? `#${e.id}` : '') + (typeof e.className === 'string' && e.className.trim() ? `.${e.className.trim().split(/\s+/).slice(0, 2).join('.')}` : '');
  const de = document.documentElement;
  const width = Math.max(de.scrollWidth, window.innerWidth);
  const over = Math.round(width - W);
  const out = { overflowX: Math.max(0, over), layoutWidth: Math.round(width), zoom: window.visualViewport ? +window.visualViewport.scale.toFixed(3) : 1, outermost: [], leaves: [] };
  const wide = new Set([...document.body.querySelectorAll('*')].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.right > W + 1 && e.id !== '__rh_chrome'; }));
  if (!wide.size) return out;
  const info = (e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return { el: name(e), right: Math.round(r.right), width: Math.round(r.width), css: `width ${cs.width}, min-width ${cs.minWidth}${cs.position === 'fixed' ? ', fixed' : ''}${cs.whiteSpace === 'nowrap' ? ', nowrap' : ''}` }; };
  const nonLeaf = new Set();
  for (const e of wide) for (let p = e.parentElement; p; p = p.parentElement) nonLeaf.add(p);
  out.outermost = [...wide].filter((e) => !wide.has(e.parentElement)).slice(0, 4).map(info);
  out.leaves = [...wide].filter((e) => !nonLeaf.has(e)).map(info).sort((a, b) => b.right - a.right).slice(0, 5);
  return out;
}, W);

// Boxes of the scenario's "boxes" selectors on the first page of a shot, in device points, so annotate.py can draw
// evidence boxes from selectors instead of hand-measured numbers.
async function boxesOf(page, sels, rootSel) {
  const out = {};
  const o = rootSel ? await page.locator(rootSel).first().boundingBox({ timeout: 1500 }).catch(() => null) : null;
  const ox = o ? o.x : 0;
  const oy = o ? o.y : 0;
  for (const sel of sels || []) {
    const b = await page.locator(sel).first().boundingBox({ timeout: 1500 }).catch(() => null);
    if (b) out[sel] = [b.x - ox, b.y - oy, b.x - ox + b.width, b.y - oy + b.height].map((v) => Math.round(v));
  }
  return out;
}

async function capture(page, job, name) {
  const files = [];
  const rootSel = job.rootSel;
  const shotOne = async (file) => {
    if (rootSel) { const el = await page.$(rootSel); if (el) { await el.screenshot({ path: file }); return; } }
    await page.screenshot({ path: file });
  };
  // Clicks scroll their target into view, so a step shot would start mid-page; start from the top unless the step
  // scrolled on purpose (or asked for keepScroll, which also turns paging off).
  if (job.fromTop) {
    const off = await page.evaluate(() => {
      window.scrollTo(0, 0);
      for (const el of document.querySelectorAll('*')) if (el.scrollTop > 0 && /(auto|scroll)/.test(getComputedStyle(el).overflowY)) { el.scrollTop = 0; el.dispatchEvent(new Event('scroll')); }
      const v = window.visualViewport;
      return v ? Math.abs(v.offsetTop) + Math.abs(v.offsetLeft) : 0;
    });
    // On a page wider than the device the visual viewport can stay offset inside the layout viewport; scrollTo does
    // not move it back, a wheel gesture does.
    if (off > 0) { await page.mouse.move(2, 2); await page.mouse.wheel(-20000, -20000); }
    await page.waitForTimeout(200);
  }
  const first = path.join(job.devDir, `${name}-01.png`);
  await shotOne(first);
  files.push(first);
  if (job.log) {
    job.log.layout.push({ shot: path.basename(first), ...(await layoutOf(page, job.devW).catch(() => ({}))) });
    if (job.boxes?.length) job.log.boxes[path.basename(first)] = await boxesOf(page, job.boxes, rootSel);
  }
  if (job.pagesOff || maxPages <= 1) return files;
  const sc = await page.evaluate((sel) => {
    const se = document.scrollingElement;
    const vh = window.visualViewport ? window.visualViewport.height : window.innerHeight;
    if (!sel && se && se.scrollHeight > vh + 8) return { kind: 'window', sh: se.scrollHeight, ch: vh };
    const scope = sel ? document.querySelector(sel) : document.body;
    if (!scope) return null;
    const els = [...scope.querySelectorAll('*')].filter((el) => { const cs = getComputedStyle(el); return /(auto|scroll)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 8 && el.clientHeight > 150; });
    if (!els.length) return null;
    const main = els.sort((a, b) => b.clientWidth * b.clientHeight - a.clientWidth * a.clientHeight)[0];
    main.setAttribute('data-rh-scroll', '1');
    return { kind: 'el', sh: main.scrollHeight, ch: main.clientHeight };
  }, rootSel);
  if (!sc) return files;
  const step = Math.max(200, sc.ch - 120);
  const setY = (y) => page.evaluate(([kind, top]) => {
    if (kind === 'window') window.scrollTo(0, top);
    else { const el = document.querySelector('[data-rh-scroll="1"]'); el.scrollTop = top; el.dispatchEvent(new Event('scroll')); }
  }, [sc.kind, y]);
  let n = 1;
  for (let y = step; y < sc.sh - sc.ch + step && n < maxPages; y += step) {
    n += 1;
    await setY(Math.min(y, sc.sh - sc.ch));
    await page.waitForTimeout(450);
    const f = path.join(job.devDir, `${name}-${String(n).padStart(2, '0')}.png`);
    await shotOne(f);
    files.push(f);
  }
  await setY(0);
  await page.waitForTimeout(250);
  return files;
}

// A forced click reaches anything in the DOM, including controls a user cannot: content clipped by an overflow
// hidden box, a fixed element placed off screen, something covered by another element, or a spot under a dead tap
// zone of the system UI (Duo cover capsule). Check first, so a step shot never silently shows a state users cannot get to.
async function reachOf(page, loc, devW, taps) {
  const clip = await loc.evaluate((el, W) => {
    const name = (e) => e.tagName.toLowerCase() + (e.id ? `#${e.id}` : '') + (typeof e.className === 'string' && e.className.trim() ? `.${e.className.trim().split(/\s+/).slice(0, 2).join('.')}` : '');
    // First scroll only what a user can scroll (overflow auto/scroll and the page), as a finger would; whatever is
    // still outside an overflow hidden box afterwards is truly out of reach.
    for (let a = el.parentElement; a; a = a.parentElement) {
      const cs = getComputedStyle(a);
      const page = a === document.scrollingElement || a === document.body || a === document.documentElement;
      const er = el.getBoundingClientRect();
      const ar = page ? { top: 0, left: 0, height: window.visualViewport ? window.visualViewport.height : window.innerHeight, width: W } : a.getBoundingClientRect();
      const dy = er.top + er.height / 2 - (ar.top + ar.height / 2);
      const dx = er.left + er.width / 2 - (ar.left + ar.width / 2);
      if (page) { if (a === document.scrollingElement) window.scrollBy(0, dy); continue; }
      if (/auto|scroll/.test(cs.overflowY) && a.scrollHeight > a.clientHeight) a.scrollTop += dy;
      if (/auto|scroll/.test(cs.overflowX) && a.scrollWidth > a.clientWidth) a.scrollLeft += dx;
    }
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return 'zero size';
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    let fixed = getComputedStyle(el).position === 'fixed';
    for (let a = el.parentElement; a && a !== document.body && a !== document.documentElement; a = a.parentElement) {
      const cs = getComputedStyle(a);
      if (cs.position === 'fixed') fixed = true;
      const ar = a.getBoundingClientRect();
      if (/hidden|clip/.test(cs.overflowX) && (cx < ar.left || cx > ar.right)) return `clipped by ${name(a)} (overflow-x ${cs.overflowX})`;
      if (/hidden|clip/.test(cs.overflowY) && (cy < ar.top || cy > ar.bottom)) return `clipped by ${name(a)} (overflow-y ${cs.overflowY})`;
    }
    const rootHidden = [document.documentElement, document.body].some((e) => /hidden|clip/.test(getComputedStyle(e).overflowX));
    if ((fixed || rootHidden) && (cx < 0 || cx > W)) return `off screen sideways at x=${Math.round(cx)} (${fixed ? 'fixed' : 'page overflow-x hidden'})`;
    if (fixed && (cy < 0 || cy > window.innerHeight)) return `fixed element off screen at y=${Math.round(cy)}`;
    if (cx < 0 || cx > W) return `needs a sideways pan: x=${Math.round(cx)} on a ${W}pt screen`;
    return null;
  }, devW);
  if (clip) return clip;
  await loc.scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => {});
  return loc.evaluate((el, taps) => {
    const name = (e) => e.tagName.toLowerCase() + (e.id ? `#${e.id}` : '') + (typeof e.className === 'string' && e.className.trim() ? `.${e.className.trim().split(/\s+/).slice(0, 2).join('.')}` : '');
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const dead = (taps || []).find((t) => cx >= t.x && cx <= t.x + t.w && cy >= t.y && cy <= t.y + t.h);
    if (dead) return `under a dead tap zone of the system UI (${dead.note || "taps"})`;
    const hit = document.elementFromPoint(cx, cy);
    if (!hit) return 'off screen after scrolling';
    if (hit === el || el.contains(hit)) return null;
    // The tap passes through the target (pointer-events: none) to an ancestor: fine only if that ancestor takes taps.
    const takesTaps = (e) => /^(button|a|input|select|textarea|label|summary)$/i.test(e.tagName) || e.hasAttribute('onclick') || ['button', 'link', 'tab', 'menuitem', 'checkbox', 'switch', 'radio'].includes(e.getAttribute('role')) || e.tabIndex >= 0 || getComputedStyle(e).cursor === 'pointer';
    if (hit.contains(el) && hit !== document.body && hit !== document.documentElement && takesTaps(hit)) return null;
    return hit.contains(el) ? `taps pass through to ${name(hit)}, which does not handle them` : `covered by ${name(hit)}`;
  }, taps);
}

// For a covered target the harness lifts the covering layers (pointer-events: none) for one click, so the flow can
// continue; the cover is restored right after. The finding is the covered control, not what happens next.
async function clickThrough(page, loc) {
  const lifted = await loc.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const out = [];
    for (let i = 0; i < 12; i += 1) {
      const hit = document.elementFromPoint(cx, cy);
      if (!hit || hit === el || el.contains(hit) || hit.contains(el)) break;
      out.push([hit, hit.style.pointerEvents]);
      hit.style.pointerEvents = 'none';
    }
    window.__RH_LIFTED__ = out;
    return out.length;
  });
  try { await loc.click({ force: true }); } finally {
    await page.evaluate(() => { for (const [e, v] of window.__RH_LIFTED__ || []) e.style.pointerEvents = v; window.__RH_LIFTED__ = null; });
  }
  return lifted;
}

async function clickLoc(page, loc, job, what) {
  const problem = await reachOf(page, loc, job.devW, job.taps).catch((e) => `reach check failed: ${e.message.split('\n')[0]}`);
  if (problem) {
    job.log.reach.push({ step: job.stepIdx, target: what, problem });
    job.harnessOnly = true;
    if (opt['strict-reach'] && !/sideways pan/.test(problem)) throw new Error(`unreachable for a user: ${problem}`);
    if (/^covered by/.test(problem)) { await clickThrough(page, loc); return; }
  }
  await loc.click({ force: true });
}

async function clickText(page, scope, text, exact, job) {
  const loc = page.locator(scope).getByText(text, { exact: !!exact });
  const count = await loc.count();
  if (!count) throw new Error(`text not found: ${text}`);
  for (let i = count - 1; i >= 0; i -= 1) { const el = loc.nth(i); if (await el.isVisible()) { await clickLoc(page, el, job, `text "${text}"`); return; } }
  await clickLoc(page, loc.nth(count - 1), job, `text "${text}"`);
}

async function waitReady(page, sc, mode) {
  if (mode === 'rn') await page.waitForFunction(() => window.__HARNESS_READY__ === true, null, { timeout: 90000 }).catch(() => {});
  const rw = sc.readyWhen || {};
  // A held request keeps the network busy forever: skip the idle wait so the loading state is shot, not waited out.
  const idle = rw.networkIdle !== false && !sc.routes.some((r) => r.hold);
  if (rw.selector) await page.waitForSelector(rw.selector, { state: 'visible', timeout: 30000 });
  if (rw.text) await page.getByText(rw.text).first().waitFor({ timeout: 30000 });
  if (rw.fn) await page.waitForFunction(rw.fn, null, { timeout: 30000 });
  if (idle) await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(sc.settleMs ?? (mode === 'rn' ? 400 : 900));
}

// ---------- one job = one scenario on one device ----------
async function runJob(browser, file, devId, explicitDevices) {
  const name = nameOf(file);
  const sc = loadScenarioFile(file, { lang });
  const mode = opt.mode || (sc.screen || sc.stack ? 'rn' : 'web');
  const full = mode === 'rn' || !!opt.standalone || !!sc.standalone;
  const d = DEV.devices[devId];
  const scale = Number(opt.scale || d.scale || 2);
  const devDir = path.join(outDir, devId);
  fs.mkdirSync(devDir, { recursive: true });
  const safe = name.replace(/\//g, '__') + (lang === 'en' ? '' : `__${lang}`) + (dark ? '__dark' : '');
  const job = { devDir, rootSel: opt.root || sc.root || (mode === 'rn' ? '#root' : null), pagesOff: sc.pages === false, devW: d.w, taps: full ? d.taps || [] : [], boxes: sc.boxes || [] };
  const ua = d.platform === 'android'
    ? 'Mozilla/5.0 (Linux; Android 15; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36'
    : `Mozilla/5.0 (${d.tablet ? 'iPad' : 'iPhone'}; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1`;
  const context = await browser.newContext({
    viewport: { width: d.w, height: viewH(d, full) }, deviceScaleFactor: scale, isMobile: true, hasTouch: true, userAgent: sc.userAgent || ua,
    locale, timezoneId: opt.tz || sc.timezone || 'UTC', colorScheme: dark ? 'dark' : 'light', extraHTTPHeaders: { 'accept-language': locale },
  });
  const log = { scenario: name, file, device: devId, mode, full, viewport: [d.w, viewH(d, full)], lang, dark, files: [], requests: [], misses: [], console: [], pageErrors: [], stepErrors: [], reach: [], harnessOnly: [], layout: [], boxes: {}, zoomCarried: [] };
  job.log = log;
  const routes = sc.routes;
  await context.route('**/*', async (route, req) => {
    const url = req.url();
    if (url.startsWith('data:') || url.startsWith('blob:')) return route.continue();
    const method = req.method();
    const type = req.resourceType();
    if (opt.block && new RegExp(opt.block).test(url)) { log.requests.push({ method, url, type, blocked: true }); return route.abort(); }
    const origin = req.headers().origin || baseOrigin;
    if (method === 'OPTIONS' && routes.some((r) => urlMatches(r, url))) return route.fulfill(CORS_PREFLIGHT(origin));
    const r = matchRoute(routes, method, url);
    if (r) {
      log.requests.push({ method, url, type, route: r.id, status: r.hold ? 'held' : r.networkError ? 'network-error' : r.status || 200 });
      if (r.hold) return new Promise(() => {}); // never answered; the page closes with it pending
      if (r.delayMs) await new Promise((res) => setTimeout(res, r.delayMs));
      if (r.networkError) return route.abort('failed');
      return route.fulfill(responseOf(r, origin));
    }
    const isApi = type === 'xhr' || type === 'fetch' || type === 'eventsource';
    const own = url.startsWith(baseOrigin);
    if (isApi && !(own && FRAMEWORK.test(url)) && !(opt.passthrough && new RegExp(opt.passthrough).test(url)) && opt.unmatched !== 'passthrough') {
      log.requests.push({ method, url, type, miss: true });
      log.misses.push(`${method} ${url.replace(/^https?:\/\/[^/]+/, '')}`);
      return route.fulfill({ status: 404, headers: { 'content-type': 'application/json', 'access-control-allow-origin': origin, 'access-control-allow-credentials': 'true' }, body: '{"error":"render-harness: no mock for this request"}' });
    }
    return route.continue();
  });
  const harness = { device: { id: devId, ...d, insets: { top: 0, bottom: 0, left: 0, right: 0, ...(d.insets || {}) } }, platform: d.platform, lang, dir, dark, fontScale: Number(opt['font-scale'] || 1), scenarioName: name, scenario: { ...sc, routes: undefined } };
  const storage = sc.storage || {};
  await context.addInitScript(([h, ls, ss, origin, now]) => {
    window.__HARNESS__ = h;
    window.__HARNESS_LANG__ = h.lang;
    window.__HARNESS_PLATFORM__ = h.platform;
    window.__HARNESS_DEVICE__ = { w: h.device.w, h: h.device.h, top: h.device.insets.top, bottom: h.device.insets.bottom, left: h.device.insets.left, right: h.device.insets.right };
    if (location.origin === origin) {
      try { for (const [k, v] of Object.entries(ls || {})) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)); } catch (e) {}
      try { for (const [k, v] of Object.entries(ss || {})) sessionStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)); } catch (e) {}
    }
    if (now) { const fixed = new Date(now).getTime(); const D = Date; const off = fixed - D.now(); class FD extends D { constructor(...a) { super(...(a.length ? a : [D.now() + off])); } static now() { return D.now() + off; } } window.Date = FD; }
  }, [harness, storage.localStorage, storage.sessionStorage, baseOrigin, opt.now || sc.now || null]);
  if (sc.init) await context.addInitScript(sc.init);
  if (storage.cookies?.length) await context.addCookies(storage.cookies.map((c) => ({ path: '/', ...c, ...(c.domain ? {} : { url: base }) })));
  const page = await context.newPage();
  page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) log.console.push(`${m.type()}: ${m.text().slice(0, 500)}`); });
  page.on('pageerror', (e) => log.pageErrors.push(String(e.stack || e).slice(0, 1500)));
  page.on('response', (r) => { if (r.status() >= 400 && !log.requests.some((q) => q.url === r.url() && q.miss)) log.console.push(`http ${r.status()}: ${r.url().slice(0, 200)}`); });
  try {
    if (mockServer) {
      const res = await fetch(`${mockServer}/__harness/routes`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ scenario: name, routes }) });
      if (!res.ok) throw new Error(`mock server PUT failed: ${res.status}`);
    }
    const target = mode === 'rn'
      ? `${base}/?scenario=${encodeURIComponent(name)}&device=${devId}&platform=${d.platform}&lang=${lang}`
      : `${base}${sc.url || '/'}`;
    await page.goto(target, { waitUntil: 'load', timeout: 90000 });
    await waitReady(page, sc, mode);
    await page.evaluate(drawChrome, chromeSpec(devId, full));
    log.files.push(...(await capture(page, job, safe)));
    let curDev = devId;
    for (const [idx, st] of (sc.steps || []).entries()) {
      try {
        const scope = job.rootSel || 'body';
        if (st.device) {
          const nd = DEV.devices[st.device];
          if (!nd) throw new Error(`unknown device ${st.device}`);
          curDev = st.device;
          job.devW = nd.w;
          job.taps = full ? nd.taps || [] : [];
          await page.setViewportSize({ width: nd.w, height: viewH(nd, full) });
          await page.evaluate(([w, h, ins, id]) => { const hh = window.__HARNESS__; hh.device = { ...hh.device, id, w, h, insets: ins }; const r = document.getElementById('root'); if (r && hh.scenario && (hh.scenario.screen || hh.scenario.stack)) { r.style.width = `${w}px`; r.style.height = `${h}px`; } window.dispatchEvent(new Event('resize')); }, [nd.w, viewH(nd, full), full ? { top: 0, bottom: 0, left: 0, right: 0, ...(nd.insets || {}) } : { top: 0, bottom: 0, left: 0, right: 0 }, st.device]);
          // Chrome carries the page zoom across the resize; a fresh load on the new device has zoom 1. Reset it (and
          // log what was carried) unless the step says keepZoom. What a real browser does here is NEEDS DEVICE.
          await page.waitForTimeout(300);
          const z = await page.evaluate(() => (window.visualViewport ? window.visualViewport.scale : 1));
          if (Math.abs(z - 1) > 0.01) {
            if (!st.keepZoom) { const cdp = await page.context().newCDPSession(page).catch(() => null); await cdp?.send('Emulation.resetPageScaleFactor').catch(() => {}); }
            log.zoomCarried.push({ step: idx, to: st.device, zoom: +z.toFixed(3), reset: !st.keepZoom });
          }
        }
        job.stepIdx = idx;
        if (st.click) await clickText(page, scope, st.click, st.exact, job);
        if (st.clickSelector) await clickLoc(page, page.locator(st.clickSelector).first(), job, st.clickSelector);
        if (st.tap) await page.mouse.click(st.tap[0], st.tap[1]);
        if (st.type !== undefined) await page.locator(st.selector || 'input, textarea').first().fill(String(st.type));
        if (st.press) await page.keyboard.press(st.press);
        if (st.hover) await page.locator(st.hover).first().hover();
        if (st.scroll) await page.evaluate((s) => { const el = s.selector ? document.querySelector(s.selector) : document.querySelector('[data-rh-scroll="1"]') || document.scrollingElement; if (el) el.scrollTop = s.y ?? el.scrollTop + (s.by ?? 400); el?.dispatchEvent(new Event('scroll')); }, st.scroll);
        if (st.eval) await page.evaluate(st.eval);
        if (st.waitFor?.selector) await page.waitForSelector(st.waitFor.selector, { timeout: 15000 });
        if (st.waitFor?.text) await page.getByText(st.waitFor.text).first().waitFor({ timeout: 15000 });
        await page.waitForTimeout(st.wait ?? 1000);
        if ((sc.readyWhen || {}).networkIdle !== false && !sc.routes.some((r) => r.hold)) await page.waitForLoadState('networkidle', { timeout: 6000 }).catch(() => {});
        if (st.shot) {
          await page.evaluate(drawChrome, chromeSpec(curDev, full));
          const target2 = curDev === devId ? job : { ...job, devDir: path.join(outDir, `${devId}__to__${curDev}`) };
          fs.mkdirSync(target2.devDir, { recursive: true });
          const keep = !!(st.keepScroll || st.scroll);
          const got = await capture(page, { ...target2, fromTop: !keep, pagesOff: keep || st.pages === false || job.pagesOff }, `${safe}--${st.shot}`);
          log.files.push(...got);
          if (job.harnessOnly) log.harnessOnly.push(...got.map((f) => path.basename(f)));
        }
      } catch (e) { log.stepErrors.push(`step ${idx} ${JSON.stringify(st).slice(0, 200)}: ${e.message}`); }
    }
    Object.assign(log, await page.evaluate(() => ({ appErrors: window.__ERRORS__ || [], nav: window.__NAV_LOG__ || [] })).catch(() => ({})));
    if (opt.dump) {
      const dump = await page.evaluate((expr) => {
        let value;
        try { value = expr ? JSON.stringify(eval(expr)) : undefined; } catch (e) { value = `eval error: ${e.message}`; }
        return { text: (document.body.innerText || '').replace(/\n{3,}/g, '\n\n').slice(0, 3000), html: document.body.innerHTML.length, value };
      }, typeof opt.eval === 'string' ? opt.eval : null).catch((e) => ({ text: `dump failed: ${e.message}` }));
      console.log(`\n===== ${name} @${devId}: visible text (${dump.html} chars of HTML) =====\n${dump.text || '(no visible text)'}`);
      if (dump.value !== undefined) console.log(`----- eval ${opt.eval}: ${dump.value}`);
      for (const e of [...log.pageErrors, ...(log.appErrors || []), ...log.stepErrors]) console.log(`----- error: ${String(e).slice(0, 2000)}`);
      for (const q of log.requests.filter((x) => x.type === 'xhr' || x.type === 'fetch')) console.log(`----- ${q.method} ${q.url} -> ${q.miss ? 'MISS' : q.status}`);
      for (const c of log.console.slice(0, 20)) console.log(`----- console ${c}`);
    }
  } catch (e) {
    log.stepErrors.push(`load: ${String(e.stack || e).slice(0, 1500)}`);
    try { const f = path.join(devDir, `${safe}-FAILED.png`); await page.screenshot({ path: f }); log.files.push(f); } catch (_) {}
  }
  fs.writeFileSync(path.join(devDir, `${safe}.log.json`), JSON.stringify(log, null, 1));
  const errs = log.pageErrors.length + log.stepErrors.length + (log.appErrors || []).length;
  const ox = Math.max(0, ...log.layout.map((l) => l.overflowX || 0));
  const zooms = [...new Set(log.layout.map((l) => l.zoom).filter((z) => z && z !== 1))];
  const flags = [ox > 1 ? `overflow=+${ox}px` : '', zooms.length ? `zoom=${zooms.join('/')}` : '', log.zoomCarried.length ? `zoom-carried=${log.zoomCarried.map((z) => `${z.zoom}${z.reset ? ' (reset)' : ''}`).join('/')}` : '', log.reach.length ? `unreachable=${log.reach.map((r) => `step${r.step}(${r.problem})`).join('; ')}` : ''].filter(Boolean).join(', ');
  console.log(`${name} @${devId}${lang === 'en' ? '' : ` [${lang}]`} -> ${log.files.length} png, errors=${errs}, api-miss=${[...new Set(log.misses)].join(' | ') || 'none'}${flags ? `, ${flags}` : ''}`);
  await context.close();
  return log;
}

const files = pos.flatMap(expand);
const jobs = [];
for (const f of files) {
  // --devices wins, except for scenarios with a "device" step (fold or unfold): those keep their own start devices.
  let own = null;
  try { const raw = JSON.parse(fs.readFileSync(f, 'utf8')); if (raw.devices) own = { list: expandDevices(raw.devices.join(',')), fold: (raw.steps || []).some((st) => st.device) }; } catch (e) { /* reported by runJob */ }
  let devs = opt.devices && !(own && own.fold) ? expandDevices(opt.devices) : own ? own.list : ['iphone-15'];
  if (opt.devices && own && own.fold) console.log(`${nameOf(f)}: kept its own devices ${own.list.join(',')} (it has a fold/unfold step)`);
  for (const dv of devs) {
    if (!DEV.devices[dv]) { console.error(`unknown device ${dv}. Known: ${Object.keys(DEV.devices).join(', ')}. Sets: ${Object.keys(DEV.sets).join(', ')}`); process.exit(1); }
    jobs.push([f, dv]);
  }
}
const browser = await chromium.launch({ executablePath: chromePath, headless: !opt.headed, args: ['--hide-scrollbars', '--font-render-hinting=none', '--disable-blink-features=AutomationControlled'] });
const results = [];
let next = 0;
await Promise.all(Array.from({ length: Math.min(workers, jobs.length) }, async () => {
  while (next < jobs.length) {
    const [f, dv] = jobs[next++];
    try { results.push(await runJob(browser, f, dv)); } catch (e) { console.error(`${nameOf(f)} @${dv} -> CRASH ${e.message}`); results.push({ scenario: nameOf(f), device: dv, crash: e.message }); }
  }
}));
await browser.close();
fs.mkdirSync(path.join(outDir, '_runs'), { recursive: true });
const runFile = path.join(outDir, '_runs', `${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
fs.writeFileSync(runFile, JSON.stringify({ base, lang, dark, devices: [...new Set(jobs.map((j) => j[1]))], results: results.map((r) => ({ scenario: r.scenario, device: r.device, files: r.files, misses: [...new Set(r.misses || [])], errors: (r.pageErrors || []).length + (r.stepErrors || []).length, overflowX: Math.max(0, ...(r.layout || []).map((l) => l.overflowX || 0)), unreachable: r.reach || [], harnessOnly: r.harnessOnly || [], crash: r.crash })) }, null, 1));
console.log(`done: ${results.length} jobs, run log ${runFile}`);
