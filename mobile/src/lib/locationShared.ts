import type { TraceLocation } from './types';

export const MAX_FIX_AGE_MS = 30_000;
export const MAX_ACCURACY_METERS = 100;

export class TraceLocationError extends Error {
  constructor(public readonly code: 'DENIED' | 'DISABLED' | 'TIMEOUT' | 'INACCURATE' | 'UNAVAILABLE' | 'CANCELLED',
    message: string, public readonly canAskAgain = true) {
    super(message);
    this.name = 'TraceLocationError';
  }
}

export function isFreshLocation(location: TraceLocation | null, now = Date.now()): location is TraceLocation {
  return !!location && location.timestamp <= now + 5_000 && now - location.timestamp <= MAX_FIX_AGE_MS &&
    location.accuracy !== null && location.accuracy >= 0 && location.accuracy <= MAX_ACCURACY_METERS;
}
