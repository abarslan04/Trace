import type { TraceLocation } from './types';
import { isLatitude, isLongitude } from './validation';
import { isFreshLocation, TraceLocationError } from './locationShared';
export { isFreshLocation, TraceLocationError, MAX_FIX_AGE_MS, MAX_ACCURACY_METERS } from './locationShared';

interface LocationOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
}

/** Browser watch IDs belong to the browser, not Expo's native event registry. */
export function getFreshLocation(options: LocationOptions = {}): Promise<TraceLocation> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let watchId: number | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let bestAccuracy: number | undefined;
    const geolocation = typeof navigator === 'undefined' ? undefined : navigator.geolocation;
    const finish = (value: TraceLocation | TraceLocationError) => {
      if (settled) return;
      settled = true;
      if (timer !== undefined) clearTimeout(timer);
      if (watchId !== undefined) geolocation?.clearWatch(watchId);
      options.signal?.removeEventListener('abort', abort);
      if (value instanceof TraceLocationError) reject(value);
      else resolve(value);
    };
    const abort = () => finish(new TraceLocationError('CANCELLED', 'Location request cancelled.'));
    const timeoutError = () => bestAccuracy === undefined
      ? new TraceLocationError('TIMEOUT', 'Finding your location took too long. Move outdoors and try again.')
      : new TraceLocationError('INACCURATE', `GPS accuracy is about ${Math.round(bestAccuracy)} m. Move outdoors or enable precise location, then try again.`);
    if (options.signal?.aborted) { abort(); return; }
    if (typeof window !== 'undefined' && !window.isSecureContext) {
      finish(new TraceLocationError('UNAVAILABLE', 'Open Trace using its HTTPS address to use your location.'));
      return;
    }
    if (!geolocation) {
      finish(new TraceLocationError('UNAVAILABLE', 'This browser cannot provide your location. Open Trace in Safari or Chrome.'));
      return;
    }
    options.signal?.addEventListener('abort', abort, { once: true });
    const timeoutMs = options.timeoutMs ?? 45_000;
    // Also bound browsers that never deliver an error or leave a permission prompt open.
    timer = setTimeout(() => finish(timeoutError()), timeoutMs);
    try {
      // This call requests permission itself; no Permissions API or throwaway GPS request is needed.
      watchId = geolocation.watchPosition(position => {
        if (settled || !isLatitude(position.coords.latitude) || !isLongitude(position.coords.longitude)) return;
        const fix: TraceLocation = {
          latitude: position.coords.latitude, longitude: position.coords.longitude,
          accuracy: position.coords.accuracy, timestamp: position.timestamp,
        };
        if (Number.isFinite(fix.accuracy) && fix.accuracy !== null && fix.accuracy >= 0) {
          bestAccuracy = Math.min(bestAccuracy ?? Infinity, fix.accuracy);
        }
        if (isFreshLocation(fix)) finish(fix);
      }, error => {
        if (error.code === 1) {
          finish(new TraceLocationError('DENIED', 'Allow location for this website in your browser settings, then try again.'));
        } else if (error.code === 3) {
          finish(timeoutError());
        } else {
          finish(new TraceLocationError('UNAVAILABLE', 'Your browser could not find your location. Check location settings and try again outdoors.'));
        }
      }, { enableHighAccuracy: true, maximumAge: 0, timeout: timeoutMs });
      // Handles synchronous callbacks from test providers as well as aborts during registration.
      if (settled) geolocation.clearWatch(watchId);
    } catch {
      finish(new TraceLocationError('UNAVAILABLE', 'Your browser could not start location access. Check location settings and try again.'));
    }
  });
}
