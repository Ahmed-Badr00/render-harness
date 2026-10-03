// Harness boot. shoot.mjs injects window.__HARNESS__ (device, platform, lang, dir, dark, fontScale, scenario) before
// any app module runs; when browsing manually, the same values come from the URL (?scenario=flow/name&device=iphone-15).
const params = new URLSearchParams(window.location.search);
window.__ERRORS__ = [];
window.__NAV_LOG__ = [];
window.__HARNESS_READY__ = false;
window.addEventListener('error', (e) => window.__ERRORS__.push(String(e.message || e)));
window.addEventListener('unhandledrejection', (e) => window.__ERRORS__.push(`unhandledrejection: ${e.reason?.stack || e.reason}`));

async function harnessConfig() {
  if (window.__HARNESS__) return window.__HARNESS__;
  const name = params.get('scenario');
  const scenario = name ? await fetch(`/scenarios/${name}.json?t=${Date.now()}`).then((r) => r.json()) : {};
  const lang = params.get('lang') || 'en';
  const h = { device: { id: 'iphone-15', w: 390, h: 844, insets: { top: 47, bottom: 34, left: 0, right: 0 } }, platform: params.get('platform') || 'ios', lang, dir: ['ar', 'he', 'fa', 'ur'].includes(lang) ? 'rtl' : 'ltr', dark: false, fontScale: 1, scenarioName: name, scenario };
  window.__HARNESS__ = h;
  window.__HARNESS_LANG__ = lang;
  return h;
}

// Yoga parity: in a row, Yoga sizes an auto-basis child at most the row's inner width (text wraps); CSS sizes it at
// max-content (text overflows). Clamp such children to 100% unless they scroll horizontally or have an explicit width.
// Disable with scenario.yoga = false to see raw CSS. Confirm layout findings with bin/yoga_check.mjs.
function installYogaClamp() {
  const isScroll = (el) => { if (!el) return false; const o = getComputedStyle(el).overflowX; return o === 'auto' || o === 'scroll'; };
  const clamp = () => {
    document.getElementById('root')?.querySelectorAll('div, span').forEach((el) => {
      if (el.dataset.yogaClamp === '1') return;
      const parent = el.parentElement;
      if (!parent) return;
      const ps = getComputedStyle(parent);
      if (ps.display !== 'flex' || isScroll(parent) || isScroll(parent.parentElement)) return;
      const cs = getComputedStyle(el);
      // Row: auto-basis children wrap at the row width. Column with alignItems/alignSelf other than stretch: Yoga measures
      // the child AtMost the column width (a numberOfLines=1 title truncates); CSS gives it max-content and it overflows.
      const isRow = ps.flexDirection.startsWith('row');
      const align = cs.alignSelf === 'auto' ? ps.alignItems : cs.alignSelf;
      if (!isRow && (align === 'stretch' || align === 'normal')) return;
      if (cs.position === 'absolute' || (isRow && cs.flexBasis !== 'auto') || cs.maxWidth !== 'none' || /\br-width-|\br-maxWidth-/.test(el.className) || el.style.width) return;
      el.style.maxWidth = '100%';
      el.dataset.yogaClamp = '1';
    });
  };
  let queued = false;
  new MutationObserver(() => { if (queued) return; queued = true; requestAnimationFrame(() => { queued = false; clamp(); }); }).observe(document.documentElement, { childList: true, subtree: true });
}

harnessConfig().then(async (h) => {
  const root = document.getElementById('root');
  root.style.width = `${h.device.w}px`;
  root.style.height = `${h.device.h}px`;
  if (h.scenario.yoga !== false) installYogaClamp();
  const { boot } = await import('./app');
  await boot(h);
}).catch((e) => {
  window.__ERRORS__.push(`boot: ${e?.stack || e}`);
  document.getElementById('root').innerText = `BOOT FAILED\n${e?.stack || e}`;
  window.__HARNESS_READY__ = true;
});
