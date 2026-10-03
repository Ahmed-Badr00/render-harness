// In-page navigation stack shared by the react-native-navigation shim and the react-navigation style `navigation` prop.
// Pushes, modals and overlays render on top inside the harness; covered screens stay mounted (hidden), like on device.
let stack = [];
let seq = 0;
const listeners = new Set();
const emit = () => listeners.forEach((l) => l(stack.slice()));
const log = (type, e) => {
  window.__NAV_LOG__ = window.__NAV_LOG__ || [];
  let props = {};
  try { props = JSON.parse(JSON.stringify(e?.props || {}, (k, v) => (typeof v === 'function' ? '[fn]' : v))); } catch (_) {}
  window.__NAV_LOG__.push({ type, name: e?.name, props });
  console.log(`[NAV] ${type} ${e?.name || ''}`);
};

export const navStore = {
  get: () => stack.slice(),
  subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  reset(entries) { stack = entries.map((e) => ({ id: e.id || `screen-${++seq}`, kind: e.kind || 'screen', name: e.name, props: e.props || {}, options: e.options })); emit(); },
  add(kind, name, props, options, id) {
    const e = { id: id || `${kind}-${++seq}`, kind, name, props: props || {}, options };
    stack = [...stack, e];
    log(kind, e);
    emit();
    return e.id;
  },
  remove(pred) {
    const idx = [...stack].reverse().findIndex(pred);
    if (idx < 0) return;
    const real = stack.length - 1 - idx;
    log('remove', stack[real]);
    stack = stack.filter((_, i) => i !== real);
    emit();
  },
  popTo(id) { const i = stack.findIndex((e) => e.id === id); if (i >= 0) { stack = stack.slice(0, i + 1); emit(); } },
  update(id, props) { stack = stack.map((e) => (e.id === id ? { ...e, props: { ...e.props, ...props } } : e)); emit(); },
};

// A react-navigation compatible `navigation` object for the screen at `entry`.
export function makeNavigation(entry) {
  const sub = () => () => {};
  return {
    navigate: (name, params) => (typeof name === 'object' ? navStore.add('screen', name.name, name.params) : navStore.add('screen', name, params)),
    push: (name, params) => navStore.add('screen', name, params),
    replace: (name, params) => { navStore.remove((e) => e.id === entry.id); navStore.add('screen', name, params); },
    goBack: () => navStore.remove((e) => e.id === entry.id),
    pop: () => navStore.remove((e) => e.id === entry.id),
    popToTop: () => navStore.popTo(navStore.get()[0]?.id),
    reset: () => {},
    setParams: (p) => navStore.update(entry.id, p),
    setOptions: () => {},
    dispatch: () => {},
    addListener: sub,
    removeListener: () => {},
    isFocused: () => navStore.get().slice(-1)[0]?.id === entry.id,
    canGoBack: () => navStore.get().length > 1,
    getParent: () => undefined,
    getState: () => ({ routes: navStore.get().map((e) => ({ key: e.id, name: e.name, params: e.props })), index: navStore.get().length - 1 }),
    getId: () => entry.id,
  };
}
