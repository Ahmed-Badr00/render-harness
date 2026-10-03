// Renders a React Native app's real code in the browser through react-native-web.
// Lives in <WORK>/harness/; <WORK> is a clean export of the app repo with node_modules installed (see references/react-native.md).
// ADAPT: STUBBED (native-only packages that crash on web), EXTRA_ALIAS, TRANSPILE (RN packages shipped untranspiled).
const fs = require('fs');
const path = require('path');
const webpack = require('webpack');
const HtmlWebpackPlugin = require('html-webpack-plugin');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.HARNESS_PORT || 8787);
const PLATFORM_EXT = process.env.HARNESS_PLATFORM_EXT || 'ios'; // which .ios / .android files webpack prefers
const S = (p) => path.resolve(__dirname, 'shims', p);
const STUB = S('anyStub.js');
const has = (m) => { try { require.resolve(m, { paths: [ROOT] }); return true; } catch (e) { return false; } };

// App import aliases from babel module-resolver (and tsconfig paths, if you add them here).
let resolverOpts = null;
const appAlias = {};
try {
  const bc = require(path.join(ROOT, 'babel.config.js'));
  const cfg = typeof bc === 'function' ? bc({ cache: () => {}, env: () => 'development', caller: () => false }) : bc;
  const mr = (cfg.plugins || []).find((p) => Array.isArray(p) && /module-resolver/.test(String(p[0])));
  if (mr) { resolverOpts = mr[1]; for (const [k, v] of Object.entries(mr[1].alias || {})) appAlias[k] = path.resolve(ROOT, Array.isArray(v) ? v[0] : v); }
} catch (e) { console.warn('[harness] no babel module-resolver aliases:', e.message); }

const STUBBED = [ // ADAPT: add a package here when its import crashes the boot (read the BOOT FAILED stack)
  '@react-native-firebase/app', '@react-native-firebase/analytics', '@react-native-firebase/messaging', '@react-native-firebase/crashlytics',
  'react-native-permissions', 'react-native-share', 'react-native-image-picker', 'react-native-vision-camera', 'react-native-keychain', 'react-native-biometrics',
  'react-native-bootsplash', 'react-native-splash-screen', 'react-native-haptic-feedback', 'react-native-blob-util', 'react-native-fs', 'react-native-pdf', 'react-native-sound',
  'react-native-contacts', 'react-native-geolocation-service', '@react-native-community/geolocation', 'react-native-in-app-review', 'react-native-google-mobile-ads',
  'react-native-view-shot', '@shopify/react-native-skia', 'react-native-code-push', 'react-native-push-notification', '@notifee/react-native', 'react-native-mmkv',
  'react-native-quick-crypto', 'react-native-nitro-modules', 'react-native-date-picker', 'react-native-adjust', 'appsflyer-react-native-plugin', '@segment/analytics-react-native',
].filter(has);
const SHIMS = {
  'react-native$': S('react-native.js'),
  'react-native-safe-area-context$': S('safe-area.js'),
  'react-native-gesture-handler$': S('gesture-handler.js'),
  'react-native-linear-gradient$': S('linear-gradient.js'),
  'expo-linear-gradient$': S('linear-gradient.js'),
  'react-native-fast-image$': S('fast-image.js'),
  '@d11/react-native-fast-image$': S('fast-image.js'),
  'lottie-react-native$': S('lottie.js'),
  'react-native-maps$': S('maps.js'),
  'react-native-video$': S('video.js'),
  'react-native-webview$': S('webview.js'),
  '@react-native-community/blur$': S('blur.js'),
  'react-native-device-info$': S('device-info.js'),
  'react-native-localize$': S('localize.js'),
  '@react-native-async-storage/async-storage$': S('async-storage.js'),
  'react-native-navigation$': S('rnn.js'),
  '@sentry/react-native$': S('sentry.js'), // its HOCs must pass the component through
  'react-native-default-preference$': S('default-preference.js'),
};
const EXTRA_ALIAS = { // ADAPT
  ...(has('@react-navigation/native') ? {} : { '@react-navigation/native$': STUB }),
  ...(has('axios') ? { 'axios$': require.resolve('axios/dist/browser/axios.cjs', { paths: [ROOT] }) } : {}),
  // A local package whose "main" points at an unbuilt lib/ fails has(), so STUBBED skips it: alias it here instead.
  // 'some-local-native-plugin$': STUB,
};
const TRANSPILE = /node_modules[\\/](react-native(?!-web)[^\\/]*|@react-native[^\\/]*|@react-navigation[^\\/]*|expo[^\\/]*|@expo[^\\/]*|@gorhom|@shopify|react-native-reanimated|react-native-worklets|react-native-svg|react-native-gesture-handler)[\\/]/;

