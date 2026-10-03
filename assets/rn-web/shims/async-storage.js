// @react-native-async-storage/async-storage backed by memory, seeded from scenario.asyncStorage (values stored as given).
const seed = (typeof window !== 'undefined' && window.__HARNESS__?.scenario?.asyncStorage) || {};
const store = Object.fromEntries(Object.entries(seed).map(([k, v]) => [k, typeof v === 'string' ? v : JSON.stringify(v)]));
const AS = {
  getItem: async (k) => (k in store ? store[k] : null), setItem: async (k, v) => { store[k] = v; }, removeItem: async (k) => { delete store[k]; },
  mergeItem: async (k, v) => { store[k] = JSON.stringify({ ...JSON.parse(store[k] || '{}'), ...JSON.parse(v) }); },
  clear: async () => { Object.keys(store).forEach((k) => delete store[k]); }, getAllKeys: async () => Object.keys(store),
  multiGet: async (ks) => ks.map((k) => [k, k in store ? store[k] : null]), multiSet: async (kv) => kv.forEach(([k, v]) => { store[k] = v; }),
  multiRemove: async (ks) => ks.forEach((k) => delete store[k]), flushGetRequests() {},
};
export default AS;
export const useAsyncStorage = (k) => ({ getItem: () => AS.getItem(k), setItem: (v) => AS.setItem(k, v), removeItem: () => AS.removeItem(k) });
