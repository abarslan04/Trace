import { cancelled, noRoutes, timeout, TraceError, unavailable } from './errors';
import { clip, destination, distance, length, overlap } from './geo';
import type { Coordinate, GenerateRequest, PedestrianPath, RoutingProvider, RunningRoute } from './types';

export const MAX_PROVIDER_REQUESTS = 8;
export const DISTANCE_TOLERANCE = 0.05;
export const MAX_START_SNAP_METERS = 100;
const JOIN_TOLERANCE_METERS = 2;
const BLOCKED_CLASSES = new Set(['motorway', 'trunk']);
const BLOCKED_ENVIRONMENTS = new Set(['ferry', 'ford']);
const PREFERRED_CLASSES = new Set(['path', 'footway', 'pedestrian', 'living_street', 'track']);

interface Candidate {
  route: RunningRoute;
  outbound: Coordinate[];
  error: number;
  suitability: number;
}

function safe(path: PedestrianPath, endIndex = path.coordinates.length - 1): boolean {
  return !path.roadClasses.some(([from, , value]) => from < endIndex && value !== null && BLOCKED_CLASSES.has(value.toLowerCase())) &&
    !path.environments.some(([from, , value]) => from < endIndex && value !== null && BLOCKED_ENVIRONMENTS.has(value.toLowerCase()));
}

function suitability(path: PedestrianPath, endIndex: number): number {
  let preferredMeters = 0;
  let totalMeters = 0;
  for (const [from, to, value] of path.roadClasses) {
    if (from >= endIndex) continue;
    const meters = length(path.coordinates.slice(from, Math.min(to, endIndex) + 1));
    totalMeters += meters;
    if (value !== null && PREFERRED_CLASSES.has(value.toLowerCase())) preferredMeters += meters;
  }
  return preferredMeters / (totalMeters || 1);
}

function plausible(path: PedestrianPath): boolean {
  const geometricLength = length(path.coordinates);
  // A simplified or malformed geometry must not claim a distance it cannot represent.
  return geometricLength > 0 && Math.abs(geometricLength - path.distanceMeters) / path.distanceMeters <= 0.03;
}

function assemble(outboundPath: PedestrianPath, outbound: Coordinate[], endIndex: number, outboundMeters: number, returning: PedestrianPath, requestedMeters: number): Candidate | undefined {
  const origin = outbound[0]!;
  const turnaround = outbound.at(-1)!;
  if (!safe(returning) || !plausible(returning) ||
    distance(turnaround, returning.coordinates[0]!) > JOIN_TOLERANCE_METERS ||
    distance(origin, returning.coordinates.at(-1)!) > JOIN_TOLERANCE_METERS) return undefined;
  // Route both ways: simply reversing coordinates could violate directional pedestrian restrictions.
  // Reject a different return corridor, even if a detour happens to have the desired length.
  if (overlap(outbound, returning.coordinates, 25) < 0.97 || overlap(returning.coordinates, outbound, 25) < 0.97) return undefined;
  const joins = distance(turnaround, returning.coordinates[0]!) + distance(origin, returning.coordinates.at(-1)!);
  const total = outboundMeters + returning.distanceMeters + joins;
  const reported = Math.round(total);
  if (Math.abs(reported - requestedMeters) / requestedMeters > DISTANCE_TOLERANCE) return undefined;
  const coordinates = [...outbound, ...returning.coordinates];
  if (distance(origin, coordinates.at(-1)!) > 0) coordinates.push(origin);
  const geometricLength = length(coordinates);
  if (Math.abs(geometricLength - requestedMeters) / requestedMeters > DISTANCE_TOLERANCE) return undefined;
  return {
    route: { id: '', type: 'out-and-back', distanceMeters: reported, geometry: { type: 'LineString', coordinates } },
    outbound,
    error: Math.abs(total - requestedMeters) / requestedMeters,
    suitability: suitability(outboundPath, endIndex),
  };
}

