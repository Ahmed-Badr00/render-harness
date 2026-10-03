import React from 'react';
import { Image } from 'react-native';
const map = { contain: 'contain', cover: 'cover', stretch: 'stretch', center: 'center' };
// Stable onLoad/onError identities: react-native-web Image re-runs its load effect whenever these props change, so
// inline arrows here made every parent re-render restart the load (setState loop: "Maximum update depth exceeded").
const FastImage = React.forwardRef(({ source, resizeMode = 'cover', onLoad, onLoadEnd, onError, tintColor, style, children, defaultSource, fallback, ...rest }, ref) => {
  const cb = React.useRef({});
  cb.current = { onLoad, onLoadEnd, onError };
  const handleLoad = React.useCallback(() => { cb.current.onLoad?.({ nativeEvent: { width: 100, height: 100 } }); cb.current.onLoadEnd?.(); }, []);
  const handleError = React.useCallback((e) => { cb.current.onError?.(e); cb.current.onLoadEnd?.(); }, []);
  const uri = source && typeof source === 'object' ? source.uri : undefined;
  const src = React.useMemo(() => (uri !== undefined ? { uri } : source), [uri, typeof source === 'object' ? null : source]);
  return <Image ref={ref} source={src} resizeMode={map[resizeMode] || 'cover'} style={[style, tintColor ? { tintColor } : null]} onLoad={handleLoad} onError={handleError} {...rest} />;
});
FastImage.resizeMode = { contain: 'contain', cover: 'cover', stretch: 'stretch', center: 'center' };
FastImage.priority = { low: 'low', normal: 'normal', high: 'high' };
FastImage.cacheControl = { immutable: 'immutable', web: 'web', cacheOnly: 'cacheOnly' };
FastImage.preload = () => {};
FastImage.clearMemoryCache = async () => {};
FastImage.clearDiskCache = async () => {};
export default FastImage;
export const { resizeMode, priority, cacheControl } = FastImage;
