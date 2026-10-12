import { length } from '../src/geo';
import type { Coordinate, PedestrianPath, RoutingProvider } from '../src/types';

export const origin: Coordinate = [-86.9212, 40.4237];
export const input = { latitude: origin[1], longitude: origin[0], distanceMeters: 5000, routeCount: 3 };

export function path(coordinates: Coordinate[], roadClass = 'footway', environment = 'road'): PedestrianPath {
  return {
    coordinates,
    distanceMeters: length(coordinates),
    roadClasses: [[0, coordinates.length - 1, roadClass]],
    environments: [[0, coordinates.length - 1, environment]],
  };
}

export const straightProvider = (): RoutingProvider => ({
  async route(from, to) { return path([from, to]); },
});

export function payload(coordinates: Coordinate[] = [origin, [-86.9212, 40.43]]) {
  const route = path(coordinates);
  return { paths: [{ distance: route.distanceMeters, points: { type: 'LineString', coordinates }, details: { road_class: route.roadClasses, road_environment: route.environments } }] };
}
