# Flutter apps

Two renderers; pick by what the audit needs.
- **Web build + shoot.mjs**: fastest for many states and flows with clicks. Real Dart code, real layout engine, browser
  network interception. Safe-area padding is 0 on web, so notch and fold overlap checks need the golden path.
- **Golden tests (flutter test)**: real widgets at exact device sizes, pixel ratios and safe-area padding, RTL and dark
  mode, no device or browser. Best for system-UI and inset issues and for screens that are hard to reach by URL.
Both feed from the same scenario JSON and write the same `shots/<device>/<name>-NN.png` layout.

## Web build + shoot.mjs
1. Clean copy (`git archive <ref> | tar -x -C $WORK/app`), `flutter pub get`.
2. Build with the API base the scenarios will match (any host works for browser calls):
   `flutter build web --release --dart-define=API_BASE_URL=https://api.example.com` (use the app's own define or flavor
   names; read `lib/main*.dart`, `--dart-define` usage, `.env` loaders).
3. Serve `build/web` (`python3 -m http.server 8080 -d build/web`) and shoot with `--base=http://localhost:8080`.
   Routes are URL paths: Flutter web apps use hash (`/#/orders/123`) or path URL strategy; set `"url"` accordingly.
4. Clicking: Flutter draws text on a canvas, so text clicks need the semantics tree. Turn it on once per page:
   `{ "clickSelector": "flt-semantics-placeholder", "wait": 300 }` (or `"init"` that calls
   `SemanticsBinding.instance.ensureSemantics()` through a debug hook the app exposes). Then click by accessible label:
   `{ "clickSelector": "[aria-label='Cancel order']" }`. Text clicks (`"click"`) work only on semantics labels.
5. Fonts and icons ship in the build; first paint can take a few seconds (`settleMs` 2000 to 3000).
6. Dart `http` and `dio` on web use XHR: interception, `times`, errors and `networkError` all work as documented.

## Golden tests
Render the real screen widget with the scenario's data at each device profile:
```dart
// test/render_harness/orders_golden_test.dart   (helper test; not a product test)
import 'dart:convert'; import 'dart:io';
import 'package:flutter/material.dart'; import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http; import 'package:http/testing.dart';

// devices: python <SKILL>/scripts/devices_export.py --devices phones,duo --format flutter  (paste the map here)
const devices = <String, Map<String, double>>{ 'iphone-15': {'w': 393, 'h': 852, 'dpr': 3, 'top': 59, 'bottom': 34, 'left': 0, 'right': 0} };

// Answer the app's HTTP calls from a scenario file (node use_scenario.mjs <scenario> --print > test/render_harness/<name>.routes.json)
http.Client scenarioClient(String routesFile) {
  final routes = (jsonDecode(File(routesFile).readAsStringSync())['routes'] as List).cast<Map<String, dynamic>>();
  return MockClient((req) async {
    for (final r in routes) {
      final m = (r['method'] ?? 'GET').toString().toUpperCase();
      final pathOk = r['path'] != null ? req.url.path == r['path'] : (r['pathRegex'] != null && RegExp(r['pathRegex']).hasMatch(req.url.path));
      if ((m == '*' || m == req.method) && pathOk) {
        return http.Response(r['data'] != null ? jsonEncode(r['data']) : (r['body'] ?? ''), r['status'] ?? 200, headers: {'content-type': 'application/json'});
      }
    }
    return http.Response('{"error":"render-harness: no mock"}', 404);
  });
}

void main() {
  for (final e in devices.entries) {
    for (final rtl in [false, true]) {
      testWidgets('orders ${e.key} ${rtl ? 'ar' : 'en'}', (tester) async {
        final d = e.value;
        tester.view.devicePixelRatio = d['dpr']!;
        tester.view.physicalSize = Size(d['w']! * d['dpr']!, d['h']! * d['dpr']!);
        tester.view.padding = FakeViewPadding(top: d['top']! * d['dpr']!, bottom: d['bottom']! * d['dpr']!, left: d['left']! * d['dpr']!, right: d['right']! * d['dpr']!);
        addTearDown(tester.view.reset);
        await loadAppFonts();   // real fonts: golden_toolkit or alchemist helper; the default test font draws boxes
        await tester.pumpWidget(MyApp(httpClient: scenarioClient('test/render_harness/orders.routes.json'), locale: Locale(rtl ? 'ar' : 'en'), initialRoute: '/orders'));
        await tester.pumpAndSettle();
        await expectLater(find.byType(MaterialApp), matchesGoldenFile('../../shots/${e.key}/orders__list${rtl ? '__ar' : ''}-01.png'));
      });
    }
  }
}
```
Run with `flutter test test/render_harness --update-goldens` (writes the PNGs), then use the same contact sheets,
review and report. Adapt how the app receives its HTTP client (constructor injection, a provider or get_it override,
`HttpOverrides`, a dio adapter); never change product code to make it testable: if the client cannot be injected, use the
web path with interception or the mock server (`--dart-define` pointing the base URL at `mock_server.mjs`).
Dark mode: `tester.platformDispatcher.platformBrightnessTestValue = Brightness.dark`; text scale:
`tester.platformDispatcher.textScaleFactorTestValue = 1.3`. Fold and unfold: change `physicalSize` mid-test and pump.

## What is real and what is not
Real: Dart code, widgets, layout, fonts (once loaded), the app's state management. Not reproduced on web: safe-area
padding, platform channels (camera, maps, payments render as whatever the plugin's web stub draws), `Platform.isIOS`
branches (web is neither). Golden tests: no platform views, no real network timing, animations settle instantly.
