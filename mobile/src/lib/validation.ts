import type { GenerateRoutesRequest, TraceLocation, TraceRoute } from './types';

export const MIN_DISTANCE_METERS = 1_000;
export const MAX_DISTANCE_METERS = 30_000;
const MAX_COORDINATES_PER_ROUTE = 50_000;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function isLatitude(value: unknown): value is number {
  return isFiniteNumber(value) && value >= -90 && value <= 90;
}

export function isLongitude(value: unknown): value is number {
  return isFiniteNumber(value) && value >= -180 && value <= 180;
}

export function isDistanceMeters(value: unknown): value is number {
  return isFiniteNumber(value) && Number.isInteger(value) &&
    value >= MIN_DISTANCE_METERS && value <= MAX_DISTANCE_METERS;
}

export function isTraceLocation(value: unknown): value is TraceLocation {
  return isRecord(value) && isLatitude(value.latitude) && isLongitude(value.longitude) &&
    isFiniteNumber(value.timestamp) && value.timestamp > 0 &&
    (value.accuracy === null || (isFiniteNumber(value.accuracy) && value.accuracy >= 0));
}

export function isGenerateRequest(value: GenerateRoutesRequest): boolean {
  return isLatitude(value.latitude) && isLongitude(value.longitude) &&
    isDistanceMeters(value.distanceMeters) && Number.isInteger(value.routeCount) &&
    value.routeCount >= 1 && value.routeCount <= 3;
}

export function parseRoutes(value: unknown, requestedDistanceMeters?: number): TraceRoute[] | null {
  if (!isRecord(value) || !Array.isArray(value.routes) || value.routes.length < 1 || value.routes.length > 3) {
    return null;
  }
  const ids = new Set<string>();
  const routes: TraceRoute[] = [];
  for (const route of value.routes) {
    if (!isRecord(route) || typeof route.id !== 'string' || !route.id.trim() || route.id.length > 120 ||
        ids.has(route.id) || route.type !== 'out-and-back' ||
        !isFiniteNumber(route.distanceMeters) || route.distanceMeters <= 0 || route.distanceMeters > 31_500 ||
        !isRecord(route.geometry) || route.geometry.type !== 'LineString') return null;
    if (requestedDistanceMeters !== undefined &&
        Math.abs(route.distanceMeters - requestedDistanceMeters) > requestedDistanceMeters * 0.05 + 1) return null;
    const coordinates = route.geometry.coordinates;
    if (!Array.isArray(coordinates) || coordinates.length < 3 || coordinates.length > MAX_COORDINATES_PER_ROUTE ||
        !coordinates.every((point: unknown) => Array.isArray(point) && point.length === 2 &&
          isLongitude(point[0]) && isLatitude(point[1]))) return null;
    const first = coordinates[0];
    const last = coordinates[coordinates.length - 1];
    if (Math.abs(first[0] - last[0]) > 0.000001 || Math.abs(first[1] - last[1]) > 0.000001 ||
        !coordinates.some((point) => point[0] !== first[0] || point[1] !== first[1])) return null;
    ids.add(route.id);
    // Copy only contract fields; untrusted provider/debug metadata is never retained.
    routes.push({ id: route.id, type: 'out-and-back', distanceMeters: route.distanceMeters,
      geometry: { type: 'LineString', coordinates: coordinates.map((point) => [point[0], point[1]]) } });
  }
  return routes;
}
