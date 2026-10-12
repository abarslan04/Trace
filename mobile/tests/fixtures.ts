import type { SavedRouteSet, TraceRoute } from '../src/lib/types';
export const request = { latitude: 40.4237, longitude: -86.9212, distanceMeters: 5000, routeCount: 3 };
export const route: TraceRoute = { id: 'route-1', type: 'out-and-back', distanceMeters: 5000,
  geometry: { type: 'LineString', coordinates: [[-86.9212, 40.4237], [-86.9212, 40.446183], [-86.9212, 40.4237]] } };
export function saved(): SavedRouteSet {
  return { version: 1, savedAt: Date.now(), requestedDistanceMeters: 5000, selectedRouteId: route.id,
    start: { latitude: request.latitude, longitude: request.longitude, accuracy: 8, timestamp: Date.now() }, routes: [route] };
}
export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
