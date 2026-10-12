import { cancelled, noRoutes, timeout, TraceError, unavailable } from './errors';
import type { Coordinate, PathDetail, PedestrianPath, RoutingProvider } from './types';

const ENDPOINT = 'https://graphhopper.com/api/1/route';
const MAX_PROVIDER_BYTES = 4_000_000;
const MAX_POINTS = 20_000;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function coordinate(value: unknown): value is Coordinate {
  return Array.isArray(value) && value.length >= 2 &&
    typeof value[0] === 'number' && Number.isFinite(value[0]) && Math.abs(value[0]) <= 180 &&
    typeof value[1] === 'number' && Number.isFinite(value[1]) && Math.abs(value[1]) <= 90;
}

function details(value: unknown, pointCount: number): PathDetail[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_POINTS) throw unavailable();
  let expectedFrom = 0;
  const parsed: PathDetail[] = [];
  for (const entry of value) {
    if (!Array.isArray(entry) || entry.length !== 3 || entry[0] !== expectedFrom ||
      !Number.isInteger(entry[1]) || entry[1] <= entry[0] || entry[1] >= pointCount ||
      !(typeof entry[2] === 'string' || entry[2] === null)) throw unavailable();
    parsed.push([entry[0] as number, entry[1] as number, entry[2] as string | null]);
    expectedFrom = entry[1] as number;
  }
  if (expectedFrom !== pointCount - 1) throw unavailable();
  return parsed;
}

export function parsePath(payload: unknown): PedestrianPath {
  if (!isObject(payload) || !Array.isArray(payload.paths)) throw unavailable();
  if (payload.paths.length === 0) throw noRoutes();
  const path: unknown = payload.paths[0];
  if (!isObject(path) || typeof path.distance !== 'number' || !Number.isFinite(path.distance) ||
    path.distance <= 0 || path.distance > 1_000_000 || !isObject(path.points) ||
    path.points.type !== 'LineString' || !Array.isArray(path.points.coordinates) ||
    path.points.coordinates.length < 2 || path.points.coordinates.length > MAX_POINTS ||
    !path.points.coordinates.every(coordinate) || !isObject(path.details)) throw unavailable();
  const coordinates = path.points.coordinates.map(point => [point[0], point[1]] as Coordinate);
  return {
    distanceMeters: path.distance,
    coordinates,
    roadClasses: details(path.details.road_class, coordinates.length),
    environments: details(path.details.road_environment, coordinates.length),
  };
}

async function readPayload(response: Response): Promise<unknown> {
  if (!response.body) throw unavailable();
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let text = '';
  try {
    for (;;) {
      const result = await reader.read();
      if (result.done) break;
      size += result.value.byteLength;
      if (size > MAX_PROVIDER_BYTES) {
        await reader.cancel();
        throw unavailable();
      }
      text += decoder.decode(result.value, { stream: true });
    }
    return JSON.parse(text + decoder.decode()) as unknown;
  } catch (error) {
    if (error instanceof TraceError) throw error;
    throw unavailable();
  } finally {
    reader.releaseLock();
  }
}

function retryAfter(response: Response): number {
  const seconds = Number(response.headers.get('Retry-After') ?? response.headers.get('X-RateLimit-Reset') ?? '60');
  return Number.isFinite(seconds) ? Math.max(1, Math.min(86_400, Math.ceil(seconds))) : 60;
}

export class GraphHopperProvider implements RoutingProvider {
  // Workers' global fetch must not be invoked with the provider as its receiver.
  constructor(private readonly apiKey: string, private readonly fetcher: typeof fetch = (input, init) => fetch(input, init), private readonly requestTimeoutMs = 8_000) {}

  async route(from: Coordinate, to: Coordinate, parentSignal: AbortSignal): Promise<PedestrianPath> {
    if (parentSignal.aborted) throw cancelled();
    const controller = new AbortController();
    let timedOut = false;
    const onAbort = () => controller.abort();
    parentSignal.addEventListener('abort', onAbort, { once: true });
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, this.requestTimeoutMs);
    try {
      const url = new URL(ENDPOINT);
      url.searchParams.set('key', this.apiKey);
      const response = await this.fetcher(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          profile: 'foot', points: [from, to], points_encoded: false,
          instructions: false, calc_points: true, elevation: false,
          details: ['road_class', 'road_environment'],
          snap_preventions: ['motorway', 'trunk', 'ferry', 'ford'],
        }),
        signal: controller.signal,
      });
      if (response.status === 429) {
        await response.body?.cancel();
        throw new TraceError('RATE_LIMITED', 'The routing service has reached its request limit. Please try again later.', 429, retryAfter(response));
      }
      if (response.status === 401 || response.status === 403) {
        await response.body?.cancel();
        throw new TraceError('SERVER_CONFIGURATION', 'The routing service is not configured correctly.', 503);
      }
      if (response.status === 408 || response.status === 504) {
        await response.body?.cancel();
        throw timeout();
      }
      if (response.status === 400 || response.status === 404) {
        // Only known point/path failures are candidate failures. Invalid API parameters
        // and unsupported profiles must remain visible as a service problem.
        const payload = await readPayload(response);
        const hints = isObject(payload) && Array.isArray(payload.hints) ? payload.hints : [];
        if (hints.some(hint => isObject(hint) && typeof hint.details === 'string' &&
          /(?:PointNotFoundException|ConnectionNotFoundException|PointOutOfBoundsException)$/.test(hint.details))) throw noRoutes();
        throw unavailable();
      }
      if (!response.ok) {
        await response.body?.cancel();
        throw unavailable();
      }
      return parsePath(await readPayload(response));
    } catch (error) {
      if (timedOut) throw timeout();
      if (parentSignal.aborted) throw cancelled();
      if (error instanceof TraceError) throw error;
      throw unavailable();
    } finally {
      clearTimeout(timer);
      parentSignal.removeEventListener('abort', onAbort);
    }
  }
}
