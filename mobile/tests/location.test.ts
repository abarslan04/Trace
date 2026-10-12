import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('expo-location', () => ({ Accuracy: { High: 4 } }));
import { getFreshLocation, isFreshLocation } from '../src/lib/location';
import { saved } from './fixtures';
const granted = { granted: true, canAskAgain: true, status: 'granted' as const, expires: 'never' as const };
function provider() {
  return { getForegroundPermissionsAsync: vi.fn().mockResolvedValue(granted), requestForegroundPermissionsAsync: vi.fn().mockResolvedValue(granted), hasServicesEnabledAsync: vi.fn().mockResolvedValue(true), watchPositionAsync: vi.fn() };
}
afterEach(() => vi.useRealTimers());
describe('GPS acquisition', () => {
  it('reuses permission, ignores inaccurate fixes, and removes the watch after a fresh fix', async () => {
    const source = provider(); const remove = vi.fn();
    source.watchPositionAsync.mockImplementation(async (_options, callback) => {
      callback({ coords: { latitude: 40, longitude: -86, accuracy: 1000 }, timestamp: Date.now() });
      callback({ coords: { latitude: 40, longitude: -86, accuracy: 8 }, timestamp: Date.now() });
      return { remove };
    });
    expect((await getFreshLocation({ provider: source })).accuracy).toBe(8);
    await Promise.resolve();
    expect(source.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
    expect(remove).toHaveBeenCalledOnce();
  });
  it('returns permanent denial without repeatedly asking', async () => {
    const source = provider(); source.getForegroundPermissionsAsync.mockResolvedValue({ ...granted, granted: false, canAskAgain: false });
    await expect(getFreshLocation({ provider: source })).rejects.toMatchObject({ code: 'DENIED', canAskAgain: false });
    expect(source.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
    expect(source.watchPositionAsync).not.toHaveBeenCalled();
  });
  it('reports disabled location services', async () => {
    const source = provider(); source.hasServicesEnabledAsync.mockResolvedValue(false);
    await expect(getFreshLocation({ provider: source })).rejects.toMatchObject({ code: 'DISABLED' });
  });
  it('times out imprecise GPS and stops watching', async () => {
    vi.useFakeTimers(); const source = provider(); const remove = vi.fn();
    source.watchPositionAsync.mockImplementation(async (_options, callback) => {
      callback({ coords: { latitude: 40, longitude: -86, accuracy: 250 }, timestamp: Date.now() });
      return { remove };
    });
    const result = expect(getFreshLocation({ provider: source, timeoutMs: 100 })).rejects.toMatchObject({ code: 'INACCURATE' });
    await vi.advanceTimersByTimeAsync(101); await result;
    expect(remove).toHaveBeenCalledOnce();
  });
  it('does not start native work when already cancelled', async () => {
    const source = provider(); const controller = new AbortController(); controller.abort();
    await expect(getFreshLocation({ provider: source, signal: controller.signal })).rejects.toMatchObject({ code: 'CANCELLED' });
    expect(source.getForegroundPermissionsAsync).not.toHaveBeenCalled();
  });
  it('does not treat stored or approximate coordinates as a fresh GPS fix', () => {
    expect(isFreshLocation(saved().start)).toBe(true);
    expect(isFreshLocation({ ...saved().start, timestamp: Date.now() - 31000 })).toBe(false);
    expect(isFreshLocation({ ...saved().start, accuracy: null })).toBe(false);
    expect(isFreshLocation({ ...saved().start, accuracy: 101 })).toBe(false);
  });
});
