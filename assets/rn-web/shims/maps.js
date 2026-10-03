import { MapPlaceholder } from './placeholder-view';
import { View } from 'react-native';
export default MapPlaceholder;
export const Marker = View; export const Polyline = View; export const Circle = View; export const Polygon = View; export const Callout = View;
export const PROVIDER_GOOGLE = 'google'; export const PROVIDER_DEFAULT = null;
export const AnimatedRegion = class { constructor(v) { Object.assign(this, v); } timing() { return { start() {} }; } };
