import * as ExpoLocation from 'expo-location';
import type { TraceLocation } from './types';
import { isLatitude, isLongitude } from './validation';
import { isFreshLocation, TraceLocationError } from './locationShared';
export { isFreshLocation, TraceLocationError, MAX_FIX_AGE_MS, MAX_ACCURACY_METERS } from './locationShared';

type LocationProvider = Pick<typeof ExpoLocation,
  'getForegroundPermissionsAsync' | 'requestForegroundPermissionsAsync' | 'hasServicesEnabledAsync' | 'watchPositionAsync'>;

interface LocationOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  provider?: LocationProvider;
}

/** Uses a short-lived watch so success, cancellation, and timeout all stop native GPS work. */
export function getFreshLocation(options: LocationOptions = {}): Promise<TraceLocation> {
  const provider = options.provider ?? ExpoLocation;
  return new Promise((resolve, reject) => {
    let settled = false;
    let subscription: ExpoLocation.LocationSubscription | undefined;
    let bestAccuracy: number | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const finish = (value: TraceLocation | TraceLocationError) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      options.signal?.removeEventListener('abort', abort);
      subscription?.remove();
      if (value instanceof TraceLocationError) reject(value);
      else resolve(value);
    };
    const abort = () => finish(new TraceLocationError('CANCELLED', 'Location request cancelled.'));
    if (options.signal?.aborted) { abort(); return; }
    options.signal?.addEventListener('abort', abort, { once: true });
    timer = setTimeout(() => finish(bestAccuracy === undefined
      ? new TraceLocationError('TIMEOUT', 'Finding your location took too long. Move outdoors and try again.')
      : new TraceLocationError('INACCURATE', `GPS accuracy is about ${Math.round(bestAccuracy)} m. Move outdoors or enable precise location, then try again.`)),
    options.timeoutMs ?? 25_000);
    void (async () => {
      let permission = await provider.getForegroundPermissionsAsync();
      if (settled) return;
      if (!permission.granted && permission.canAskAgain) {
        permission = await provider.requestForegroundPermissionsAsync();
        if (settled) return;
      }
      if (!permission.granted) {
        finish(new TraceLocationError('DENIED', permission.canAskAgain
          ? 'Allow location access to find routes starting near you.'
          : 'Location access is off. Enable it for Trace in your device settings.', permission.canAskAgain));
        return;
      }
      const enabled = await provider.hasServicesEnabledAsync();
      if (settled) return;
      if (!enabled) {
        finish(new TraceLocationError('DISABLED', 'Location services are off. Turn them on in your device settings.'));
        return;
      }
      const nextSubscription = await provider.watchPositionAsync({
        accuracy: ExpoLocation.Accuracy.High, distanceInterval: 0, timeInterval: 1_000,
      }, (position) => {
        if (settled || !isLatitude(position.coords.latitude) || !isLongitude(position.coords.longitude)) return;
        const fix: TraceLocation = { latitude: position.coords.latitude, longitude: position.coords.longitude,
          accuracy: position.coords.accuracy, timestamp: position.timestamp };
        if (Number.isFinite(fix.accuracy) && fix.accuracy !== null && fix.accuracy >= 0) {
          bestAccuracy = Math.min(bestAccuracy ?? Infinity, fix.accuracy);
        }
        if (isFreshLocation(fix)) finish(fix);
      }, () => finish(new TraceLocationError('UNAVAILABLE', 'Your location is unavailable. Move outdoors and try again.')));
      // Native subscriptions can resolve after their first callback or after cancellation.
      if (settled) nextSubscription.remove();
      else subscription = nextSubscription;
    })().catch(() => finish(new TraceLocationError('UNAVAILABLE', 'Your location is unavailable. Check location settings and try again.')));
  });
}
