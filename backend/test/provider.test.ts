import { afterEach, describe, expect, it, vi } from 'vitest';
import { GraphHopperProvider, parsePath } from '../src/provider';
import { origin, payload } from './fixtures';
import { destination } from '../src/geo';

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
const signal = () => new AbortController().signal;
const end = destination(origin, 0, 2500);

describe('GraphHopper integration', () => {
  it('does not bind the default global fetch to the provider instance', async () => {
    vi.stubGlobal('fetch', async function (this: unknown) {
      if (this !== undefined && this !== globalThis) throw new TypeError('Illegal invocation');
      return Response.json(payload([origin, end]));
    });
    const provider = new GraphHopperProvider('test-key');
    await expect(provider.route(origin, end, signal())).resolves.toMatchObject({ coordinates: [origin, end] });
  });

  it('requests documented standard pedestrian routing with full GeoJSON and path details', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => Response.json(payload([origin, end])));
    const provider = new GraphHopperProvider('secret-test-key', fetcher);
    const path = await provider.route(origin, end, signal());
    expect(path.coordinates).toEqual([origin, end]);
    const [url, init] = fetcher.mock.calls[0]!;
    expect(String(url)).toBe('https://graphhopper.com/api/1/route?key=secret-test-key');
    const body = JSON.parse(String(init!.body)) as Record<string, unknown>;
    expect(body).toMatchObject({ points: [origin, end], profile: 'foot', points_encoded: false, details: ['road_class', 'road_environment'] });
    expect(body).not.toHaveProperty('algorithm');
    expect(body).not.toHaveProperty('ch.disable');
    expect(body).not.toHaveProperty('custom_model');
    expect(init!.method).toBe('POST');
  });

  it.each([
    [429, 'RATE_LIMITED', 429], [401, 'SERVER_CONFIGURATION', 503], [403, 'SERVER_CONFIGURATION', 503],
    [500, 'PROVIDER_UNAVAILABLE', 502], [408, 'TIMEOUT', 504], [504, 'TIMEOUT', 504],
  ])('maps provider HTTP %i into sanitized %s', async (http, code, status) => {
    const fetcher: typeof fetch = async () => new Response('private provider details secret-test-key', { status: http as number });
    const provider = new GraphHopperProvider('secret-test-key', fetcher);
    await expect(provider.route(origin, end, signal())).rejects.toMatchObject({ code, status });
    await expect(provider.route(origin, end, signal())).rejects.not.toThrow('secret-test-key');
  });

  it('preserves a bounded retry interval for rate limits', async () => {
    const provider = new GraphHopperProvider('key', async () => new Response(null, { status: 429, headers: { 'X-RateLimit-Reset': '17' } }));
    await expect(provider.route(origin, end, signal())).rejects.toMatchObject({ retryAfter: 17 });
  });

  it('recognizes documented point and connection failures without leaking provider messages', async () => {
    const provider = new GraphHopperProvider('key', async () => Response.json({ message: 'private coordinates', hints: [{ details: 'com.graphhopper.util.exceptions.ConnectionNotFoundException' }] }, { status: 400 }));
    await expect(provider.route(origin, end, signal())).rejects.toMatchObject({ code: 'NO_ROUTES_FOUND' });
  });

  it('does not disguise a bad provider configuration as a candidate failure', async () => {
    const provider = new GraphHopperProvider('key', async () => Response.json({ message: 'profile unavailable', hints: [{ details: 'java.lang.IllegalArgumentException' }] }, { status: 400 }));
    await expect(provider.route(origin, end, signal())).rejects.toMatchObject({ code: 'PROVIDER_UNAVAILABLE' });
  });

  it('sanitizes network failures containing request URLs and keys', async () => {
    const provider = new GraphHopperProvider('key', async () => { throw new Error('Failed https://graphhopper.com?key=key'); });
    await expect(provider.route(origin, end, signal())).rejects.toMatchObject({ code: 'PROVIDER_UNAVAILABLE' });
    await expect(provider.route(origin, end, signal())).rejects.not.toThrow('graphhopper.com');
  });

  it('aborts stalled requests at the per-request timeout', async () => {
    vi.useFakeTimers();
    const fetcher: typeof fetch = (_input, init) => new Promise((_resolve, reject) => init!.signal!.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))));
    const provider = new GraphHopperProvider('key', fetcher, 15);
    const pending = expect(provider.route(origin, end, signal())).rejects.toMatchObject({ code: 'TIMEOUT' });
    await vi.advanceTimersByTimeAsync(16);
    await pending;
  });

  it('propagates cancellation and does not begin cancelled requests', async () => {
    const fetcher = vi.fn<typeof fetch>();
    const provider = new GraphHopperProvider('key', fetcher);
    await expect(provider.route(origin, end, AbortSignal.abort())).rejects.toMatchObject({ code: 'CANCELLED' });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('cancels an oversized provider response', async () => {
    const provider = new GraphHopperProvider('key', async () => new Response('x'.repeat(4_000_001)));
    await expect(provider.route(origin, end, signal())).rejects.toMatchObject({ code: 'PROVIDER_UNAVAILABLE' });
  });

  it.each([
    {}, { paths: [{ distance: 0 }] }, { paths: [{ distance: NaN }] },
    { paths: [{ distance: 100, points: 'encoded' }] },
  ])('rejects malformed provider data', malformed => {
    expect(() => parsePath(malformed)).toThrow();
  });

  it('rejects missing or incomplete safety details', () => {
    const data = payload();
    data.paths[0]!.details.road_class = [];
    expect(() => parsePath(data)).toThrow();
  });

  it('rejects invalid coordinate ordering ranges and nonfinite values', () => {
    const data = payload();
    data.paths[0]!.points.coordinates[1] = [0, 100];
    expect(() => parsePath(data)).toThrow();
  });

  it('returns no routes for an empty route list', () => {
    expect(() => parsePath({ paths: [] })).toThrowError(expect.objectContaining({ code: 'NO_ROUTES_FOUND' }));
  });
});
