# Trace MVP progress

Updated: 2026-10-09. Local implementation and live routing smoke verification are complete. Broader route coverage and native-device verification remain open. No deployment, push, or commit was performed during this fix.

## Finished

- [x] npm workspaces, pinned dependency lockfile, Node version, and CI check workflow.
- [x] Cloudflare Worker API with validation, structured errors, CORS, and server-only routing secret.
- [x] Real GraphHopper `foot` integration; candidate-based out-and-back routes; return validation; distance/suitability/duplicate checks; at most eight provider calls.
- [x] Expo mobile app with native MapLibre, GPS/permission recovery, distance controls, route selection, persistent generation action, cancellation, errors, and local route storage.
- [x] Web map adapter with real street tiles and packaged MapLibre worker.
- [x] Light/dark design system, route numbering, accessibility labels, safe-area layout, and reduced-motion camera behavior.
- [x] Strict TypeScript checks and 127 passing automated tests (79 backend, 48 mobile/integration).
- [x] Fixed web GPS callback loss in Expo's browser adapter with direct browser geolocation, high-accuracy options, error callbacks, and correct watch cleanup. Reproduced the old callback-ID failure in the exported app and verified the new export passes. Phone retest follows Pages upload.
- [x] Fixed Cloudflare `fetch` receiver error causing immediate 502 responses; added regression coverage and restored strict return-route validation.
- [x] Live local Worker + GraphHopper smoke test: three closed 5 km routes within tolerance, 1,248 ms.
- [x] Worker dry-run bundle and iOS/Android/web bundle exports.
- [x] Native project generation without installation; MapLibre Podfile hook and Android location permissions inspected.
- [x] Local HTTP dev configuration and HTTPS-oriented release configuration verified.
- [x] Actual local Worker HTTP smoke checks, without routing-provider calls.
- [x] Browser smoke tests and screenshot inspection: real tiles, controlled GPS/route responses, permission/errors, selection/restoration, narrow/landscape/desktop, dark/reduced motion.
- [x] README, reusable smoke scripts, design-system notes, and detailed `docs/verification.md`.

## Still needed to confirm the full device experience

- [ ] Expand live testing to additional locations and inspect real pedestrian routes on a device. The configured key and first live smoke test now work.
- [ ] Build and launch on iOS/Android using full Xcode or Android SDK; neither is installed in this environment.
- [ ] Verify real GPS, permission revocation/settings recovery, native map interactions, VoiceOver/TalkBack, largest font sizes, and safe areas on devices.
- [ ] Measure real generation latency on cellular/Wi-Fi and validate account quotas. The five-second p95 target is not yet measured.
- [ ] Only if requested later: approve deployment and configure edge abuse limits before exposing the unauthenticated API publicly.

## Resume here

1. Read `README.md` for setup and `docs/verification.md` for exact evidence and limitations.
2. Use Node 24 and run `npm ci` followed by `npm run check`.
3. Start the Worker with `npm run dev:backend`; the server-only key is already configured locally. Use `npm run test:live` with explicit coordinates for additional live checks.
4. For native development, apply `TRACE_ALLOW_LOCAL_HTTP=true` during prebuild and rebuild the development client. Use HTTPS and omit the flag for production.

Do not treat bundle exports or fixture-based UI checks as proof of live routing or native runtime success.
