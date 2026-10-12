import type { GenerateRoutesRequest, TraceRoute } from './types';
import { isGenerateRequest, isRecord, parseRoutes } from './validation';

export class RouteApiError extends Error {
  constructor(public readonly code: string, message: string, public readonly status?: number) {
    super(message);
    this.name = 'RouteApiError';
  }
}

const ERROR_MESSAGES = {
  INVALID_REQUEST: 'Choose a distance between 1 and 30 km and try again.',
  NO_ROUTES_FOUND: 'No accurate pedestrian route was found here. Try another distance or starting point.',
  NO_ROUTES: 'No accurate pedestrian route was found here. Try another distance or starting point.',
  RATE_LIMITED: 'Too many route requests. Wait a moment and try again.',
  PROVIDER_RATE_LIMITED: 'The routing service has reached its request limit. Please try again later.',
  PROVIDER_TIMEOUT: 'The routing service took too long. Please try again.',
  TIMEOUT: 'The routing service took too long. Please try again.',
  PROVIDER_ERROR: 'The routing service is unavailable. Please try again shortly.',
  SERVICE_UNAVAILABLE: 'The routing service is unavailable. Please try again shortly.',
  SERVER_CONFIGURATION: 'The routing service needs configuration. Check the Worker setup.',
  CONFIGURATION_ERROR: 'The routing service needs configuration. Check the Worker setup.',
};

export function getApiBaseUrl(): string {
  // Expo requires a static property access to replace public variables in the bundle.
  const configured = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();
  if (!configured) throw new RouteApiError('CONFIGURATION_ERROR',
    'Set EXPO_PUBLIC_API_BASE_URL to your Trace Worker URL, then restart the app.');
  let parsed: URL;
  try { parsed = new URL(configured); } catch {
    throw new RouteApiError('CONFIGURATION_ERROR', 'The Trace API URL is invalid. Check the app configuration.');
  }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new RouteApiError('CONFIGURATION_ERROR', 'The Trace API URL must be an HTTP or HTTPS address without credentials.');
  }
  return configured.replace(/\/+$/, '');
}

interface RequestOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

export async function generateRoutes(request: GenerateRoutesRequest, options: RequestOptions = {}): Promise<TraceRoute[]> {
  if (!isGenerateRequest(request)) throw new RouteApiError('INVALID_REQUEST', ERROR_MESSAGES.INVALID_REQUEST);
  const baseUrl = (options.baseUrl ?? getApiBaseUrl()).replace(/\/+$/, '');
  if (options.signal?.aborted) throw new RouteApiError('CANCELLED', 'Route generation cancelled.');
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let onAbort: (() => void) | undefined;
  const interrupted = new Promise<never>((_, reject) => {
    onAbort = () => {
      reject(new RouteApiError('CANCELLED', 'Route generation cancelled.'));
      controller.abort();
    };
    options.signal?.addEventListener('abort', onAbort, { once: true });
    timer = setTimeout(() => {
      reject(new RouteApiError('TIMEOUT', 'Route generation took too long. Please try again.'));
      controller.abort();
    }, options.timeoutMs ?? 30_000);
  });
  try {
    return await Promise.race([interrupted, (async () => {
      let response: Response;
      try {
        response = await (options.fetchImpl ?? fetch)(`${baseUrl}/api/v1/routes/generate`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(request), signal: controller.signal,
        });
      } catch {
        throw new RouteApiError('NETWORK_ERROR', 'Could not reach Trace. Check your internet connection and API address.');
      }
      let payload: unknown;
      try { payload = await response.json(); } catch {
        if (!response.ok) throw new RouteApiError('HTTP_ERROR', httpErrorMessage(response.status), response.status);
        throw new RouteApiError('INVALID_RESPONSE', 'Trace received an invalid route response. Please try again.');
      }
      if (!response.ok) {
        const code = isRecord(payload) && isRecord(payload.error) && typeof payload.error.code === 'string'
          ? payload.error.code : 'HTTP_ERROR';
        // Use known messages rather than displaying arbitrary upstream data to the user.
        throw new RouteApiError(code, (ERROR_MESSAGES as Record<string, string>)[code] ?? httpErrorMessage(response.status), response.status);
      }
      const routes = parseRoutes(payload, request.distanceMeters);
      if (!routes || routes.length > request.routeCount) throw new RouteApiError('INVALID_RESPONSE',
        'Trace received incomplete or inaccurate route data. Please try again.');
      return routes;
    })()]);
  } finally {
    if (timer) clearTimeout(timer);
    if (onAbort) options.signal?.removeEventListener('abort', onAbort);
  }
}

function httpErrorMessage(status: number): string {
  if (status === 429) return ERROR_MESSAGES.RATE_LIMITED;
  if (status === 408 || status === 504) return ERROR_MESSAGES.TIMEOUT;
  if (status === 400 || status === 422) return ERROR_MESSAGES.INVALID_REQUEST;
  return 'The routing service is unavailable. Please try again shortly.';
}
