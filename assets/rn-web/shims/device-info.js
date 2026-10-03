// react-native-device-info with values from the device profile. ADAPT getVersion/getBundleId if the app branches on them.
const H = (typeof window !== 'undefined' && window.__HARNESS__) || {};
const ios = (H.platform || 'ios') === 'ios';
const s = (v) => () => v;
const a = (v) => async () => v;
const D = {
  getVersion: s('9.9.9'), getBuildNumber: s('999'), getReadableVersion: s('9.9.9.999'), getBundleId: s('com.example.app'), getApplicationName: s('app'),
  getDeviceId: s(ios ? 'iPhone16,1' : 'Pixel7'), getModel: s(H.device?.label || (ios ? 'iPhone' : 'Pixel 7')), getBrand: s(ios ? 'Apple' : 'google'), getSystemName: s(ios ? 'iOS' : 'Android'),
  getSystemVersion: s(ios ? '18.0' : '15'), getUniqueId: a('harness-unique-id'), getUniqueIdSync: s('harness-unique-id'), isTablet: s(!!H.device?.tablet), hasNotch: s((H.device?.insets?.top || 0) > 24),
  hasDynamicIsland: s((H.device?.chrome || []).includes('ios-island')), isEmulator: a(false), isEmulatorSync: s(false), getDeviceType: s(H.device?.tablet ? 'Tablet' : 'Handset'),
  getFontScale: a(H.fontScale || 1), getFontScaleSync: s(H.fontScale || 1), getManufacturer: a(ios ? 'Apple' : 'Google'), getManufacturerSync: s(ios ? 'Apple' : 'Google'),
  getIpAddress: a('0.0.0.0'), getCarrier: a(''), getUserAgent: a('render-harness'), getUserAgentSync: s('render-harness'), isLandscape: a((H.device?.w || 0) > (H.device?.h || 1)), isLandscapeSync: s((H.device?.w || 0) > (H.device?.h || 1)),
  getTotalMemory: a(8e9), getTotalMemorySync: s(8e9), getUsedMemory: a(1e9), getFirstInstallTime: a(0), getInstallReferrer: a(''), getDeviceName: a('Test device'), getDeviceNameSync: s('Test device'),
  supportedAbis: a(['arm64']), getApiLevel: a(ios ? 0 : 35), getApiLevelSync: s(ios ? 0 : 35), isLocationEnabled: a(true), getPowerState: a({}), isBatteryCharging: a(false), getBatteryLevel: a(1),
};
export default new Proxy(D, { get: (t, p) => (p in t ? t[p] : () => undefined) });
export const { getVersion, getBuildNumber, getUniqueId, getModel, getSystemVersion, isTablet, hasNotch, getBundleId } = D;
export const useIsEmulator = () => ({ loading: false, result: false });
