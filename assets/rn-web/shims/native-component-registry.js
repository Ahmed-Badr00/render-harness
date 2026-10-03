// react-native/Libraries/NativeComponent/NativeComponentRegistry: the RN babel preset's codegen plugin rewrites every
// codegenNativeComponent('X') spec into NativeComponentRegistry.get('X', ...). Return a View passthrough so app-declared
// Fabric components render their children instead of crashing with "Element type is invalid ... got: undefined".
const RN = require('react-native');
const get = (name) => RN.codegenNativeComponent(name);
module.exports = { __esModule: true, get, getWithFallback_DEPRECATED: get, setRuntimeConfigProvider() {}, unstable_hasStaticViewConfig: () => true };
