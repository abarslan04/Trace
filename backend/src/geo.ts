import type { Coordinate } from './types';

const EARTH_RADIUS = 6_371_008.8;
const radians = (value: number) => value * Math.PI / 180;
const degrees = (value: number) => value * 180 / Math.PI;
const longitudeDelta = (a: number, b: number) => ((b - a + 540) % 360) - 180;

export function distance(a: Coordinate, b: Coordinate): number {
  const dLat = radians(b[1] - a[1]);
  const dLon = radians(longitudeDelta(a[0], b[0]));
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(radians(a[1])) * Math.cos(radians(b[1])) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function destination(origin: Coordinate, bearingDegrees: number, meters: number): Coordinate {
  const angular = meters / EARTH_RADIUS;
  const bearing = radians(bearingDegrees);
  const lat = radians(origin[1]);
  const lon = radians(origin[0]);
  const nextLat = Math.asin(Math.sin(lat) * Math.cos(angular) + Math.cos(lat) * Math.sin(angular) * Math.cos(bearing));
  const nextLon = lon + Math.atan2(Math.sin(bearing) * Math.sin(angular) * Math.cos(lat), Math.cos(angular) - Math.sin(lat) * Math.sin(nextLat));
  return [((degrees(nextLon) + 540) % 360) - 180, degrees(nextLat)];
}

export function length(coordinates: Coordinate[]): number {
  let total = 0;
  for (let i = 1; i < coordinates.length; i++) total += distance(coordinates[i - 1]!, coordinates[i]!);
  return total;
}

/** Interpolate along an existing routed segment; never draw a shortcut to an arbitrary point. */
export function clip(coordinates: Coordinate[], meters: number): { coordinates: Coordinate[]; endIndex: number } {
  const result: Coordinate[] = [coordinates[0]!];
  let remaining = meters;
  for (let i = 1; i < coordinates.length; i++) {
    const previous = coordinates[i - 1]!;
    const next = coordinates[i]!;
    const segment = distance(previous, next);
    if (segment > 0 && remaining <= segment) {
      const fraction = Math.max(0, remaining / segment);
      result.push([((previous[0] + longitudeDelta(previous[0], next[0]) * fraction + 540) % 360) - 180, previous[1] + (next[1] - previous[1]) * fraction]);
      return { coordinates: result, endIndex: i };
    }
    result.push(next);
    remaining -= segment;
  }
  return { coordinates: result, endIndex: coordinates.length - 1 };
}

function pointToSegment(point: Coordinate, start: Coordinate, end: Coordinate): number {
  // Local projection is sufficient for corridor comparisons over running distances.
  const scale = Math.cos(radians(point[1]));
  const ax = radians(longitudeDelta(point[0], start[0])) * scale * EARTH_RADIUS;
  const ay = radians(start[1] - point[1]) * EARTH_RADIUS;
  const bx = radians(longitudeDelta(point[0], end[0])) * scale * EARTH_RADIUS;
  const by = radians(end[1] - point[1]) * EARTH_RADIUS;
  const dx = bx - ax;
  const dy = by - ay;
  const fraction = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(ax + fraction * dx, ay + fraction * dy);
}

/** Sample along length, not just vertices: even sparse straight-line geometry is compared correctly. */
export function sample(coordinates: Coordinate[], count = 32): Coordinate[] {
  const total = length(coordinates);
  return Array.from({ length: count }, (_, i) => clip(coordinates, total * i / (count - 1)).coordinates.at(-1)!);
}

export function overlap(a: Coordinate[], b: Coordinate[], toleranceMeters = 40): number {
  const samples = sample(a);
  const matching = samples.filter(point => {
    for (let i = 1; i < b.length; i++) {
      if (pointToSegment(point, b[i - 1]!, b[i]!) <= toleranceMeters) return true;
    }
    return false;
  });
  return matching.length / samples.length;
}
