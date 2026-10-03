import React from 'react';
import { View, StyleSheet } from 'react-native';
const toCss = (c) => c;
const LinearGradient = React.forwardRef(({ colors = [], locations, start = { x: 0.5, y: 0 }, end = { x: 0.5, y: 1 }, angle, useAngle, style, children, ...rest }, ref) => {
  const dx = end.x - start.x; const dy = end.y - start.y;
  const deg = useAngle && angle != null ? angle : (Math.atan2(dx, -dy) * 180) / Math.PI;
  const stops = colors.map((c, i) => `${toCss(c)}${locations && locations[i] != null ? ` ${locations[i] * 100}%` : ''}`).join(', ');
  return (
    <View ref={ref} style={style} {...rest}>
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundImage: `linear-gradient(${deg}deg, ${stops})`, borderRadius: StyleSheet.flatten(style)?.borderRadius }]} />
      {children}
    </View>
  );
});
export default LinearGradient;
export { LinearGradient };
