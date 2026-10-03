// @sentry/react-native: no-op, but its HOCs must return renderable components. Apps often wrap screens with
// Sentry.wrap(Screen) only when __DEV__ is false (the harness defines __DEV__ = false); the generic Proxy stub returns
// undefined there and the screen renders nothing, silently.
const anyStub = require('./anyStub');
const passthrough = ({ children }) => children ?? null;
module.exports = new Proxy({
  __esModule: true,
  wrap: (C) => C,
  withErrorBoundary: (C) => C,
  withProfiler: (C) => C,
  ErrorBoundary: passthrough,
  Profiler: passthrough,
  TouchEventBoundary: passthrough,
}, { get: (t, p) => (p in t ? t[p] : anyStub[p]) });
