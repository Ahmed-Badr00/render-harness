// react-native as seen by libraries that have a real web implementation (reanimated 4, worklets): same shim, but
// Platform.OS is 'web' so they take their JS/web code paths (with OS 'ios' reanimated waits for a native runtime and
// animated styles never update). The app itself still sees the device platform.
import * as RN from './react-native';
export * from './react-native';
const P = { ...RN.Platform, OS: 'web', select: (o) => ('web' in o ? o.web : 'default' in o ? o.default : undefined) };
export const Platform = P;
export default { ...RN.default, Platform: P };
