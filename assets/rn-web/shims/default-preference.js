// react-native-default-preference (NSUserDefaults / SharedPreferences) in memory, seeded from scenario.defaultPreference.
// ADAPT: apps often keep their locale or country here (for example 'locale': 'ar-ae'); seed it from the harness lang
// below so --lang=ar boots the app in Arabic.
const H = (typeof window !== 'undefined' && window.__HARNESS__) || {};
const store = { ...(H.scenario?.defaultPreference || {}) };
let name = 'harness';
const DP = {
  get: async (k) => (k in store ? store[k] : null), set: async (k, v) => { store[k] = v; }, clear: async (k) => { delete store[k]; },
  getMultiple: async (ks) => ks.map((k) => store[k] ?? null), setMultiple: async (o) => Object.assign(store, o), clearMultiple: async (ks) => ks.forEach((k) => delete store[k]),
  getAll: async () => ({ ...store }), clearAll: async () => { Object.keys(store).forEach((k) => delete store[k]); },
  getName: async () => name, setName: async (n) => { name = n; },
};
export default DP;
