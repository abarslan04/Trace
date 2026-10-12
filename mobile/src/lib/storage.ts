import AsyncStorage from '@react-native-async-storage/async-storage';
import type { SavedRouteSet } from './types';
import { isDistanceMeters, isFiniteNumber, isRecord, isTraceLocation, parseRoutes } from './validation';

export const ROUTE_STORAGE_KEY = '@trace/latest-routes-v1';
const MAX_STORED_LENGTH = 4_000_000;

type Storage = Pick<typeof AsyncStorage, 'getItem' | 'setItem' | 'removeItem'>;
export interface LoadRoutesResult { data: SavedRouteSet | null; warning: string | null }

export function parseSavedRoutes(raw: string, now = Date.now()): SavedRouteSet | null {
  if (raw.length > MAX_STORED_LENGTH) return null;
  let value: unknown;
  try { value = JSON.parse(raw); } catch { return null; }
  if (!isRecord(value) || value.version !== 1 || !isFiniteNumber(value.savedAt) || value.savedAt <= 0 ||
      value.savedAt > now + 60_000 || !isTraceLocation(value.start) || value.start.timestamp > value.savedAt + 60_000 ||
      !isDistanceMeters(value.requestedDistanceMeters) || typeof value.selectedRouteId !== 'string') return null;
  const routes = parseRoutes(value, value.requestedDistanceMeters);
  if (!routes || !routes.some((route) => route.id === value.selectedRouteId)) return null;
  return { version: 1, savedAt: value.savedAt, start: value.start,
    requestedDistanceMeters: value.requestedDistanceMeters, selectedRouteId: value.selectedRouteId, routes };
}

export function createRouteStorage(storage: Storage) {
  // Serialize saves so a slow write of an older selection cannot replace a new route set.
  let writeQueue = Promise.resolve();
  return {
    async load(): Promise<LoadRoutesResult> {
      try {
        const raw = await storage.getItem(ROUTE_STORAGE_KEY);
        if (raw === null) return { data: null, warning: null };
        const data = parseSavedRoutes(raw);
        if (data) return { data, warning: null };
        await storage.removeItem(ROUTE_STORAGE_KEY);
        return { data: null, warning: 'Your previous routes could not be restored. Generate a new route to continue.' };
      } catch {
        return { data: null, warning: 'Saved routes are unavailable on this device. You can still generate new routes.' };
      }
    },
    save(data: SavedRouteSet): Promise<boolean> {
      let result = false;
      const operation = writeQueue.then(async () => {
        try {
          const raw = JSON.stringify(data);
          if (!parseSavedRoutes(raw)) return;
          await storage.setItem(ROUTE_STORAGE_KEY, raw);
          result = true;
        } catch { /* Storage failure must not discard a valid route in memory. */ }
      });
      writeQueue = operation.catch(() => undefined);
      return operation.then(() => result);
    },
  };
}

export const routeStorage = createRouteStorage(AsyncStorage);
