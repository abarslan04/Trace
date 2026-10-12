// Opt-in live test: consumes up to eight GraphHopper credits. Never prints GPS geometry.
const baseUrl = process.env.TRACE_API_BASE_URL;
const latitude = Number(process.env.TRACE_TEST_LATITUDE);
const longitude = Number(process.env.TRACE_TEST_LONGITUDE);
const distanceMeters = Number(process.env.TRACE_TEST_DISTANCE_METERS ?? 5000);
if (!baseUrl || !process.env.TRACE_TEST_LATITUDE || !process.env.TRACE_TEST_LONGITUDE) {
  throw new Error('Set TRACE_API_BASE_URL, TRACE_TEST_LATITUDE, and TRACE_TEST_LONGITUDE. This test uses real GraphHopper credits.');
}
const started = performance.now();
const response = await fetch(`${baseUrl.replace(/\/$/, '')}/api/v1/routes/generate`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ latitude, longitude, distanceMeters, routeCount: 3 }),
  signal: AbortSignal.timeout(30000),
});
const data = await response.json();
if (!response.ok) throw new Error(`API returned ${response.status}: ${data.error?.code ?? 'unknown error'}`);
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const radians = (n) => n * Math.PI / 180;
function meters(a, b) {
  const dlat = radians(b[1] - a[1]);
  const dlon = radians(b[0] - a[0]);
  const h = Math.sin(dlat / 2) ** 2 + Math.cos(radians(a[1])) * Math.cos(radians(b[1])) * Math.sin(dlon / 2) ** 2;
  return 12742000 * Math.asin(Math.sqrt(Math.min(1, h)));
}
assert(Array.isArray(data.routes) && data.routes.length >= 1 && data.routes.length <= 3, 'Expected 1–3 routes');
assert(new Set(data.routes.map((route) => route.id)).size === data.routes.length, 'Duplicate route IDs');
for (const route of data.routes) {
  assert(route.type === 'out-and-back', 'Incorrect route type');
  assert(Number.isFinite(route.distanceMeters) && Math.abs(route.distanceMeters / distanceMeters - 1) <= 0.05001, 'Distance exceeds 5% tolerance');
  assert(route.geometry?.type === 'LineString', 'Expected GeoJSON LineString');
  const points = route.geometry.coordinates;
  assert(Array.isArray(points) && points.length >= 3, 'Incomplete geometry');
  assert(points.every((point) => Array.isArray(point) && point.length === 2 && point.every(Number.isFinite) && Math.abs(point[0]) <= 180 && Math.abs(point[1]) <= 90), 'Invalid coordinates');
  assert(meters(points[0], [longitude, latitude]) <= 100, 'Route starts too far from origin');
  assert(meters(points[0], points.at(-1)) <= 10, 'Route does not close');
  const geometricDistance = points.slice(1).reduce((sum, point, index) => sum + meters(points[index], point), 0);
  assert(Math.abs(geometricDistance / route.distanceMeters - 1) <= 0.05, 'Distance disagrees with complete geometry');
}
console.log(`PASS: ${data.routes.length} accurate, closed routes; ${(performance.now() - started).toFixed(0)} ms. Inspect the actual roads on a device before running.`);
