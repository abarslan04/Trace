import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ request: vi.fn(), location: vi.fn(), load: vi.fn(), save: vi.fn(), listener: vi.fn() }));
vi.mock('react-native', () => ({ AppState: { currentState: 'active', addEventListener: mocks.listener }, Linking: { openSettings: vi.fn() } }));
vi.mock('../src/lib/api', async importOriginal => ({ ...await importOriginal<typeof import('../src/lib/api')>(), generateRoutes: mocks.request }));
vi.mock('../src/lib/location', () => ({ getFreshLocation: mocks.location, isFreshLocation: (value: unknown) => !!value,
  TraceLocationError: class extends Error { code = 'UNAVAILABLE'; } }));
vi.mock('../src/lib/storage', () => ({ routeStorage: { load: mocks.load, save: mocks.save } }));
import { useTrace } from '../src/hooks/useTrace';
import { deferred, route, saved } from './fixtures';
let current: ReturnType<typeof useTrace>;
let renderer: ReactTestRenderer | undefined;
function Harness() { current = useTrace(); return null; }
async function mount() { await act(async () => { renderer = create(<Harness/>); }); }
beforeEach(() => {
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  mocks.location.mockResolvedValue(saved().start);
  mocks.request.mockResolvedValue([route]);
  mocks.load.mockResolvedValue({ data: null, warning: null });
  mocks.save.mockResolvedValue(true);
  mocks.listener.mockReturnValue({ remove: vi.fn() });
});
afterEach(async () => { await act(async () => { renderer?.unmount(); }); });
describe('mobile orchestration', () => {
  it('gets GPS automatically and generates/selects/saves real response data', async () => {
    await mount(); expect(current.locationStatus).toBe('ready');
    await act(async () => { await current.generateRoutes(); });
    expect(current.routes).toEqual([route]); expect(current.generationStatus).toBe('success');
    expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ routes: [route] }));
  });
  it('prevents double taps from spending duplicate routing credits', async () => {
    const pending = deferred<typeof route[]>(); mocks.request.mockReturnValue(pending.promise);
    await mount();
    let first!: Promise<void>;
    await act(async () => { first = current.generateRoutes(); void current.generateRoutes(); });
    expect(mocks.request).toHaveBeenCalledOnce();
    await act(async () => { pending.resolve([route]); await first; });
  });
  it('does not accept a late response after cancellation', async () => {
    const pending = deferred<typeof route[]>(); mocks.request.mockReturnValue(pending.promise);
    await mount(); let job!: Promise<void>;
    await act(async () => { job = current.generateRoutes(); });
    await act(async () => { current.cancelGeneration(); });
    expect(mocks.request.mock.calls[0]?.[1].signal.aborted).toBe(true);
    await act(async () => { pending.resolve([route]); await job; });
    expect(current.routes).toEqual([]); expect(mocks.save).not.toHaveBeenCalled();
  });
  it('does not replace a newer distance choice with delayed disk restoration', async () => {
    const pending = deferred<{ data: ReturnType<typeof saved>; warning: null }>(); mocks.load.mockReturnValue(pending.promise);
    await mount();
    await act(async () => { current.setDistanceKm(10); });
    await act(async () => { pending.resolve({ data: saved(), warning: null }); });
    expect(current.distanceKm).toBe(10); expect(current.routes).toEqual([]);
  });
  it('restores route geometry without using its old start as current GPS', async () => {
    const historical = saved(); historical.start.longitude = 1;
    mocks.load.mockResolvedValue({ data: historical, warning: null });
    await mount();
    expect(current.isRestored).toBe(true);
    expect(current.routeStart?.longitude).toBe(1);
    expect(current.location?.longitude).not.toBe(1);
  });
  it('cancels outstanding network work on unmount', async () => {
    const pending = deferred<typeof route[]>(); mocks.request.mockReturnValue(pending.promise);
    await mount(); let job!: Promise<void>;
    await act(async () => { job = current.generateRoutes(); });
    await act(async () => { renderer?.unmount(); }); renderer = undefined;
    expect(mocks.request.mock.calls[0]?.[1].signal.aborted).toBe(true);
    pending.resolve([route]); await job;
    expect(mocks.save).not.toHaveBeenCalled();
  });
});
