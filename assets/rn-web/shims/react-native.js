// react-native -> react-native-web, with the harness platform (ios/android from window.__HARNESS__) and stubs for native-only APIs.
import * as RNW from 'react-native-web/dist/index';
import React from 'react';
export * from 'react-native-web/dist/index';
const anyStub = require('./anyStub');

const H = (typeof window !== 'undefined' && window.__HARNESS__) || {};
const __os = H.platform || (typeof window !== 'undefined' && window.__HARNESS_PLATFORM__) || 'ios';
const P = __os === 'android'
  ? { OS: 'android', Version: 35, isPad: false, isTV: false, constants: { Release: '15', Model: 'Pixel 7', Brand: 'google', reactNativeVersion: { major: 0, minor: 80, patch: 0 } } }
  : { OS: 'ios', Version: '18.0', isPad: !!H.device?.tablet, isTV: false, isVision: false, constants: { osVersion: '18.0', interfaceIdiom: H.device?.tablet ? 'pad' : 'phone', reactNativeVersion: { major: 0, minor: 80, patch: 0 } } };
P.select = (o) => (__os in o ? o[__os] : 'native' in o ? o.native : o.default);
export const Platform = P;

const nativeModules = new Proxy({}, { get: (t, p) => (p in t ? t[p] : anyStub) });
export const NativeModules = nativeModules;
export const TurboModuleRegistry = { get: () => null, getEnforcing: () => anyStub };
export class NativeEventEmitter { constructor() {} addListener() { return { remove() {} }; } removeAllListeners() {} removeSubscription() {} emit() {} listenerCount() { return 0; } }
export const DeviceEventEmitter = { addListener: () => ({ remove() {} }), emit() {}, removeAllListeners() {} };
export const NativeAppEventEmitter = DeviceEventEmitter;
const passthrough = (name) => {
  const C = React.forwardRef((props, ref) => React.createElement(RNW.View, { ...props, ref }));
  C.displayName = `Native(${name})`;
  return C;
};
export const requireNativeComponent = (name) => passthrough(name);
export const codegenNativeComponent = (name) => passthrough(name);
export const codegenNativeCommands = () => anyStub;
export const PlatformColor = (...names) => names[0];
export const DynamicColorIOS = (o) => (H.dark ? o.dark : o.light);
export const Settings = { get: () => undefined, set() {}, watchKeys: () => 0, clearWatch() {} };
export const ToastAndroid = { show() {}, SHORT: 0, LONG: 1 };
export const UIManager = { ...(RNW.UIManager || {}), getViewManagerConfig: () => null, hasViewManagerConfig: () => false, setLayoutAnimationEnabledExperimental() {}, dispatchViewManagerCommand() {}, measure: RNW.UIManager?.measure, measureInWindow: RNW.UIManager?.measureInWindow };
export const findNodeHandle = (x) => x;
export const unstable_batchedUpdates = (fn, a) => fn(a);
export const processColor = (c) => c;
export const PermissionsAndroid = { request: async () => 'granted', check: async () => true, requestMultiple: async () => ({}), RESULTS: {}, PERMISSIONS: {} };
export const BackHandler = { addEventListener: () => ({ remove() {} }), removeEventListener() {}, exitApp() {} };
export const DevSettings = { addMenuItem() {}, reload() {} };
export const LogBox = { ignoreLogs() {}, ignoreAllLogs() {} };
export const InteractionManager = { runAfterInteractions: (fn) => { const t = setTimeout(() => (typeof fn === 'function' ? fn() : fn?.gen?.()), 0); return { then: (c) => c?.(), done() {}, cancel: () => clearTimeout(t) }; }, createInteractionHandle: () => 0, clearInteractionHandle() {} };
export const PanResponder = RNW.PanResponder;
const RImage = RNW.Image;
if (!RImage.resolveAssetSource) RImage.resolveAssetSource = (src) => (src == null ? null : typeof src === 'string' ? { uri: src } : typeof src === 'number' ? { uri: '' } : src);
export const Image = RImage;
const scheme = H.dark ? 'dark' : 'light';
const Appearance = RNW.Appearance || { addChangeListener: () => ({ remove() {} }) };
Appearance.getColorScheme = () => scheme;
export { Appearance };
export const useColorScheme = () => scheme;
const fontScale = H.fontScale || 1;
export const PixelRatio = { ...(RNW.PixelRatio || {}), get: () => H.device?.scale || 3, getFontScale: () => fontScale, getPixelSizeForLayoutSize: (s) => Math.round(s * (H.device?.scale || 3)), roundToNearestPixel: (s) => Math.round(s * 3) / 3 };
export const AccessibilityInfo = { ...(RNW.AccessibilityInfo || {}), isReduceMotionEnabled: async () => false, isScreenReaderEnabled: async () => false, addEventListener: () => ({ remove() {} }), announceForAccessibility() {} };
export const experimental_LayoutConformance = ({ children }) => children;
export const unstable_NativeText = RNW.Text;
export const unstable_NativeView = RNW.View;
export const RootTagContext = React.createContext(1);
export const DrawerLayoutAndroid = RNW.View;
export const ProgressBarAndroid = RNW.View;
export const InputAccessoryView = RNW.View;
export const Systrace = { beginEvent() {}, endEvent() {}, isEnabled: () => false };
const __rtl = (H.dir || (typeof window !== 'undefined' && window.__HARNESS_LANG__ === 'ar' ? 'rtl' : 'ltr')) === 'rtl';
export const I18nManager = { isRTL: __rtl, doLeftAndRightSwapInRTL: true, allowRTL() {}, forceRTL() {}, swapLeftAndRightInRTL() {}, getConstants: () => ({ isRTL: __rtl, doLeftAndRightSwapInRTL: true }) };
export default { ...RNW, Platform: P, NativeModules: nativeModules, I18nManager, PixelRatio };

