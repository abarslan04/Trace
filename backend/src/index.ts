import { TraceError } from './errors';
import { generateRoutes } from './generate';
import { GraphHopperProvider } from './provider';
import type { Env, GenerateRequest, RoutingProvider } from './types';

const ROUTE_PATH = '/api/v1/routes/generate';
const MAX_BODY_BYTES = 2048;

function invalid(message: string): TraceError { return new TraceError('INVALID_REQUEST', message, 400); }

export function validateRequest(value: unknown): GenerateRequest {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw invalid('A JSON object is required.');
  const body = value as Record<string, unknown>;
  const allowed = new Set(['latitude', 'longitude', 'distanceMeters', 'routeCount']);
  if (Object.keys(body).some(key => !allowed.has(key))) throw invalid('The request contains an unknown field.');
  const { latitude, longitude, distanceMeters, routeCount = 3 } = body;
  if (typeof latitude !== 'number' || !Number.isFinite(latitude) || latitude < -90 || latitude > 90) throw invalid('Latitude must be a number between -90 and 90.');
  if (typeof longitude !== 'number' || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) throw invalid('Longitude must be a number between -180 and 180.');
  if (typeof distanceMeters !== 'number' || !Number.isInteger(distanceMeters) || distanceMeters < 1000 || distanceMeters > 30000) throw invalid('Distance must be a whole number between 1000 and 30000 meters.');
  if (typeof routeCount !== 'number' || !Number.isInteger(routeCount) || routeCount < 1 || routeCount > 3) throw invalid('Route count must be 1, 2, or 3.');
  return { latitude, longitude, distanceMeters, routeCount };
}

async function readRequest(request: Request): Promise<GenerateRequest> {
  const contentType = request.headers.get('Content-Type')?.split(';')[0]?.trim().toLowerCase();
  if (contentType !== 'application/json') throw new TraceError('INVALID_REQUEST', 'Content-Type must be application/json.', 415);
  if (!request.body) throw invalid('A JSON body is required.');
  if (Number(request.headers.get('Content-Length')) > MAX_BODY_BYTES) throw new TraceError('INVALID_REQUEST', 'The request body is too large.', 413);
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let body = '';
  try {
    for (;;) {
      const result = await reader.read();
      if (result.done) break;
      size += result.value.byteLength;
      if (size > MAX_BODY_BYTES) {
        await reader.cancel();
        throw new TraceError('INVALID_REQUEST', 'The request body is too large.', 413);
      }
      body += decoder.decode(result.value, { stream: true });
    }
    return validateRequest(JSON.parse(body + decoder.decode()) as unknown);
  } catch (error) {
    if (error instanceof TraceError) throw error;
    throw invalid('The request body must contain valid JSON.');
  } finally {
    reader.releaseLock();
  }
}

export function createWorker(providerFactory: (env: Env) => RoutingProvider = env => new GraphHopperProvider(env.GRAPHHOPPER_API_KEY)) {
  return {
    async fetch(request: Request, env: Env): Promise<Response> {
      const headers = new Headers({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', Vary: 'Origin', 'X-Content-Type-Options': 'nosniff' });
      const origin = request.headers.get('Origin');
      const origins = (env.ALLOWED_ORIGINS ?? '').split(',').map(value => value.trim()).filter(Boolean);
      if (origin && origins.includes(origin)) {
        headers.set('Access-Control-Allow-Origin', origin);
        headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
        headers.set('Access-Control-Allow-Headers', 'Content-Type');
      }
      try {
        if (origin && !origins.includes(origin)) throw new TraceError('ORIGIN_NOT_ALLOWED', 'This web origin is not allowed.', 403);
        const url = new URL(request.url);
        if (url.pathname === '/health' && request.method === 'GET') return Response.json({ status: 'ok' }, { headers });
        if (url.pathname !== ROUTE_PATH) throw new TraceError('NOT_FOUND', 'Endpoint not found.', 404);
        if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
        if (request.method !== 'POST') {
          headers.set('Allow', 'POST, OPTIONS');
          throw new TraceError('METHOD_NOT_ALLOWED', 'Use POST to generate routes.', 405);
        }
        const input = await readRequest(request);
        if (!env.GRAPHHOPPER_API_KEY || env.GRAPHHOPPER_API_KEY === 'your_graphhopper_api_key') throw new TraceError('SERVER_CONFIGURATION', 'The routing service is not configured yet.', 503);
        const routes = await generateRoutes(input, providerFactory(env), request.signal);
        return Response.json({ routes }, { headers });
      } catch (error) {
        const failure = error instanceof TraceError ? error : new TraceError('INTERNAL_ERROR', 'Something went wrong while generating routes.', 500);
        if (failure.retryAfter) headers.set('Retry-After', String(failure.retryAfter));
        return Response.json({ error: { code: failure.code, message: failure.message } }, { status: failure.status, headers });
      }
    },
  };
}

export default createWorker();
