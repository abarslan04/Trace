import { describe, expect, it, vi } from 'vitest';
import { TraceError } from '../src/errors';
import { createWorker, validateRequest } from '../src/index';
import { input, straightProvider } from './fixtures';

const env = { GRAPHHOPPER_API_KEY: 'test-secret', ALLOWED_ORIGINS: 'http://localhost:8081' };
const request = (body: unknown = input, options: RequestInit = {}) => new Request('http://localhost/api/v1/routes/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), ...options });

describe('Worker API', () => {
  it('serves the exact success contract with no internal/provider data', async () => {
    const worker = createWorker(() => straightProvider());
    const response = await worker.fetch(request(), env);
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    const body = await response.json() as { routes: Record<string, unknown>[] };
    expect(Object.keys(body)).toEqual(['routes']);
    expect(body.routes).toHaveLength(3);
    expect(Object.keys(body.routes[0]!).sort()).toEqual(['distanceMeters', 'geometry', 'id', 'type']);
    expect(JSON.stringify(body)).not.toContain('test-secret');
  });

  it.each([
    { ...input, latitude: '40' }, { ...input, latitude: 91 }, { ...input, latitude: NaN },
    { ...input, longitude: -181 }, { ...input, distanceMeters: 999 }, { ...input, distanceMeters: 30001 },
    { ...input, distanceMeters: 2500.5 }, { ...input, routeCount: 4 }, { ...input, routeCount: 0 },
    { ...input, routeCount: 1.5 }, { ...input, extra: true }, [], null,
  ])('rejects invalid input before calling the provider: %j', async body => {
    const factory = vi.fn(() => straightProvider());
    const response = await createWorker(factory).fetch(request(body), env);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: 'INVALID_REQUEST' } });
    expect(factory).not.toHaveBeenCalled();
  });

  it('defaults routeCount to three and accepts latitude/longitude boundaries', () => {
    expect(validateRequest({ latitude: -90, longitude: 180, distanceMeters: 1000 })).toEqual({ latitude: -90, longitude: 180, distanceMeters: 1000, routeCount: 3 });
  });

  it('handles malformed JSON and wrong content type', async () => {
    const worker = createWorker();
    expect((await worker.fetch(request(input, { body: '{' }), env)).status).toBe(400);
    expect((await worker.fetch(request(input, { headers: { 'Content-Type': 'text/plain' } }), env)).status).toBe(415);
  });

  it('bounds request bodies even without a Content-Length header', async () => {
    const response = await createWorker().fetch(request(input, { body: ' '.repeat(2049) }), env);
    expect(response.status).toBe(413);
  });

  it('responds to health, unknown endpoints, and unsupported methods', async () => {
    const worker = createWorker();
    expect((await worker.fetch(new Request('http://localhost/health'), env)).status).toBe(200);
    expect((await worker.fetch(new Request('http://localhost/nope'), env)).status).toBe(404);
    const wrongMethod = await worker.fetch(new Request('http://localhost/api/v1/routes/generate'), env);
    expect(wrongMethod.status).toBe(405);
    expect(wrongMethod.headers.get('Allow')).toBe('POST, OPTIONS');
  });

  it('fails gracefully when the secret is missing', async () => {
    const response = await createWorker().fetch(request(), { GRAPHHOPPER_API_KEY: '' });
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: { code: 'SERVER_CONFIGURATION' } });
  });

  it('permits explicitly configured browser origins and native requests', async () => {
    const worker = createWorker(() => straightProvider());
    const browser = await worker.fetch(request(input, { headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:8081' } }), env);
    expect(browser.status).toBe(200);
    expect(browser.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:8081');
    expect((await worker.fetch(request(), env)).status).toBe(200);
    const preflight = await worker.fetch(new Request('http://localhost/api/v1/routes/generate', { method: 'OPTIONS', headers: { Origin: 'http://localhost:8081' } }), env);
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('Access-Control-Allow-Headers')).toBe('Content-Type');
  });

  it('rejects unlisted browser origins before any provider call', async () => {
    const factory = vi.fn(() => straightProvider());
    const response = await createWorker(factory).fetch(request(input, { headers: { 'Content-Type': 'application/json', Origin: 'https://untrusted.example' } }), env);
    expect(response.status).toBe(403);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
    expect(factory).not.toHaveBeenCalled();
  });

  it('returns retry information for provider rate limits', async () => {
    const worker = createWorker(() => ({ async route() { throw new TraceError('RATE_LIMITED', 'Please wait.', 429, 15); } }));
    const response = await worker.fetch(request(), env);
    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('15');
    expect(await response.json()).toEqual({ error: { code: 'RATE_LIMITED', message: 'Please wait.' } });
  });

  it('sanitizes unexpected internal failures', async () => {
    const worker = createWorker(() => { throw new Error('secret-test-key private coordinates'); });
    const response = await worker.fetch(request(), env);
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain('secret-test-key');
  });
});
