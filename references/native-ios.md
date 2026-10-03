# Native iOS apps (SwiftUI, UIKit)

Two renderers; both write `shots/<device>/<flow>__<name>[__ar][__dark]-NN.png` so contact sheets, review and the report
work unchanged.
- **Snapshot tests** (swift-snapshot-testing): render real views at any profile's size, safe area and traits inside
  XCTest, no app launch. Fast, exact sizes, RTL, dark mode and Dynamic Type; best for many states.
- **Simulator** (the real app): exact OS behaviour (system UI, keyboard, sheets, real safe areas, foldables), slower,
  one state at a time through deep links. Use it to confirm the top issues and for OS-level behaviour.

## Snapshot tests
1. Clean copy of the repo in `$WORK/app` (never edit the user's checkout or add files there); add a test target or a
   test file under a throwaway folder in the copy. Add `swift-snapshot-testing` with SPM if the project does not have it.
2. Devices: `python <SKILL>/scripts/devices_export.py --devices phones,duo --format swift` prints `ViewImageConfig`
   values (points, safe area, scale, idiom) for the shared device matrix.
3. Data: answer the app's network calls from the scenario files with a URLProtocol stub registered on the session the
   app uses (or inject a stub API client if the app has a protocol for it):
```swift
// ScenarioURLProtocol.swift (test helper). Routes come from: node use_scenario.mjs <scenario> --print > <name>.routes.json
final class ScenarioURLProtocol: URLProtocol {
  static var routes: [[String: Any]] = []
  override class func canInit(with request: URLRequest) -> Bool { true }
  override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
  override func startLoading() {
    let url = request.url!, method = request.httpMethod ?? "GET"
    let hit = Self.routes.first { r in
      let m = (r["method"] as? String ?? "GET").uppercased()
      let pathOk = (r["path"] as? String).map { $0 == url.path } ?? (r["pathRegex"] as? String).map { url.path.range(of: $0, options: .regularExpression) != nil } ?? false
      return (m == "*" || m == method) && pathOk
    }
    let status = hit?["status"] as? Int ?? (hit == nil ? 404 : 200)
    let body: Data = hit.flatMap { $0["data"] }.flatMap { try? JSONSerialization.data(withJSONObject: $0) } ?? Data((hit?["body"] as? String ?? "{\"error\":\"render-harness: no mock\"}").utf8)
    client?.urlProtocol(self, didReceive: HTTPURLResponse(url: url, statusCode: status, httpVersion: nil, headerFields: ["Content-Type": "application/json"])!, cacheStoragePolicy: .notAllowed)
    client?.urlProtocol(self, didLoad: body)
    client?.urlProtocolDidFinishLoading(self)
  }
  override func stopLoading() {}
}
```
   Register it with `URLSessionConfiguration.protocolClasses = [ScenarioURLProtocol.self]` on the app's session (or
   `URLProtocol.registerClass` for `URLSession.shared`).
4. Render and save with the shared naming:
```swift
// Records PNGs named "<device>__<variant>" into a temp folder; a shell loop then moves them to $WORK/shots/<device>/.
func testOrdersList() throws {
  ScenarioURLProtocol.routes = try loadRoutes("orders-two.routes.json")   // small JSONSerialization helper
  let out = ProcessInfo.processInfo.environment["RH_SHOTS"] ?? NSTemporaryDirectory() + "rh-shots"
  for (id, config) in renderHarnessDevices {
    for (variant, traits) in [("en", UITraitCollection()), ("ar", UITraitCollection(layoutDirection: .rightToLeft)), ("dark", UITraitCollection(userInterfaceStyle: .dark))] {
      let view = OrdersView(model: .live)
        .environment(\.layoutDirection, variant == "ar" ? .rightToLeft : .leftToRight)
        .environment(\.locale, Locale(identifier: variant == "ar" ? "ar" : "en"))
      let vc = UIHostingController(rootView: view)
      _ = verifySnapshot(of: vc, as: .wait(for: 1.5, on: .image(on: config, traits: traits)), named: "\(id)__\(variant)",
                         record: true, snapshotDirectory: out)
    }
  }
}
// then: for f in $RH_SHOTS/testOrdersList.*.png; do n=${f##*.testOrdersList.}; d=${n%%__*}; v=${n#*__}; v=${v%.png};
//   s=$([ "$v" = en ] && echo "" || echo "__$v"); mkdir -p $WORK/shots/$d; cp "$f" "$WORK/shots/$d/orders__list$s-01.png"; done
```
   `.wait(for:)` gives async loads time to finish; for long loads wait on the view model with an expectation first.
   Arabic copy also needs the Arabic localization in the bundle and Arabic data.
5. Run with `xcodebuild test -scheme <Scheme> -destination 'platform=iOS Simulator,name=iPhone 15' -only-testing:<Target>/<Test>`.

## Simulator (the real app)
- Devices: `devices_export.py --format simctl` names a simulator type per profile; create and boot with
  `xcrun simctl create`, `xcrun simctl boot`. Foldables (iPhone Duo) need the Xcode version that ships them; the device
  hub's fold, open and rotate controls change the posture.
- Data: run `node $WORK/runner/mock_server.mjs --port=9999`, start the app with its API base pointed at
  `http://localhost:9999` (launch argument or environment variable the app already reads; the simulator shares the
  Mac's localhost), then `node $WORK/runner/use_scenario.mjs <scenario> --scenarios=$WORK/scenarios` before each state.
- Navigate with deep links (`xcrun simctl openurl <udid> '<scheme>://...'`) and capture
  `xcrun simctl io <udid> screenshot --display=<id> <file>` (foldables have several displays: `xcrun simctl io <udid> enumerate`).
- Taps: XCUITest element taps are the most reliable; coordinate taps can land on the wrong display or orientation on
  multi-display devices. Never confirm destructive actions in a real account.

## What is real and what is not
Snapshots: real views and layout, but no real window scene (safe area comes from the config), no keyboard, no system
sheets, async work must be awaited. Simulator: real OS, but a test account and the mock server's data.
