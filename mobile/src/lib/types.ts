export type Coordinate = [longitude: number, latitude: number];

export interface TraceRoute {
  id: string;
  type: 'out-and-back';
  distanceMeters: number;
  geometry: { type: 'LineString'; coordinates: Coordinate[] };
}

export interface TraceLocation {
  latitude: number;
  longitude: number;
  /** Horizontal uncertainty in meters. */
  accuracy: number | null;
  timestamp: number;
}

export interface GenerateRoutesRequest {
  latitude: number;
  longitude: number;
  distanceMeters: number;
  routeCount: number;
}

export interface SavedRouteSet {
  version: 1;
  savedAt: number;
  start: TraceLocation;
  requestedDistanceMeters: number;
  selectedRouteId: string;
  routes: TraceRoute[];
}
