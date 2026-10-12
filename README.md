# Trace

Trace helps answer a simple question: **where should I run?** Choose a distance and generate up to three pedestrian out-and-back routes from your current location, then compare them on a map.

I like to run, but I don't always know where to go. I built Trace to turn a distance I want to run into a route I can follow, without planning every street myself.

The app supports distances from **1–30 km**, light and dark maps, and locally saved results. It plans routes; it does not record runs or provide turn-by-turn navigation.

## Architecture

```text
Expo app → Cloudflare Worker → GraphHopper
   ↓
MapLibre + OpenFreeMap
```

- **Expo, React Native, and TypeScript:** a shared app for iOS, Android, and the browser, with location access through Expo Location.
- **MapLibre and OpenFreeMap:** render maps independently of the routing service. Native builds use MapLibre React Native; the browser uses MapLibre GL JS.
- **Cloudflare Worker:** validates requests, coordinates route generation, and keeps the GraphHopper key out of the app. It runs locally through Wrangler during development.
- **GraphHopper's `foot` profile:** provides walking paths and road details without maintaining our own routing graph.
- **Device storage:** retains the latest route results. There are no user accounts or database.

The backend samples several directions, finds a turnaround near half the requested distance, and requests a return path separately to respect directional restrictions. It checks path details, continuity, and distance within ±5%, then removes substantially overlapping alternatives. Each generation uses at most eight provider requests; fewer than three valid routes can still be returned.

### Project structure

| Path | Purpose |
| --- | --- |
| `mobile/` | App screens, maps, location, API client, and local storage |
| `backend/src/index.ts` | HTTP endpoint, request validation, and CORS |
| `backend/src/generate.ts` | Route selection and validation |
| `backend/src/provider.ts` | GraphHopper requests and response parsing |
| `backend/src/geo.ts` | Distance and geometry helpers |
| `backend/src/errors.ts` | Structured API errors |
| `scripts/` | Live API, local Worker, and browser smoke checks |

## Run locally

Use **Node 24** and npm. From the repository root:

```sh
nvm use
npm ci
```

Create `backend/.dev.vars` with your GraphHopper Directions API key:

```dotenv
GRAPHHOPPER_API_KEY=your_key_here
ALLOWED_ORIGINS=http://localhost:8081,http://localhost:19006
```

Copy `mobile/.env.example` to `mobile/.env` if you haven't configured it already. For a browser or iOS simulator on this computer, use:

```dotenv
EXPO_PUBLIC_API_BASE_URL=http://localhost:8787
```

Start these in separate terminals from the repository root:

```sh
npm run dev:backend
```

```sh
npm run dev:web
```

Open the address Expo prints and allow location access. Browser location requires localhost or HTTPS. If Expo uses a different port, add that exact browser origin to `ALLOWED_ORIGINS` and restart the backend. Local development does not require a Cloudflare account or deployment.

Keep the GraphHopper key in the backend only. Both local environment files are ignored by Git; `EXPO_PUBLIC_*` values are bundled into the app and must never contain secrets.

### Native development

Native builds require Xcode on macOS for iOS, or an Android SDK for Android. **Expo Go cannot load the native MapLibre module.** Build a development client from `mobile/`:

```sh
cd mobile
TRACE_ALLOW_LOCAL_HTTP=true npx expo run:ios
# Or:
TRACE_ALLOW_LOCAL_HTTP=true npx expo run:android
```

For a physical phone, set the API URL to your computer's LAN address, such as `http://192.168.1.10:8787`, and connect both devices to the same network. Android emulators use `http://10.0.2.2:8787`.

Once the client is installed, `npm run dev:mobile` from the root starts its development server. Native dependency or configuration changes require rebuilding. If native projects already exist, run `TRACE_ALLOW_LOCAL_HTTP=true npx expo prebuild --no-install` before rebuilding to apply the HTTP setting. Hosted builds should use an HTTPS API and omit the local HTTP flag.

## Checks

```sh
npm run typecheck       # TypeScript checks
npm test                # Backend and mobile tests
npm run check           # Types, tests, Worker bundle, and app exports
npm run test:worker     # Running local API; no GraphHopper requests
npm run test:browser    # Web preview; requires Playwright Chromium or Chrome
```

To check real routing with the backend running:

```sh
TRACE_API_BASE_URL=http://localhost:8787 \
TRACE_TEST_LATITUDE=40.4237 \
TRACE_TEST_LONGITUDE=-86.9212 \
npm run test:live
```

The live check consumes GraphHopper credits. App exports check JavaScript bundles, not native compilation. See [verification notes](docs/verification.md) for detailed evidence and test limitations.

## Lessons learned

**What went wrong:** the backend stored the built-in `fetch` function on an object and called it as `this.fetcher(...)`. Cloudflare rejected that calling context with an “Illegal invocation” error, which became a generic 502 response. Wrapping it as `(input, options) => fetch(input, options)` fixed the call. Mocked tests had missed the runtime-specific behavior.

During debugging, we suspected network and Cloudflare configuration before proving the cause. We also loosened route checks without evidence that they caused the failure. Those changes were reverted, and the actual fix was verified against GraphHopper with three valid routes returned in about 1.25 seconds.

**What I'd do differently:** test one complete request in the actual Worker runtime earlier, alongside mocked tests. Preserve useful internal error diagnostics without exposing keys, and reproduce failures before changing infrastructure or route rules. The fetch fix now has a regression test.

## Location and routing data

Trace requests foreground location only. Generating routes sends coordinates to the Worker and GraphHopper; map requests reveal the viewed area to the tile provider. Saved routes stay in local, unencrypted device storage and do not include offline map tiles.

Routes rely on provider and OpenStreetMap data, so they cannot guarantee sidewalks, access, or current conditions. A route may start at a nearby mapped point rather than your exact GPS position. GraphHopper account quotas apply; check your plan before sharing a hosted instance.