// harness: emulate adjustsFontSizeToFit (iOS/Android shrink the font until the text fits its numberOfLines; react-native-web
// ignores the prop and truncates). Steps the DOM font size down to minimumFontScale (default 0.5 here) after layout.
const RNWText = RNW.Text;
const FitText = React.forwardRef((props, ref) => {
  const inner = React.useRef(null);
  const setRef = React.useCallback((n) => { inner.current = n; if (typeof ref === 'function') ref(n); else if (ref) ref.current = n; }, [ref]);
  React.useLayoutEffect(() => {
    const el = inner.current;
    if (!props.adjustsFontSizeToFit || !el || !el.style || typeof getComputedStyle === 'undefined') return undefined;
    // Keep the app's own inline font size (dynamic styles) as the starting point; only the harness's steps are undone.
    if (el.dataset.rhFont === undefined) el.dataset.rhFont = el.style.fontSize || '';
    const fit = () => {
      el.style.fontSize = el.dataset.rhFont;
      const base = parseFloat(getComputedStyle(el).fontSize) || 14;
      const min = base * (props.minimumFontScale || 0.5);
      let fs = base;
      // Sub-pixel overflow also triggers the ellipsis, and scrollWidth is rounded: measure the text run with a Range.
      const over = () => { const r = document.createRange(); r.selectNodeContents(el); return r.getBoundingClientRect().width > el.getBoundingClientRect().width + 0.01 || el.scrollHeight > el.clientHeight + 0.5; };
      for (let i = 0; i < 80 && over() && fs > min; i += 1) { fs -= 0.25; el.style.fontSize = `${fs}px`; }
    };
    fit();
    // The Yoga clamp (entry.js) and web fonts change the box after this effect: refit when the parent's box changes.
    const ro = typeof ResizeObserver !== 'undefined' && el.parentElement ? new ResizeObserver(() => fit()) : null;
    ro?.observe(el.parentElement);
    const t = setTimeout(fit, 300);
    document.fonts?.ready?.then(fit);
    return () => { ro?.disconnect(); clearTimeout(t); };
  });
  return React.createElement(RNWText, { ...props, ref: setRef });
});
FitText.displayName = 'Text';
export { FitText as Text };
