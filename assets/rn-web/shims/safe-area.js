// react-native-safe-area-context with the device profile's insets (window.__HARNESS__.device.insets).
// Insets are read at boot; a mid-scenario "device" step (fold or unfold) re-renders through window resize, but code that
// cached insets at module level keeps the old values, exactly like a real app would.
import React, { useEffect, useState } from 'react';
import { View } from 'react-native';

const cur = () => {
  const d = (typeof window !== 'undefined' && window.__HARNESS__?.device) || { w: 390, h: 844, insets: { top: 47, bottom: 34 } };
  const i = { top: 0, bottom: 0, left: 0, right: 0, ...(d.insets || {}) };
  return { insets: i, frame: { x: 0, y: 0, width: d.w, height: d.h } };
};
const useLive = () => {
  const [v, set] = useState(cur);
  useEffect(() => { const on = () => set(cur()); window.addEventListener('resize', on); return () => window.removeEventListener('resize', on); }, []);
  return v;
};
export const initialWindowMetrics = cur();
export const SafeAreaInsetsContext = React.createContext(cur().insets);
export const SafeAreaFrameContext = React.createContext(cur().frame);
export const SafeAreaContext = SafeAreaInsetsContext;
export const SafeAreaProvider = ({ children, style }) => {
  const v = useLive();
  return (
    <SafeAreaFrameContext.Provider value={v.frame}>
      <SafeAreaInsetsContext.Provider value={v.insets}><View style={[{ flex: 1 }, style]}>{children}</View></SafeAreaInsetsContext.Provider>
    </SafeAreaFrameContext.Provider>
  );
};
export const SafeAreaConsumer = SafeAreaInsetsContext.Consumer;
export const useSafeAreaInsets = () => useLive().insets;
export const useSafeAreaFrame = () => useLive().frame;
export const withSafeAreaInsets = (C) => (p) => <C {...p} insets={useLive().insets} />;
export const SafeAreaView = React.forwardRef(({ edges, style, children, mode, ...rest }, ref) => {
  const { insets } = useLive();
  const e = Array.isArray(edges) ? edges : edges ? Object.keys(edges) : ['top', 'bottom', 'left', 'right'];
  const pad = { paddingTop: e.includes('top') ? insets.top : 0, paddingBottom: e.includes('bottom') ? insets.bottom : 0, paddingLeft: e.includes('left') ? insets.left : 0, paddingRight: e.includes('right') ? insets.right : 0 };
  return <View ref={ref} style={[{ flex: 1 }, style, pad]} {...rest}>{children}</View>;
});
