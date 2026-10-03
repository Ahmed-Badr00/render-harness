// Catch-all stub for native-only modules. Every property is a no-op function that also behaves as an object.
const handler = {
  get(target, prop) {
    if (prop === '__esModule') return true;
    if (prop === 'default') return proxy;
    if (prop === 'then') return undefined;
    if (prop === Symbol.toPrimitive) return () => '';
    if (prop === Symbol.iterator) return undefined;
    if (prop === 'toString' || prop === 'valueOf') return () => '';
    if (prop === '$$typeof') return undefined;
    if (prop === 'prototype') return {};
    if (!(prop in target)) target[prop] = new Proxy(function () {}, handler);
    return target[prop];
  },
  apply() { return undefined; },
  construct() { return new Proxy({}, handler); },
};
const proxy = new Proxy(function () {}, handler);
module.exports = proxy;
