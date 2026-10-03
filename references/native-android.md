# Native Android apps (Jetpack Compose, Views) and Compose Multiplatform

Two renderers; both write `shots/<device>/<flow>__<name>[__ar][__dark]-NN.png`.
- **JVM screenshot tests** (Paparazzi, or Roborazzi on Robolectric): render real composables and layouts at any
  profile's size and density, RTL, night mode and font scale, no emulator. Fast; best for many states.
- **Emulator** (the real app): real OS behaviour, insets, keyboard, foldable postures; slower; confirm top issues here.

## Paparazzi (or Roborazzi)
1. Clean copy in `$WORK/app`; add the Paparazzi Gradle plugin to the module under test in the copy only.
2. Devices: `python <SKILL>/scripts/devices_export.py --devices android,foldables --format kotlin` prints `DeviceConfig`
   values (pixels, dpi) for the shared device matrix.
3. Data: answer network calls from the scenario files with OkHttp `MockWebServer` (point the app's base URL at
   `server.url("/")` through the DI graph the app already has), or a fake repository that parses the route JSON:
```kotlin
// Routes: node use_scenario.mjs <scenario> --print > src/test/resources/<name>.routes.json
fun scenarioDispatcher(routes: List<Map<String, Any?>>) = object : Dispatcher() {
  override fun dispatch(request: RecordedRequest): MockResponse {
    val path = request.requestUrl!!.encodedPath
    val hit = routes.firstOrNull { r ->
      val m = (r["method"] as String? ?: "GET").uppercase()
      val ok = (r["path"] as String?)?.let { it == path } ?: (r["pathRegex"] as String?)?.toRegex()?.containsMatchIn(path) ?: false
      (m == "*" || m == request.method) && ok
    } ?: return MockResponse().setResponseCode(404).setBody("""{"error":"render-harness: no mock"}""")
    return MockResponse().setResponseCode((hit["status"] as Number?)?.toInt() ?: 200)
      .setHeader("Content-Type", "application/json").setBody(hit["data"]?.let { gson.toJson(it) } ?: (hit["body"] as String? ?: ""))
  }
}
```
4. Render each profile and variant, then copy the recorded PNGs into the shared layout:
```kotlin
@RunWith(TestParameterInjector::class)   // com.google.testparameterinjector
class OrdersScreenshots(@TestParameter("pixel-7", "galaxy-fold-cover", "galaxy-fold-open") val device: String, @TestParameter("en", "ar") val lang: String) {
  @get:Rule val paparazzi = Paparazzi(deviceConfig = renderHarnessDevices.getValue(device).copy(locale = lang,
      layoutDirection = if (lang == "ar") LayoutDirection.RTL else LayoutDirection.LTR))
  @Test fun list() = paparazzi.snapshot(name = "orders__list" + if (lang == "ar") "__ar" else "") { OrdersScreen(viewModel = viewModelWith(FakeOrdersApi("orders-two.routes.json"))) }
}
```
   Night mode: `nightMode = NightMode.NIGHT`; font scale: `fontScale = 1.3f`; fold and unfold: render the same state
   with the cover and open configs. `./gradlew :app:recordPaparazziDebug` writes PNGs under
   `src/test/snapshots/images/`; copy them to `$WORK/shots/<device>/` with the shared names (a small shell loop).
   Wait for coroutines and image loading (test dispatchers, Coil test engine) so shots are not mid-load.

## Emulator (the real app)
- AVDs per profile (screen size in dp and density from devices.json); foldable AVDs exist for Pixel Fold and resizable
  emulators. Boot with `emulator -avd <name>`.
- Data: `node $WORK/runner/mock_server.mjs --port=9999` and the app's base URL pointed at `http://10.0.2.2:9999` (the
  emulator's alias for the host); `node $WORK/runner/use_scenario.mjs <scenario>` before each state. Allow cleartext for
  that host only in a debug build config the app already has; never change release code.
- Navigate with `adb shell am start -W -a android.intent.action.VIEW -d '<deep link>'`; capture
  `adb exec-out screencap -p > shots/<device>/<name>-01.png`; posture changes with the emulator's fold controls or
  `adb emu fold` / `adb emu unfold` on foldable images.

## What is real and what is not
JVM tests: real composables, resources, themes and fonts through layoutlib; no real insets animation, no system bars
unless the config draws them, no platform services (maps, camera, Play services). Emulator: real OS, test data.
