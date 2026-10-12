import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Linking } from 'react-native';
import { generateRoutes as requestRoutes, RouteApiError } from '../lib/api';
import { getFreshLocation, isFreshLocation, TraceLocationError } from '../lib/location';
import { routeStorage } from '../lib/storage';
import type { SavedRouteSet, TraceLocation, TraceRoute } from '../lib/types';
import { isDistanceMeters } from '../lib/validation';

export type LocationStatus = 'idle' | 'loading' | 'ready' | 'denied' | 'error';
export type GenerationStatus = 'idle' | 'loading' | 'success' | 'error';

export function useTrace() {
  const [distanceKm, setDistanceState] = useState(5);
  const [location, setLocation] = useState<TraceLocation | null>(null);
  const [locationStatus, setLocationStatus] = useState<LocationStatus>('idle');
  const [locationError, setLocationError] = useState<string | null>(null);
  const [canAskAgain, setCanAskAgain] = useState(true);
  const [routes, setRoutes] = useState<TraceRoute[]>([]);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [generationStatus, setGenerationStatus] = useState<GenerationStatus>('idle');
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [routeStart, setRouteStart] = useState<TraceLocation | null>(null);
  const [isRestored, setIsRestored] = useState(false);
  const [storageWarning, setStorageWarning] = useState<string | null>(null);
  const [generatedDistanceKm, setGeneratedDistanceKm] = useState<number | null>(null);
  const mounted = useRef(false);
  const lifecycle = useRef(0);
  const distanceRef = useRef(5);
  const locationRef = useRef<TraceLocation | null>(null);
  const savedRef = useRef<SavedRouteSet | null>(null);
  const locationRequest = useRef<AbortController | null>(null);
  const generationRequest = useRef<AbortController | null>(null);
  const userIntent = useRef(0);
  const saveSequence = useRef(0);

  const cancelGeneration = useCallback(() => {
    const current = generationRequest.current;
    generationRequest.current = null;
    current?.abort();
    if (mounted.current) setGenerationStatus(savedRef.current ? 'success' : 'idle');
  }, []);

  const acquireLocation = useCallback(async (signal?: AbortSignal): Promise<TraceLocation | null> => {
    locationRequest.current?.abort();
    const controller = new AbortController();
    locationRequest.current = controller;
    const cancel = () => controller.abort();
    if (signal?.aborted) controller.abort();
    signal?.addEventListener('abort', cancel, { once: true });
    if (mounted.current) { setLocationStatus('loading'); setLocationError(null); }
    try {
      const fix = await getFreshLocation({ signal: controller.signal });
      if (mounted.current && locationRequest.current === controller && !controller.signal.aborted) {
        locationRef.current = fix;
        setLocation(fix);
        setLocationStatus('ready');
        setCanAskAgain(true);
        return fix;
      }
      return null;
    } catch (error) {
      if (mounted.current && locationRequest.current === controller) {
        if (error instanceof TraceLocationError && error.code === 'CANCELLED') {
          setLocationStatus(isFreshLocation(locationRef.current) ? 'ready' : 'idle');
        } else {
          locationRef.current = null;
          setLocation(null);
          setLocationStatus(error instanceof TraceLocationError && error.code === 'DENIED' ? 'denied' : 'error');
          setLocationError(error instanceof TraceLocationError ? error.message : 'Could not find your location. Please try again.');
          setCanAskAgain(error instanceof TraceLocationError ? error.canAskAgain : true);
        }
      }
      return null;
    } finally {
      signal?.removeEventListener('abort', cancel);
      if (locationRequest.current === controller) locationRequest.current = null;
    }
  }, []);

  const refreshLocation = useCallback(async () => {
    cancelGeneration();
    await acquireLocation();
  }, [acquireLocation, cancelGeneration]);

  const persist = useCallback(async (data: SavedRouteSet) => {
    const sequence = ++saveSequence.current;
    const success = await routeStorage.save(data);
    if (mounted.current && sequence === saveSequence.current) {
      setStorageWarning(success ? null : 'Your routes are ready, but could not be saved on this device.');
    }
  }, []);

  const generateRoutes = useCallback(async () => {
    // A synchronous guard also catches double taps before React can render the disabled button.
    if (generationRequest.current) return;
    const controller = new AbortController();
    generationRequest.current = controller;
    userIntent.current++;
    const requestedDistanceMeters = Math.round(distanceRef.current * 1000);
    setGenerationStatus('loading');
    setGenerationError(null);
    const isCurrent = () => mounted.current && generationRequest.current === controller && !controller.signal.aborted;
    try {
      const start = isFreshLocation(locationRef.current)
        ? locationRef.current : await acquireLocation(controller.signal);
      if (!isCurrent()) return;
      if (!start) { setGenerationStatus('idle'); return; }
      const result = await requestRoutes({ latitude: start.latitude, longitude: start.longitude,
        distanceMeters: requestedDistanceMeters, routeCount: 3 }, { signal: controller.signal });
      if (!isCurrent()) return;
      const firstRoute = result[0];
      if (!firstRoute) throw new RouteApiError('INVALID_RESPONSE', 'No routes were returned. Please try again.');
      const now = Date.now();
      const data: SavedRouteSet = { version: 1, savedAt: now, start, requestedDistanceMeters,
        selectedRouteId: firstRoute.id, routes: result };
      savedRef.current = data;
      setRoutes(result);
      setSelectedRouteId(firstRoute.id);
      setRouteStart(start);
      setSavedAt(now);
      setGeneratedDistanceKm(requestedDistanceMeters / 1000);
      setIsRestored(false);
      setGenerationStatus('success');
      void persist(data);
    } catch (error) {
      if (!isCurrent()) return;
      setGenerationStatus('error');
      setGenerationError(error instanceof RouteApiError ? error.message : 'Could not generate routes. Please try again.');
    } finally {
      if (generationRequest.current === controller) generationRequest.current = null;
    }
  }, [acquireLocation, persist]);

  const setDistanceKm = useCallback((value: number) => {
    const meters = Math.round(value * 1000);
    if (!Number.isFinite(value) || !isDistanceMeters(meters)) {
      setGenerationError('Choose a distance between 1 and 30 km.');
      return;
    }
    userIntent.current++;
    if (distanceRef.current !== meters / 1000) cancelGeneration();
    distanceRef.current = meters / 1000;
    setDistanceState(meters / 1000);
    setGenerationError(null);
  }, [cancelGeneration]);

  const selectRoute = useCallback((id: string) => {
    const previous = savedRef.current;
    if (!previous || !previous.routes.some((route) => route.id === id)) return;
    const data = { ...previous, selectedRouteId: id };
    savedRef.current = data;
    setSelectedRouteId(id);
    void persist(data);
  }, [persist]);

  const openLocationSettings = useCallback(async () => {
    try { await Linking.openSettings(); }
    catch { if (mounted.current) setLocationError('Open your device settings and allow precise location for Trace.'); }
  }, []);

  const clearGenerationError = useCallback(() => {
    setGenerationError(null);
    if (!generationRequest.current) setGenerationStatus(savedRef.current ? 'success' : 'idle');
  }, []);

  useEffect(() => {
    mounted.current = true;
    const epoch = ++lifecycle.current;
    const intent = userIntent.current;
    void acquireLocation();
    void routeStorage.load().then(({ data, warning }) => {
      if (!mounted.current || epoch !== lifecycle.current || intent !== userIntent.current) return;
      setStorageWarning(warning);
      if (!data) return;
      savedRef.current = data;
      setRoutes(data.routes);
      setSelectedRouteId(data.selectedRouteId);
      setSavedAt(data.savedAt);
      setRouteStart(data.start);
      setGeneratedDistanceKm(data.requestedDistanceMeters / 1000);
      setIsRestored(true);
      distanceRef.current = data.requestedDistanceMeters / 1000;
      setDistanceState(data.requestedDistanceMeters / 1000);
      setGenerationStatus('success');
      // Saved start coordinates belong to the route; never treat them as live GPS.
    });
    let previousState = AppState.currentState;
    const subscription = AppState.addEventListener('change', (next) => {
      if (previousState === 'background' && next === 'active' && !generationRequest.current) void acquireLocation();
      previousState = next;
    });
    return () => {
      mounted.current = false;
      lifecycle.current++;
      locationRequest.current?.abort();
      generationRequest.current?.abort();
      locationRequest.current = null;
      generationRequest.current = null;
      subscription.remove();
    };
  }, [acquireLocation]);

  return { distanceKm, setDistanceKm, location, locationStatus, locationError, canAskAgain, refreshLocation,
    openLocationSettings, routes, selectedRouteId,
    selectedRoute: routes.find((route) => route.id === selectedRouteId) ?? null,
    selectRoute, generationStatus, generationError, generateRoutes, cancelGeneration, clearGenerationError,
    savedAt, routeStart, generatedDistanceKm, isRestored, storageWarning };
}
