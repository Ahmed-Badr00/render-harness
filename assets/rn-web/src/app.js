// Renders the scenario's screen stack with the app's real providers. App-specific wiring lives in providers.js and
// registry.js (ADAPT those two); this file should rarely change.
import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { View, Text, StyleSheet } from 'react-native';
import * as RNav from '@react-navigation/native';
import { navStore, makeNavigation } from './nav';
import { screens } from './registry';
import { Providers, beforeBoot } from './providers';
import { registry as rnnRegistry } from '../shims/rnn';

// When @react-navigation/native is not installed it is aliased to anyStub, whose Proxy is truthy; a real React context
// has $$typeof, the stub does not.
const HAS_RNAV = !!RNav.NavigationContext?.$$typeof;

const Missing = ({ __name, route, navigation, ...props }) => (
  <View style={{ flex: 1, backgroundColor: '#fff', padding: 24, paddingTop: 80 }}>
    <Text style={{ fontSize: 16, fontWeight: '700' }}>Navigated to {__name}</Text>
    <Text style={{ fontSize: 11, marginTop: 8, color: '#666' }} numberOfLines={40}>{JSON.stringify(route?.params || props, (k, v) => (typeof v === 'function' ? '[fn]' : v), 1).slice(0, 1500)}</Text>
  </View>
);

const resolve = (name) => {
  const s = screens[name] || rnnRegistry[name];
  if (!s) return null;
  try { const m = s(); return m?.default || m; } catch (e) { window.__ERRORS__.push(`screen ${name}: ${e.stack || e}`); return null; }
};
// A pushed entry is transparent (the screen below stays visible) for overlays and sheet-like modals.
const transparent = (e) => e.kind === 'overlay' || (e.kind === 'modal' && (/over(CurrentContext|FullScreen)|transparentModal|none/i.test(String(e.options?.modalPresentationStyle || e.options?.presentation || '')) || /Sheet|Overlay|Popup|Dialog/i.test(e.name || '')));

function Screen({ entry }) {
  const Comp = resolve(entry.name);
  const navigation = makeNavigation(entry);
  const route = { key: entry.id, name: entry.name, params: entry.props };
  // RNN style props (componentId) and react-navigation style props (navigation, route) are both passed.
  const el = Comp ? <Comp {...entry.props} componentId={entry.id} navigation={navigation} route={route} /> : <Missing __name={entry.name} route={route} />;
  if (!HAS_RNAV) return el;
  return <RNav.NavigationContext.Provider value={navigation}><RNav.NavigationRouteContext.Provider value={route}>{el}</RNav.NavigationRouteContext.Provider></RNav.NavigationContext.Provider>;
}

function NavHost() {
  const [stack, setStack] = useState(navStore.get());
  useEffect(() => navStore.subscribe(setStack), []);
  let base = stack.length - 1;
  while (base > 0 && transparent(stack[base])) base -= 1;
  return stack.map((e, i) => (
    <View key={e.id} nativeID={`nav-${e.kind}-${e.id}`} style={[StyleSheet.absoluteFill, transparent(e) ? null : { backgroundColor: '#fff' }, i < Math.max(base, 0) ? { display: 'none' } : null]}>
      <Screen entry={e} />
    </View>
  ));
}

export async function boot(h) {
  const sc = h.scenario || {};
  await beforeBoot(h);
  const stack = sc.stack || [{ name: sc.screen, props: sc.props || {} }];
  navStore.reset(stack.map((s) => ({ ...s, kind: s.kind || 'screen' })));
  const root = createRoot(document.getElementById('root'));
  root.render(
    <Providers harness={h}>
      <View style={{ width: '100%', height: '100%', overflow: 'hidden', position: 'relative', backgroundColor: '#fff' }} dir={h.dir}>
        <NavHost />
      </View>
    </Providers>
  );
  setTimeout(() => { window.__HARNESS_READY__ = true; }, sc.settleMs ?? 2500);
}
