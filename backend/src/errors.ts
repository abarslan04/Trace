export type ErrorCode =
  | 'INVALID_REQUEST'
  | 'NOT_FOUND'
  | 'METHOD_NOT_ALLOWED'
  | 'ORIGIN_NOT_ALLOWED'
  | 'NO_ROUTES_FOUND'
  | 'PROVIDER_UNAVAILABLE'
  | 'RATE_LIMITED'
  | 'TIMEOUT'
  | 'CANCELLED'
  | 'SERVER_CONFIGURATION'
  | 'INTERNAL_ERROR';

/** Only messages from this class may cross the API boundary. Never forward provider payloads. */
export class TraceError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly status: number,
    public readonly retryAfter?: number,
  ) {
    super(message);
    this.name = 'TraceError';
  }
}

export function noRoutes(): TraceError {
  return new TraceError('NO_ROUTES_FOUND', 'No accurate pedestrian route was found nearby. Try another distance or starting location.', 422);
}

export function unavailable(): TraceError {
  return new TraceError('PROVIDER_UNAVAILABLE', 'The routing service is temporarily unavailable. Please try again.', 502);
}

export function timeout(): TraceError {
  return new TraceError('TIMEOUT', 'Route generation took too long. Please try again.', 504);
}

export function cancelled(): TraceError {
  return new TraceError('CANCELLED', 'Route generation was cancelled.', 499);
}
