// ADAPT: reproduce the app's real provider tree and boot steps, copied from its App.tsx / index.js / registerScreens.
// Typical pieces: redux or zustand store (real reducers, preloaded with scenario.redux), theme provider, i18n init in
// h.lang, feature flags from scenario.featureFlags, query client, gesture handler root, portal host for sheets.
// Rule: use the app's real modules; only replace what needs a native runtime (and say so in the findings).
// Static singletons: some apps read the store, theme or config through a static (App.store, global.store, a theme
// manager instance) instead of a Provider. Find them in the app's boot code and set them here too, or those reads see
// undefined and the screen silently falls back.
import React from 'react';
// import { Provider } from 'react-redux';
// import { configureStore } from '@app/store';
// import { GestureHandlerRootView } from 'react-native-gesture-handler';
// import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Merge a scenario's partial redux state over the reducers' initial state: a slice given in scenario.redux keeps the
// fields it does not mention (passing it straight to createStore would replace the whole slice).
export const deepMerge = (base, over) => {
  if (Array.isArray(over) || over === null || typeof over !== 'object' || typeof base !== 'object' || base === null || Array.isArray(base)) return over === undefined ? base : over;
  const out = { ...base };
  for (const [k, v] of Object.entries(over)) out[k] = deepMerge(base[k], v);
  return out;
};
// const initialState = rootReducer(undefined, { type: '@@harness/INIT' });

export async function beforeBoot(h) {
  // await i18n.changeLanguage(h.lang);
  // await initThemes();
  // featureFlags.init(h.scenario.featureFlags || []);
}

export function Providers({ harness, children }) {
  // const store = configureStore(deepMerge(initialState, harness.scenario.redux || {}));
  // return <Provider store={store}><GestureHandlerRootView style={{ flex: 1 }}>{children}</GestureHandlerRootView></Provider>;
  return children;
}
