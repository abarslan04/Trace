import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateRoutes, getApiBaseUrl } from '../src/lib/api';
import { parseRoutes } from '../src/lib/validation';
import { request, route } from './fixtures';

afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });
describe('route API client', () => {
  it('sends the contract and accepts partial success without provider metadata', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ routes: [{ ...route, secret: 'discard' }] }));
    expect(await generateRoutes(request, { baseUrl: 'https://trace.test/', fetchImpl })).toEqual([route]);
    expect(fetchImpl.mock.calls[0]?.[0]).toBe('https://trace.test/api/v1/routes/generate');
    expect(JSON.parse(fetchImpl.mock.calls[0]?.[1]?.body as string)).toEqual(request);
  });
  it.each([400, 422, 429, 502, 503, 504])('handles HTTP %i without displaying arbitrary upstream messages', async status => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ error: { code: 'UNKNOWN', message: 'secret upstream URL' } }, { status }));
    await expect(generateRoutes(request, { baseUrl: 'https://trace.test', fetchImpl })).rejects.toMatchObject({ status });
    await expect(generateRoutes(request, { baseUrl: 'https://trace.test', fetchImpl })).rejects.not.toThrow('secret');
  });
  it('handles offline requests', async () => {
    await expect(generateRoutes(request, { baseUrl: 'https://trace.test', fetchImpl: vi.fn().mockRejectedValue(new Error('offline')) })).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
  });
  it('bounds a stalled transport and aborts it', async () => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(() => new Promise(() => {}));
    const promise = generateRoutes(request, { baseUrl: 'https://trace.test', fetchImpl, timeoutMs: 100 });
    const result = expect(promise).rejects.toMatchObject({ code: 'TIMEOUT' });
    await vi.advanceTimersByTimeAsync(101); await result;
    expect(fetchImpl.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
  });
  it('cancels in flight even when the transport does not reject on abort', async () => {
    const controller = new AbortController();
    const promise = generateRoutes(request, { baseUrl: 'https://trace.test', signal: controller.signal, fetchImpl: vi.fn<typeof fetch>(() => new Promise<Response>(() => {})) });
    controller.abort();
    await expect(promise).rejects.toMatchObject({ code: 'CANCELLED' });
  });
  it('validates before sending and rejects inaccurate or malformed responses', async () => {
    const fetchImpl = vi.fn();
    await expect(generateRoutes({ ...request, latitude: NaN }, { fetchImpl })).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(parseRoutes({ routes: [{ ...route, distanceMeters: 6000 }] }, 5000)).toBeNull();
    expect(parseRoutes({ routes: [route, route] })).toBeNull();
    expect(parseRoutes({ routes: [{ ...route, geometry: { type: 'LineString', coordinates: [[1, 2], [2, 3], [3, 4]] } }] })).toBeNull();
    expect(parseRoutes({ routes: [] })).toBeNull();
  });
  it('requires explicit configuration and rejects credentials in public URLs', () => {
    vi.stubEnv('EXPO_PUBLIC_API_BASE_URL', '');
    expect(getApiBaseUrl).toThrow('EXPO_PUBLIC_API_BASE_URL');
    vi.stubEnv('EXPO_PUBLIC_API_BASE_URL', 'https://user:password@example.com');
    expect(getApiBaseUrl).toThrow('without credentials');
  });
});