export async function generateRoutes(
  request: GenerateRequest,
  provider: RoutingProvider,
  parentSignal: AbortSignal = new AbortController().signal,
  options: { generationTimeoutMs?: number } = {},
): Promise<RunningRoute[]> {
  if (parentSignal.aborted) throw cancelled();
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  parentSignal.addEventListener('abort', onAbort, { once: true });
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, options.generationTimeoutMs ?? 25_000);
  const origin: Coordinate = [request.longitude, request.latitude];
  const targetHalf = request.distanceMeters / 2;
  const accepted: Candidate[] = [];
  let calls = 0;
  let lastFailure: TraceError | undefined;
  // Stable headings keep tests reproducible and avoid wasting calls on equivalent directions.
  const bearings = [0, 120, 240, 60, 180, 300];

  const route = async (from: Coordinate, to: Coordinate) => {
    if (controller.signal.aborted) throw timedOut ? timeout() : cancelled();
    if (calls >= MAX_PROVIDER_REQUESTS) throw noRoutes();
    calls += 1;
    return provider.route(from, to, controller.signal);
  };

  try {
    for (const bearing of bearings) {
      if (calls >= MAX_PROVIDER_REQUESTS || accepted.length >= request.routeCount || controller.signal.aborted) break;
      try {
        let outboundPath = await route(origin, destination(origin, bearing, targetHalf * 1.12));
        if (!plausible(outboundPath) || distance(origin, outboundPath.coordinates[0]!) > MAX_START_SNAP_METERS) continue;
        // If snapping shortened a candidate, make one distance-informed refinement.
        if (outboundPath.distanceMeters < targetHalf * (1 - DISTANCE_TOLERANCE) && calls + 2 <= MAX_PROVIDER_REQUESTS) {
          const factor = Math.min(2.5, targetHalf / outboundPath.distanceMeters * 1.12);
          outboundPath = await route(origin, destination(origin, bearing, targetHalf * 1.12 * factor));
          if (!plausible(outboundPath) || distance(origin, outboundPath.coordinates[0]!) > MAX_START_SNAP_METERS) continue;
        }
        if (outboundPath.distanceMeters < targetHalf * (1 - DISTANCE_TOLERANCE) || calls >= MAX_PROVIDER_REQUESTS) continue;
        const outboundMeters = Math.min(targetHalf, outboundPath.distanceMeters);
        // Calibrate the geometric measure to GraphHopper's reported distance before trimming.
        const trimmed = clip(outboundPath.coordinates, length(outboundPath.coordinates) * outboundMeters / outboundPath.distanceMeters);
        if (!safe(outboundPath, trimmed.endIndex)) continue;
        if (accepted.some(existing => overlap(trimmed.coordinates, existing.outbound) >= 0.8 && overlap(existing.outbound, trimmed.coordinates) >= 0.8)) continue;
        const returning = await route(trimmed.coordinates.at(-1)!, trimmed.coordinates[0]!);
        const candidate = assemble(outboundPath, trimmed.coordinates, trimmed.endIndex, outboundMeters, returning, request.distanceMeters);
        if (candidate) accepted.push(candidate);
      } catch (error) {
        const failure = error instanceof TraceError ? error : unavailable();
        if (failure.code !== 'NO_ROUTES_FOUND') lastFailure = failure;
        // A quota/configuration failure affects every candidate. Keep any successful routes.
        if (['RATE_LIMITED', 'SERVER_CONFIGURATION', 'CANCELLED'].includes(failure.code)) break;
      }
    }
    if (parentSignal.aborted) throw cancelled();
    if (accepted.length > 0) {
      accepted.sort((a, b) => a.error - b.error || b.suitability - a.suitability);
      return accepted.slice(0, request.routeCount).map((candidate, index) => ({ ...candidate.route, id: `route-${index + 1}` }));
    }
    if (timedOut) throw timeout();
    if (lastFailure) throw lastFailure;
    throw noRoutes();
  } finally {
    clearTimeout(timer);
    parentSignal.removeEventListener('abort', onAbort);
  }
}
