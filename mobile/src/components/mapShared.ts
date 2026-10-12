import type { Feature, FeatureCollection, LineString, Point } from 'geojson';
import type { TraceLocation, TraceRoute } from '../lib/types';
import type { Colors } from '../theme/tokens';

export interface RouteMapProps {
  location: TraceLocation | null;
  routes: TraceRoute[];
  selectedRouteId: string | null;
  onSelectRoute: (id: string) => void;
  colors: Colors;
  isDark: boolean;
  reducedMotion: boolean;
  recenterToken: number;
  onLoadingChange: (loading: boolean) => void;
  onError: () => void;
}

export function mapStyleURL(dark: boolean): string {
  return dark
    ? process.env.EXPO_PUBLIC_MAP_DARK_STYLE_URL || 'https://tiles.openfreemap.org/styles/dark'
    : process.env.EXPO_PUBLIC_MAP_STYLE_URL || 'https://tiles.openfreemap.org/styles/liberty';
}

export function routeFeature(route: TraceRoute): Feature<LineString> {
  return { type: 'Feature', id: route.id, properties: { routeId: route.id }, geometry: route.geometry };
}

export function pointFeature(longitude: number, latitude: number): Feature<Point> {
  return { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [longitude, latitude] } };
}

export function allRoutesFeature(routes: TraceRoute[], selectedId: string | null, colors: Colors): FeatureCollection<LineString> {
  return {
    type: 'FeatureCollection',
    features: routes.map((route, index) => ({ ...routeFeature(route), properties: { routeId: route.id, selected: route.id === selectedId, color: colors.route[index % colors.route.length] } })),
  };
}

export function routeBounds(route: TraceRoute): [number, number, number, number] {
  const first = route.geometry.coordinates[0]!;
  let west = first[0]!, east = west, south = first[1]!, north = south;
  for (const coordinate of route.geometry.coordinates) {
    // Unwrap at the date line so a short run does not zoom out to the whole globe.
    let longitude = coordinate[0]!;
    while (longitude - first[0]! > 180) longitude -= 360;
    while (longitude - first[0]! < -180) longitude += 360;
    west = Math.min(west, longitude); east = Math.max(east, longitude);
    south = Math.min(south, coordinate[1]!); north = Math.max(north, coordinate[1]!);
  }
  return [west, south, east, north];
}

/** Locate half the travelled distance, not half the vertices (sampling density differs by leg). */
export function turnaroundCoordinate(route: TraceRoute): [number, number] {
  const points = route.geometry.coordinates;
  const radians = (n: number) => n * Math.PI / 180;
  const segments = points.slice(1).map((b, i) => {
    const a = points[i]!;
    const h = Math.sin(radians(b[1] - a[1]) / 2) ** 2 + Math.cos(radians(a[1])) * Math.cos(radians(b[1])) * Math.sin(radians(b[0] - a[0]) / 2) ** 2;
    return 12742000 * Math.asin(Math.sqrt(Math.min(1, h)));
  });
  let remaining = segments.reduce((sum, meters) => sum + meters, 0) / 2;
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i]!;
    if (segment > 0 && remaining <= segment) {
      const a = points[i]!, b = points[i + 1]!;
      const fraction = remaining / segment;
      const dlon = ((b[0] - a[0] + 540) % 360) - 180;
      return [((a[0] + dlon * fraction + 540) % 360) - 180, a[1] + (b[1] - a[1]) * fraction];
    }
    remaining -= segment;
  }
  return points[0]!;
}
