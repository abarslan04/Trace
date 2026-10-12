import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getFreshLocation } from '../src/lib/location.web';

let success: PositionCallback;
let failure: PositionErrorCallback;
const watchPosition = vi.fn<Geolocation['watchPosition']>();
const clearWatch = vi.fn();
function position(accuracy = 8, timestamp = Date.now()): GeolocationPosition {
  return { coords: { latitude: 40.4237, longitude: -86.9212, accuracy, altitude: null,
    altitudeAccuracy: null, heading: null, speed: null, toJSON: () => ({}) }, timestamp, toJSON: () => ({}) };
}
function error(code: number): GeolocationPositionError {
  return { code, message: 'browser detail', PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 };
}
beforeEach(() => {
  vi.useFakeTimers(); vi.clearAllMocks();
  watchPosition.mockImplementation((onSuccess, onError) => {
    success = onSuccess; failure = onError!; return 73921;
  });
  // No navigator.permissions: location must still work.
  vi.stubGlobal('navigator', { geolocation: { watchPosition, clearWatch } });
  vi.stubGlobal('window', { isSecureContext: true });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('browser GPS acquisition', () => {
  it('accepts the first precise fix without permission probing and clears the actual browser ID', async () => {
    const result = getFreshLocation();
    expect(watchPosition).toHaveBeenCalledWith(expect.any(Function), expect.any(Function), {
      enableHighAccuracy: true, maximumAge: 0, timeout: 45_000,
    });
    success(position());
    await expect(result).resolves.toMatchObject({ latitude: 40.4237, accuracy: 8 });
    expect(clearWatch).toHaveBeenCalledExactlyOnceWith(73921);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('allows time for a permission prompt and GPS acquisition', async () => {
    const result = getFreshLocation();
    await vi.advanceTimersByTimeAsync(30_000);
    success(position());
    await expect(result).resolves.toMatchObject({ accuracy: 8 });
  });
  it('waits for a precise, fresh fix instead of using stale or approximate coordinates', async () => {
    const result = getFreshLocation();
    success(position(300)); success(position(8, Date.now() - 31_000));
    expect(clearWatch).not.toHaveBeenCalled();
    success(position(12));
    await expect(result).resolves.toMatchObject({ accuracy: 12 });
  });
  it.each([[1, 'DENIED'], [2, 'UNAVAILABLE'], [3, 'TIMEOUT']])('reports browser error %i immediately as %s', async (code, expected) => {
    const result = expect(getFreshLocation()).rejects.toMatchObject({ code: expected });
    failure(error(code as number)); await result;
    expect(clearWatch).toHaveBeenCalledExactlyOnceWith(73921);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('distinguishes approximate GPS from no callback at the deadline', async () => {
    const result = expect(getFreshLocation({ timeoutMs: 100 })).rejects.toMatchObject({ code: 'INACCURATE' });
    success(position(300));
    await vi.advanceTimersByTimeAsync(101); await result;
    expect(clearWatch).toHaveBeenCalledExactlyOnceWith(73921);
  });
  it('bounds a browser that never calls back', async () => {
    const result = expect(getFreshLocation({ timeoutMs: 100 })).rejects.toMatchObject({ code: 'TIMEOUT' });
    await vi.advanceTimersByTimeAsync(101); await result;
    expect(clearWatch).toHaveBeenCalledExactlyOnceWith(73921);
  });
  it('cancels, clears the watch, and ignores late results', async () => {
    const controller = new AbortController();
    const result = expect(getFreshLocation({ signal: controller.signal })).rejects.toMatchObject({ code: 'CANCELLED' });
    controller.abort(); success(position()); await result;
    expect(clearWatch).toHaveBeenCalledExactlyOnceWith(73921);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('does not request location when already aborted', async () => {
    const controller = new AbortController(); controller.abort();
    await expect(getFreshLocation({ signal: controller.signal })).rejects.toMatchObject({ code: 'CANCELLED' });
    expect(watchPosition).not.toHaveBeenCalled();
  });
  it('uses a new watch after denial and clears a browser ID of zero', async () => {
    const denied = expect(getFreshLocation()).rejects.toMatchObject({ code: 'DENIED' });
    failure(error(1)); await denied;
    watchPosition.mockImplementationOnce(onSuccess => { onSuccess(position()); return 0; });
    await expect(getFreshLocation()).resolves.toMatchObject({ accuracy: 8 });
    expect(clearWatch.mock.calls).toEqual([[73921], [0]]);
  });
  it('explains insecure origins without asking for permission', async () => {
    vi.stubGlobal('window', { isSecureContext: false });
    await expect(getFreshLocation()).rejects.toThrow('HTTPS');
    expect(watchPosition).not.toHaveBeenCalled();
  });
  it('handles missing browser support', async () => {
    vi.stubGlobal('navigator', {});
    await expect(getFreshLocation()).rejects.toMatchObject({ code: 'UNAVAILABLE' });
  });
  it('cleans up when starting a watch throws', async () => {
    watchPosition.mockImplementationOnce(() => { throw new Error('blocked'); });
    await expect(getFreshLocation()).rejects.toMatchObject({ code: 'UNAVAILABLE' });
    expect(vi.getTimerCount()).toBe(0);
  });
});
