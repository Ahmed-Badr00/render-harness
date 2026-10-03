// Generic visual placeholder for native-only views (maps, video, webview, lottie, blur, camera).
import React from 'react';
import { View, Text } from 'react-native';
const make = (label, visible = true) => React.forwardRef(({ style, children, source, width, height }, ref) => (
  <View ref={ref} style={[{ overflow: 'hidden' }, width ? { width } : null, height ? { height } : null, style, visible ? { backgroundColor: 'rgba(120,130,150,0.12)', alignItems: 'center', justifyContent: 'center' } : null]}>
    {visible ? <Text style={{ fontSize: 9, color: '#7a8396' }}>{label}</Text> : null}
    {children}
  </View>
));
export const Placeholder = make('native view');
export const MapPlaceholder = make('MAP');
export const VideoPlaceholder = make('VIDEO');
export const WebPlaceholder = make('WEBVIEW');
export const LottiePlaceholder = make('', false);
export const BlurPlaceholder = React.forwardRef(({ style, children, blurType, blurAmount, reducedTransparencyFallbackColor, ...rest }, ref) => (
  <View ref={ref} style={[style, { backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', backgroundColor: 'rgba(255,255,255,0.6)' }]} {...rest}>{children}</View>
));
export default Placeholder;
