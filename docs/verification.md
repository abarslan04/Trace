# Trace verification

Verified locally on 2026-10-09 using Node 24.19.0. No code was committed or pushed, and no app or Worker was deployed.

## Completed

- Strict TypeScript checks pass in both workspaces.
- **127 automated tests pass:** 79 backend tests and 48 mobile / integration tests.
- Web location regression: the old export timed out despite receiving browser GPS when watch IDs differed from Expo's internal IDs. The rebuilt export passes the same test, refreshes location, clears actual browser watch IDs, and works without the Permissions API. Run `TRACE_WEB_URL=http://localhost:8091 npm run test:location-browser` against a locally served export (uses installed Chrome by default). Physical iPhone confirmation requires uploading the new export to Pages and retrying there.
- Live local Worker + GraphHopper test passed for a 5 km request near the test origin: three routes, 1,248 ms. The smoke test checks distance tolerance, geometry, start proximity, closure, and unique IDs. This is one location/request, not a latency benchmark or field safety assessment.
- Backend coverage includes candidate refinement, distance limits, duplicate suppression, unsuitable paths, bidirectional validation, request budgets, partial results, cancellation, malformed provider responses, timeouts, input validation, status mapping, and CORS.
- Mobile coverage includes invalid API payloads, network and HTTP errors, bounded cancellation, GPS accuracy/freshness/denial/cleanup, corrupt saved data, serialized writes, double taps, stale restoration, late network responses, and unmount cancellation.
- A client-to-Worker integration test runs the actual client, handler, generator, and response validator together. Only the external routing provider is substituted.
- Geometry tests cover turnaround positioning with uneven vertex density and bounds crossing the date line. Color tests check body/support text and primary/error pairs in both themes against 4.5:1 contrast.
- Worker bundles successfully with `wrangler deploy --dry-run`; no upload occurs.
- Expo exports iOS and Android Hermes bundles and the web bundle. The web MapLibre worker is copied from the pinned installed package and included in the output.
- `expo prebuild --no-install --platform all` generates both native projects. The iOS Podfile includes MapLibre's post-install hook. Android includes foreground fine/coarse location permissions. The generated native directories were removed after verification, so the first device build regenerates them using the chosen development flags.
- Expo configuration introspection verifies local-development HTTP allowance on both platforms and disabled arbitrary cleartext in the production configuration.
- Actual local Worker HTTP smoke checks pass: health, unknown routes, method rejection, invalid input, structured errors, no-store, allowed-origin preflight, and rejected-origin CORS. This makes zero GraphHopper requests.
- Repeatable headless Chrome tests pass with actual OpenFreeMap street tiles. Controlled GPS and test route responses exercise permission granted/denied, custom-distance validation, configuration/offline errors, partial route results, route selection, persistence after reload, and no duplicate requests during restoration.
- Browser screenshots were inspected at 390×844 and 375×667 portrait, 667×375 landscape, and 1280×800 desktop, plus dark mode / reduced motion. The map displays streets, route numbers distinguish alternatives, and the persistent primary button remains inside the viewport. Screenshots are generated under ignored `artifacts/browser/`.

## Issues found and fixed

- Expo's installed web location adapter overwrote its internal subscription ID with the browser watch ID, dropped browser errors, and passed native accuracy options through without translating them. Added a browser-specific location implementation using `navigator.geolocation.watchPosition` directly, with `enableHighAccuracy`, fresh fixes, a bounded 45-second wait, error handling, cancellation, and cleanup. The 100 m accuracy requirement remains in place. Native location behavior is unchanged.
- A cached web export omitted the public API URL despite loading `.env`. A clean export embedded the configured Worker URL correctly; `build:web` now clears the bundler cache so releases pick up environment changes.
- Immediate provider 502: storing native `fetch` on the provider and calling it as a method caused Workers' `Illegal invocation` error. Reproduced in an isolated workerd runtime, wrapped the default fetch call, added a receiver regression test, and verified live generation. Restored the original 2 m joins and 97% return-corridor overlap checks; loosening them was unrelated to this failure.
- Missing mobile tests and strict TypeScript failures.
- MapLibre web worker resolution failure under Metro, despite a successful bundle export.
- Landscape planner collapsing because of conflicting flex settings.
- Turnaround marker using the midpoint vertex instead of half the travelled distance.
- Local HTTP configuration being ignored on Android; replaced with an explicit Expo config plugin.
- Expo's permissive default iOS ATS configuration; release configuration now explicitly disables arbitrary HTTP loads.
- Primary action scrolling below the initial phone viewport; moved to a persistent planner footer.
- Missing GraphHopper attribution and unclear distances after changing the target while keeping previous routes.

## Not yet verified

1. **Broader live routing:** the configured credential, `foot` profile, and path details worked in the live smoke test above. Still verify multiple urban/suburban/trail locations, actual street geometry, quota behavior, and route suitability on a device.
2. **Native compilation/runtime:** full Xcode, iOS simulator, and Android SDK are not installed here. Generated projects and exported bundles are not compiled native apps. Run `expo run:ios` / `expo run:android` in an equipped environment; then verify real GPS, denied/revoked permission, settings recovery, native map gestures and camera fitting, and app lifecycle behavior.
3. **Native accessibility:** check VoiceOver/TalkBack, largest Dynamic Type, keyboard focus with hardware keyboards, safe-area behavior, and native reduced-motion settings. Browser screenshots do not prove these behaviors.
4. **Latency:** p95 under five seconds remains a target, not a measured result. The implementation uses a 25-second generation deadline, an 8-second per-provider deadline, and a 30-second client network deadline. GPS acquisition has a separate 25-second native / 45-second browser limit. Measure on cellular and Wi-Fi with the real provider.
5. **Public operation:** no public deployment, aggregate rate limiter, production custom domain, or load test. A publicly reachable unauthenticated endpoint can exhaust the shared routing quota despite its eight-call per-generation cap. Decide edge limits and confirm free-tier terms before any approved release.

## Useful commands

```sh
npm run check
# In separate terminals:
npm run dev:backend
npm run dev:web
npm run test:worker
TRACE_BROWSER_CHANNEL=chrome npm run test:browser
```

For a browser without installed Chrome, use `npx playwright install chromium` then `npm run test:browser`. See the README for live-routing variables and native setup.
