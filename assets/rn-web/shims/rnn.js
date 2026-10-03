// react-native-navigation stub on top of the harness nav store (src/nav.js).
import React from 'react';
import { navStore } from '../src/nav';

export const registry = {};
const extract = (layout) => {
  if (!layout) return null;
  if (layout.component) return layout.component;
  if (layout.stack?.children?.length) return extract(layout.stack.children[layout.stack.children.length - 1]);
  if (layout.root) return extract(layout.root);
  if (layout.sideMenu?.center) return extract(layout.sideMenu.center);
  if (layout.bottomTabs?.children?.length) return extract(layout.bottomTabs.children[0]);
  return null;
};
const add = (kind, layout) => { const c = extract(layout) || {}; return Promise.resolve(navStore.add(kind, c.name, c.passProps, c.options, c.id)); };
const sub = { remove() {} };
export const Navigation = {
  registerComponent(name, gen) { registry[name] = gen; return gen; },
  setRoot(layout) { navStore.reset([]); return add('screen', layout); },
  push(_from, layout) { return add('screen', layout); },
  showModal(layout) { return add('modal', layout); },
  showOverlay(layout) { return add('overlay', layout); },
  pop(id) { navStore.remove((e) => e.kind === 'screen' && (!id || e.id === id)); return Promise.resolve(id); },
  popTo(id) { navStore.popTo(id); return Promise.resolve(id); },
  popToRoot() { navStore.popTo(navStore.get()[0]?.id); return Promise.resolve(); },
  dismissModal(id) { navStore.remove((e) => e.kind === 'modal' && (!id || e.id === id)); return Promise.resolve(id); },
  dismissAllModals() { navStore.reset(navStore.get().filter((e) => e.kind !== 'modal')); return Promise.resolve(); },
  dismissOverlay(id) { navStore.remove((e) => e.kind === 'overlay' && (!id || e.id === id)); return Promise.resolve(id); },
  dismissAllOverlays() { navStore.reset(navStore.get().filter((e) => e.kind !== 'overlay')); return Promise.resolve(); },
  mergeOptions() {},
  updateProps(id, props) { navStore.update(id, props); },
  setDefaultOptions() {},
  setStackRoot(_id, layout) { navStore.reset([]); return add('screen', layout); },
  constants: async () => ({ statusBarHeight: window.__HARNESS__?.device?.insets?.top || 47, topBarHeight: 44, bottomTabsHeight: 83 }),
  constantsSync: () => ({ statusBarHeight: window.__HARNESS__?.device?.insets?.top || 47, topBarHeight: 44, bottomTabsHeight: 83 }),
  events: () => new Proxy({}, { get: () => () => sub }),
};
export const OptionsModalPresentationStyle = { fullScreen: 'fullScreen', pageSheet: 'pageSheet', formSheet: 'formSheet', currentContext: 'currentContext', custom: 'custom', overCurrentContext: 'overCurrentContext', overFullScreen: 'overFullScreen', popover: 'popover', none: 'none' };
export const OptionsModalTransitionStyle = { coverVertical: 'coverVertical', crossDissolve: 'crossDissolve', flipHorizontal: 'flipHorizontal', partialCurl: 'partialCurl' };
export const useNavigationComponentDidAppear = () => {};
export const useNavigationComponentDidDisappear = () => {};
export const useNavigationButtonPress = () => {};
export const NavigationContext = React.createContext({});
export const NavigationProvider = ({ children }) => children;
export default Navigation;
