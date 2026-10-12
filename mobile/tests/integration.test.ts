import { describe, expect, it, vi } from 'vitest';
import { generateRoutes } from '../src/lib/api';
import { createWorker } from '../../backend/src/index';
import { straightProvider } from '../../backend/test/fixtures';
import { request } from './fixtures';

describe('mobile client ↔ real Worker contract', () => {
  it('runs client, HTTP handler, validation, generation, and response parsing together', async () => {
    // Only the external routing network is stubbed, never the Worker or client.
    const provider = straightProvider();
    const spy = vi.spyOn(provider, 'route');
    const worker = createWorker(() => provider);
    const fetchImpl: typeof fetch = async (url, init) => worker.fetch(new Request(url, init), { GRAPHHOPPER_API_KEY: 'test-only' });
    const routes = await generateRoutes(request, { baseUrl: 'https://trace.test', fetchImpl });
    expect(routes).toHaveLength(3);
    expect(spy.mock.calls.length).toBeLessThanOrEqual(8);
    for (const route of routes) {
      expect(Math.abs(route.distanceMeters - request.distanceMeters)).toBeLessThanOrEqual(250);
      expect(route.geometry.coordinates.at(-1)).toEqual(route.geometry.coordinates[0]);
    }
  });
  it('surfaces missing server configuration as a useful client error', async () => {
    const worker = createWorker();
    const fetchImpl: typeof fetch = async (url, init) => worker.fetch(new Request(url, init), { GRAPHHOPPER_API_KEY: '' });
    await expect(generateRoutes(request, { baseUrl: 'https://trace.test', fetchImpl })).rejects.toMatchObject({ status: 503, code: 'SERVER_CONFIGURATION' });
  });
});