const preset = has('babel-preset-expo') ? 'babel-preset-expo' : has('@react-native/babel-preset') ? 'module:@react-native/babel-preset' : 'module:metro-react-native-babel-preset';
const plugins = [];
if (resolverOpts) plugins.push(['module-resolver', { ...resolverOpts, root: [ROOT], cwd: ROOT, alias: appAlias }]);
if (has('react-native-worklets/plugin')) plugins.push('react-native-worklets/plugin');
else if (has('react-native-reanimated/plugin')) plugins.push('react-native-reanimated/plugin');
const babel = (forApp) => ({
  babelrc: false, configFile: false, cacheDirectory: path.join(__dirname, '.babel-cache'),
  presets: [[preset, forApp ? { disableImportExportTransform: false, lazyImportExportTransform: () => true, enableBabelRuntime: false } : { disableImportExportTransform: true, enableBabelRuntime: false }], ['@babel/preset-typescript', { allowDeclareFields: true }]],
  plugins,
});
const isHarness = (p) => p.startsWith(__dirname + path.sep);
const isNM = (p) => p.includes(`${path.sep}node_modules${path.sep}`);
// No '.native' here: packages with a web implementation (reanimated 4, worklets, many others) ship web code as plain .js
// and native code as .native.js. If a package ships ONLY .native files, alias that one file in EXTRA_ALIAS.
const ext = ['web', PLATFORM_EXT].flatMap((e) => [`.${e}.tsx`, `.${e}.ts`, `.${e}.jsx`, `.${e}.js`]);

module.exports = {
  mode: 'development',
  devtool: false,
  context: __dirname,
  entry: path.join(__dirname, 'src/entry.js'),
  output: { path: path.join(__dirname, 'dist'), filename: 'bundle.js', publicPath: '/' },
  resolve: {
    extensions: [...ext, '.tsx', '.ts', '.jsx', '.js', '.mjs', '.cjs', '.json', '.svg'],
    mainFields: ['browser', 'module', 'react-native', 'main'],
    conditionNames: ['browser', 'import', 'require', 'default'],
    modules: ['node_modules', path.join(ROOT, 'node_modules')],
    alias: { ...appAlias, ...Object.fromEntries(STUBBED.map((m) => [`${m}$`, STUB])), ...SHIMS, ...EXTRA_ALIAS },
    fallback: { crypto: false, stream: false, fs: false, path: false, os: false, http: false, https: false, zlib: false, net: false, tls: false, child_process: false, vm: false,
      ...(has('buffer') ? { buffer: require.resolve('buffer/', { paths: [ROOT] }) } : {}), ...(has('process') ? { process: require.resolve('process/browser', { paths: [ROOT] }) } : {}) },
    fullySpecified: false,
  },
  module: {
    rules: [
      { test: /\.m?js$/, resolve: { fullySpecified: false } },
      { test: /\.(js|jsx|ts|tsx)$/, include: (p) => !isNM(p) && !isHarness(p), use: { loader: 'babel-loader', options: babel(true) } },
      { test: /\.(js|jsx|ts|tsx)$/, include: (p) => isHarness(p), use: { loader: 'babel-loader', options: babel(false) } },
      { test: /\.(js|jsx|ts|tsx|mjs|cjs)$/, include: (p) => isNM(p) && TRANSPILE.test(p), use: { loader: 'babel-loader', options: babel(false) } },
      ...(has('@svgr/webpack') ? [{ test: /\.svg$/, use: [{ loader: '@svgr/webpack', options: { native: true, svgo: false } }] }] : []),
      { test: /\.(png|jpe?g|gif|webp|ttf|otf|woff2?|mp4|mp3|wav|lottie|riv)$/i, type: 'asset/resource' },
      // reanimated / worklets must see Platform.OS 'web' to run their JS implementation
      { include: (p) => /node_modules[\\/]react-native-(reanimated|worklets)[\\/]/.test(p), resolve: { alias: { 'react-native$': S('react-native-libweb.js') } } },
    ],
  },
  plugins: [
    new webpack.DefinePlugin({ __DEV__: JSON.stringify(false), 'process.env.NODE_ENV': JSON.stringify('development'), 'process.env.JEST_WORKER_ID': 'undefined', 'process.env.EXPO_OS': JSON.stringify('web') }),
    ...(has('process') ? [new webpack.ProvidePlugin({ process: 'process/browser', ...(has('buffer') ? { Buffer: ['buffer', 'Buffer'] } : {}) })] : []),
    new webpack.NormalModuleReplacementPlugin(/^react-native\/(Libraries|src)\//, (res) => {
      // Codegen deep imports return components the app renders; everything else is a no-op stub.
      res.request = /NativeComponentRegistry$/.test(res.request) ? S('native-component-registry.js') : /codegenNativeComponent$/.test(res.request) ? S('codegen-native.js') : /codegenNativeCommands$/.test(res.request) ? S('codegen-native-commands.js') : STUB;
    }),
    new webpack.NormalModuleReplacementPlugin(/(^|\/)\.storybook$/, (res) => { res.request = STUB; }), // apps that register a Storybook screen
    new HtmlWebpackPlugin({ templateContent: `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">${fs.existsSync(path.join(__dirname, 'fonts.css')) ? '<link rel="stylesheet" href="/fonts.css">' : ''}<style>html,body{margin:0;padding:0;background:#fff;-webkit-font-smoothing:antialiased}#root{width:390px;height:844px;overflow:hidden;position:relative}#root svg{flex-shrink:0}</style></head><body><div id="root"></div></body></html>` }),
  ],
  devServer: {
    port: PORT, hot: false, liveReload: false, client: false,
    static: [{ directory: path.join(__dirname, '..', '..', 'scenarios'), publicPath: '/scenarios', watch: false }, { directory: __dirname, publicPath: '/', watch: false }],
    devMiddleware: { writeToDisk: false },
  },
  performance: { hints: false },
  stats: 'errors-warnings',
  ignoreWarnings: [/export .* was not found/, /Critical dependency/, /Should not import the named export/],
  infrastructureLogging: { level: 'warn' },
};
