// react-native-gesture-handler with the legacy handler components as passthroughs (their web build demands a DOM child and crashes on RN components).
export * from 'react-native-gesture-handler/lib/module/index.js';
const Pass = ({ children }) => children ?? null;
export const NativeViewGestureHandler = Pass;
export const TapGestureHandler = Pass;
export const PanGestureHandler = Pass;
export const LongPressGestureHandler = Pass;
export const PinchGestureHandler = Pass;
export const RotationGestureHandler = Pass;
export const FlingGestureHandler = Pass;
export const ForceTouchGestureHandler = Pass;
