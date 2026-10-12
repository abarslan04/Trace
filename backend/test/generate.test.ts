import { afterEach, describe, expect, it, vi } from 'vitest';
import { cancelled, noRoutes, timeout, TraceError, unavailable } from '../src/errors';
import { generateRoutes, MAX_PROVIDER_REQUESTS } from '../src/generate';
import { clip, destination, distance, length } from '../src/geo';
import type { Coordinate, PedestrianPath, RoutingProvider } from '../src/types';
import { input, origin, path, straightProvider } from './fixtures';

afterEach(() => vi.useRealTimers());

describe('route generation', () => {
  it('returns three accurate closed routes with complete GeoJSON geometry using six requests', async () => {
    const provider = straightProvider();
    const spy = vi.spyOn(provider, 'route');
    const routes = await generateRoutes(input, provider);
    expect(routes).toHaveLength(3);
    expect(spy).toHaveBeenCalledTimes(6);
    for (const [index, route] of routes.entries()) {
      expect(route.id).toBe(`route-${index + 1}`);
      expect(route.type).toBe('out-and-back');
      expect(route.distanceMeters).toBe(5000);
      expect(route.geometry.type).toBe('LineString');
      expect(route.geometry.coordinates[0]).toEqual(origin);
      expect(route.geometry.coordinates.at(-1)).toEqual(origin);
      expect(length(route.geometry.coordinates)).toBeCloseTo(5000, 0);
      expect(Math.max(...route.geometry.coordinates.map(point => distance(origin, point)))).toBeCloseTo(2500, 0);
    }
  });

  it('routes the return direction, preserving actual outbound corners', async () => {
    const corner = destination(origin, 90, 800);
    const end = destination(corner, 0, 2300);
    const outbound = path([origin, corner, end]);
    const provider: RoutingProvider = {
      route: vi.fn(async (from, to) => from === origin || distance(from, origin) < 1
        ? outbound
        : path([from, corner, to])),
    };
    const [route] = await generateRoutes({ ...input, routeCount: 1 }, provider);
    expect(provider.route).toHaveBeenCalledTimes(2);
    expect(route!.geometry.coordinates.filter(point => point === corner)).toHaveLength(2);
    expect(route!.distanceMeters).toBe(5000);
  });

  it('accepts a slightly shorter accurately routed path without inventing extra distance', async () => {
    const end = destination(origin, 0, 2420);
    const provider: RoutingProvider = { async route(from) { return distance(from, origin) < 1 ? path([origin, end]) : path([end, origin]); } };
    const [route] = await generateRoutes({ ...input, routeCount: 1 }, provider);
    expect(route!.distanceMeters).toBe(4840);
    expect(length(route!.geometry.coordinates)).toBeCloseTo(4840, 3);
  });

  it('refines an undershooting endpoint using actual routed distance', async () => {
    let calls = 0;
    const provider: RoutingProvider = { route: vi.fn(async (from, to) => {
      calls++;
      return calls === 1 ? path([origin, destination(origin, 0, 1700)]) : path([from, to]);
    }) };
    const routes = await generateRoutes({ ...input, routeCount: 1 }, provider);
    expect(routes[0]!.distanceMeters).toBe(5000);
    expect(calls).toBe(3);
  });

  it('does not return near-duplicate paths reached by different candidate points', async () => {
    const end = destination(origin, 0, 2800);
    const provider: RoutingProvider = { route: vi.fn(async (from, to) => distance(from, origin) < 1 ? path([origin, end]) : path([from, to])) };
    const routes = await generateRoutes(input, provider);
    expect(routes).toHaveLength(1);
    expect(provider.route).toHaveBeenCalledTimes(7);
  });

  it('never exceeds eight requests, including refinements and reverse validation', async () => {
    let calls = 0;
    const provider: RoutingProvider = { async route() { calls++; return path([origin, destination(origin, 0, 1000)]); } };
    await expect(generateRoutes(input, provider)).rejects.toMatchObject({ code: 'NO_ROUTES_FOUND' });
    expect(calls).toBe(MAX_PROVIDER_REQUESTS);
  });

  it.each(['motorway', 'trunk'])('rejects unsafe road class %s', async roadClass => {
    const provider: RoutingProvider = { async route(from, to) { return path([from, to], roadClass); } };
    await expect(generateRoutes(input, provider)).rejects.toMatchObject({ code: 'NO_ROUTES_FOUND' });
  });

  it.each(['ferry', 'ford'])('rejects %s segments that foot routing can otherwise allow', async environment => {
    const provider: RoutingProvider = { async route(from, to) { return path([from, to], 'footway', environment); } };
    await expect(generateRoutes(input, provider)).rejects.toMatchObject({ code: 'NO_ROUTES_FOUND' });
  });

  it('rejects an unsafe return leg', async () => {
    const provider: RoutingProvider = { async route(from, to) { return path([from, to], 'footway', distance(from, origin) < 1 ? 'road' : 'ferry'); } };
    await expect(generateRoutes(input, provider)).rejects.toMatchObject({ code: 'NO_ROUTES_FOUND' });
  });

  it('can trim away an unsafe segment beyond the turnaround', async () => {
    const middle = destination(origin, 0, 2600);
    const end = destination(origin, 0, 3000);
    const outbound = path([origin, middle, end]);
    outbound.environments = [[0, 1, 'road'], [1, 2, 'ferry']];
    const provider: RoutingProvider = { async route(from, to) { return distance(from, origin) < 1 ? outbound : path([from, to]); } };
    expect(await generateRoutes({ ...input, routeCount: 1 }, provider)).toHaveLength(1);
  });

  it('rejects an origin snapped more than 100 meters away', async () => {
    const displaced = destination(origin, 90, 101);
    const provider: RoutingProvider = { async route(_from, to) { return path([displaced, to]); } };
    await expect(generateRoutes(input, provider)).rejects.toMatchObject({ code: 'NO_ROUTES_FOUND' });
  });

  it('rejects a return route that starts on a different disconnected segment', async () => {
    const provider: RoutingProvider = { async route(from, to) { return distance(from, origin) < 1 ? path([from, to]) : path([destination(from, 90, 20), to]); } };
    await expect(generateRoutes(input, provider)).rejects.toMatchObject({ code: 'NO_ROUTES_FOUND' });
  });

  it('rejects a return detour rather than reversing the outbound geometry illegally', async () => {
    const provider: RoutingProvider = { async route(from, to) {
      if (distance(from, origin) < 1) return path([from, to]);
      const middle = clip([from, to], distance(from, to) / 2).coordinates.at(-1)!;
      return path([from, destination(middle, 90, 220), to]);
    } };
    await expect(generateRoutes(input, provider)).rejects.toMatchObject({ code: 'NO_ROUTES_FOUND' });
  });

  it('rejects provider distances inconsistent with geometry', async () => {
    const provider: RoutingProvider = { async route(from, to) { return { ...path([from, to]), distanceMeters: 8000 }; } };
    await expect(generateRoutes(input, provider)).rejects.toMatchObject({ code: 'NO_ROUTES_FOUND' });
  });

  it.each([
    new TraceError('RATE_LIMITED', 'Please wait.', 429, 60), unavailable(), timeout(), noRoutes(),
  ])('preserves partial successes if a later request fails with $code', async failure => {
    let calls = 0;
    const provider: RoutingProvider = { async route(from, to) { if (++calls > 2) throw failure; return path([from, to]); } };
    expect(await generateRoutes(input, provider)).toHaveLength(1);
    expect(calls).toBeLessThanOrEqual(8);
  });

  it('stops spending credits as soon as the provider rate-limits a generation', async () => {
    const provider: RoutingProvider = { route: vi.fn(async () => { throw new TraceError('RATE_LIMITED', 'Please wait.', 429, 60); }) };
    await expect(generateRoutes(input, provider)).rejects.toMatchObject({ code: 'RATE_LIMITED' });
    expect(provider.route).toHaveBeenCalledTimes(1);
  });

  it('reports provider outages instead of misreporting them as no routes', async () => {
    const provider: RoutingProvider = { async route() { throw unavailable(); } };
    await expect(generateRoutes(input, provider)).rejects.toMatchObject({ code: 'PROVIDER_UNAVAILABLE' });
  });

  it('honors cancellation before and during generation', async () => {
    const aborted = AbortSignal.abort();
    const unused = straightProvider();
    const spy = vi.spyOn(unused, 'route');
    await expect(generateRoutes(input, unused, aborted)).rejects.toMatchObject({ code: 'CANCELLED' });
    expect(spy).not.toHaveBeenCalled();
    const controller = new AbortController();
    const provider: RoutingProvider = { route: vi.fn(async () => { controller.abort(); throw cancelled(); }) };
    await expect(generateRoutes(input, provider, controller.signal)).rejects.toMatchObject({ code: 'CANCELLED' });
    expect(provider.route).toHaveBeenCalledTimes(1);
  });

  it('aborts an in-flight provider request at the overall deadline', async () => {
    vi.useFakeTimers();
    const provider: RoutingProvider = { route: vi.fn((_from, _to, signal) => new Promise<PedestrianPath>((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(cancelled()), { once: true });
    })) };
    const pending = expect(generateRoutes(input, provider, undefined, { generationTimeoutMs: 25 })).rejects.toMatchObject({ code: 'TIMEOUT' });
    await vi.advanceTimersByTimeAsync(26);
    await pending;
    expect(provider.route).toHaveBeenCalledTimes(1);
  });

  it('returns completed routes if the overall deadline expires while seeking variety', async () => {
    vi.useFakeTimers();
    let calls = 0;
    const provider: RoutingProvider = { route: (from, to, signal) => {
      if (++calls <= 2) return Promise.resolve(path([from, to]));
      return new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(cancelled()), { once: true }));
    } };
    const result = generateRoutes(input, provider, undefined, { generationTimeoutMs: 25 });
    await vi.advanceTimersByTimeAsync(26);
    expect(await result).toHaveLength(1);
  });

  it.each([1000, 10000, 30000])('maintains distance accuracy at %i meters', async distanceMeters => {
    const routes = await generateRoutes({ ...input, distanceMeters }, straightProvider());
    for (const route of routes) {
      expect(Math.abs(route.distanceMeters - distanceMeters) / distanceMeters).toBeLessThanOrEqual(0.05);
      expect(Math.abs(length(route.geometry.coordinates) - distanceMeters) / distanceMeters).toBeLessThanOrEqual(0.05);
    }
  });

  it('uses longitude first near the date line', async () => {
    const coordinates: Coordinate = [179.999, 45];
    const routes = await generateRoutes({ ...input, longitude: coordinates[0], latitude: coordinates[1] }, straightProvider());
    expect(routes).toHaveLength(3);
    expect(routes[0]!.geometry.coordinates[0]).toEqual(coordinates);
  });
});
