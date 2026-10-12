import { describe, expect, it, vi } from 'vitest';
vi.mock('@react-native-async-storage/async-storage', () => ({ default: {} }));
import { createRouteStorage, parseSavedRoutes, ROUTE_STORAGE_KEY } from '../src/lib/storage';
import { deferred, saved } from './fixtures';

describe('saved routes', () => {
  it('round trips valid data and rejects corrupt, future, or mismatched records', () => {
    const value = saved();
    expect(parseSavedRoutes(JSON.stringify(value))).toEqual(value);
    expect(parseSavedRoutes('{bad')).toBeNull();
    expect(parseSavedRoutes(JSON.stringify({ ...value, selectedRouteId: 'missing' }))).toBeNull();
    expect(parseSavedRoutes(JSON.stringify({ ...value, savedAt: Date.now() + 120000 }))).toBeNull();
  });
  it('removes corrupted storage and keeps a recoverable warning', async () => {
    const storage = { getItem: vi.fn().mockResolvedValue('bad'), setItem: vi.fn(), removeItem: vi.fn() };
    const result = await createRouteStorage(storage).load();
    expect(result.data).toBeNull(); expect(result.warning).toBeTruthy();
    expect(storage.removeItem).toHaveBeenCalledWith(ROUTE_STORAGE_KEY);
  });
  it('reports write failures without throwing away generated routes', async () => {
    const storage = { getItem: vi.fn(), setItem: vi.fn().mockRejectedValue(new Error('disk full')), removeItem: vi.fn() };
    expect(await createRouteStorage(storage).save(saved())).toBe(false);
  });
  it('serializes writes so older saves cannot overwrite the latest selection', async () => {
    const first = deferred<void>();
    const storage = { getItem: vi.fn(), setItem: vi.fn().mockImplementationOnce(() => first.promise).mockResolvedValue(undefined), removeItem: vi.fn() };
    const service = createRouteStorage(storage);
    const value = saved();
    const a = service.save(value);
    const b = service.save({ ...value, savedAt: value.savedAt + 1 });
    await Promise.resolve(); expect(storage.setItem).toHaveBeenCalledTimes(1);
    first.resolve(); await Promise.all([a, b]);
    expect(JSON.parse(storage.setItem.mock.calls[1]?.[1]).savedAt).toBe(value.savedAt + 1);
  });
});
