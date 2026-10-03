// react-native/Libraries/Utilities/codegenNativeComponent deep imports: app-declared Fabric components (src/specs/*NativeComponent.ts)
// must still render their children, so return a View passthrough instead of the no-op stub.
const RN = require('react-native');
module.exports = RN.codegenNativeComponent;
module.exports.default = RN.codegenNativeComponent;
module.exports.__esModule = true;
