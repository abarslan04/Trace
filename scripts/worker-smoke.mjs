// Tests the running local Worker without invoking GraphHopper or spending credits.
import assert from 'node:assert/strict';
const base = process.env.TRACE_API_BASE_URL ?? 'http://localhost:8787';
const request = (path, init) => fetch(`${base}${path}`, { ...init, signal: AbortSignal.timeout(5000) });
assert.equal((await request('/health')).status, 200);
assert.equal((await request('/missing')).status, 404);
assert.equal((await request('/api/v1/routes/generate')).status, 405);
const bad = await request('/api/v1/routes/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ latitude: 100, longitude: 0, distanceMeters: 5000, routeCount: 3 }) });
assert.equal(bad.status, 400);
assert.equal((await bad.json()).error.code, 'INVALID_REQUEST');
assert.equal(bad.headers.get('Cache-Control'), 'no-store');
const preflight = await request('/api/v1/routes/generate', { method: 'OPTIONS', headers: { Origin: 'http://localhost:8081', 'Access-Control-Request-Method': 'POST' } });
assert.equal(preflight.status, 204);
assert.equal(preflight.headers.get('Access-Control-Allow-Origin'), 'http://localhost:8081');
const denied = await request('/api/v1/routes/generate', { method: 'OPTIONS', headers: { Origin: 'https://untrusted.example' } });
assert.equal(denied.status, 403);
assert.equal(denied.headers.get('Access-Control-Allow-Origin'), null);
console.log('PASS: actual Worker health, routing, validation, error contract, no-store and CORS; no provider calls.');
