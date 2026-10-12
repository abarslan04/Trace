/** GeoJSON coordinates always use longitude, latitude. */
export type Coordinate = [longitude: number, latitude: number];

export interface GenerateRequest {
  latitude: number;
  longitude: number;
  distanceMeters: number;
  routeCount: number;
}

export interface RunningRoute {
  id: string;
  type: 'out-and-back';
  distanceMeters: number;
  geometry: { type: 'LineString'; coordinates: Coordinate[] };
}

export interface GenerateResponse { routes: RunningRoute[] }

export interface Env {
  GRAPHHOPPER_API_KEY: string;
  ALLOWED_ORIGINS?: string;
}

export type PathDetail = [from: number, to: number, value: string | null];

export interface PedestrianPath {
  distanceMeters: number;
  coordinates: Coordinate[];
  roadClasses: PathDetail[];
  environments: PathDetail[];
}

export interface RoutingProvider {
  route(from: Coordinate, to: Coordinate, signal: AbortSignal): Promise<PedestrianPath>;
}
